/**
 * Bounded keyed state for the optional Lite chat renderer.
 *
 * The transport can replay records, update an existing record, or remove one
 * message/author at any time. Keeping that behavior here lets the renderer stay
 * focused on DOM and scroll anchoring. The store retains more history than the
 * renderer mounts, but both limits are intentionally finite.
 */
import type { LiteChatAction, LiteChatMessageRecord } from './protocol';

export const DEFAULT_LITE_CHAT_RENDER_LIMIT = 150;
export const DEFAULT_LITE_CHAT_STORE_LIMIT = 500;
export const DEFAULT_LITE_CHAT_STORE_BYTE_LIMIT = 12 * 1024 * 1024;

const MAX_LITE_CHAT_STORE_BYTE_LIMIT = 128 * 1024 * 1024;
const ORDER_COMPACTION_MIN_TOMBSTONES = 256;

export interface LiteChatStoreChange {
  addedIds: string[];
  removedIds: string[];
  reset: boolean;
  updatedIds: string[];
}

export interface LiteChatStore {
  apply(actions: readonly LiteChatAction[]): LiteChatStoreChange;
  clear(): LiteChatStoreChange;
  get(id: string): LiteChatMessageRecord | null;
  getLatest(limit?: number): LiteChatMessageRecord[];
  getRecords(): LiteChatMessageRecord[];
  getRetainedBytes(): number;
  getSize(): number;
  subscribe(listener: LiteChatStoreListener): () => void;
}

export type LiteChatStoreListener = (change: LiteChatStoreChange) => void;

export interface CreateLiteChatStoreOptions {
  renderLimit?: number;
  storeByteLimit?: number;
  storeLimit?: number;
}

export function createLiteChatStore(options: CreateLiteChatStoreOptions = {}): LiteChatStore {
  const renderLimit = normalizeLimit(
    options.renderLimit,
    DEFAULT_LITE_CHAT_RENDER_LIMIT,
    DEFAULT_LITE_CHAT_STORE_LIMIT
  );
  const storeLimit = normalizeLimit(options.storeLimit, DEFAULT_LITE_CHAT_STORE_LIMIT, 10_000);
  const storeByteLimit = normalizeByteLimit(options.storeByteLimit);
  const effectiveRenderLimit = Math.min(renderLimit, storeLimit);
  const recordsById = new Map<string, LiteChatMessageRecord>();
  const recordBytesById = new Map<string, number>();
  const positionsById = new Map<string, number>();
  const orderedIds: Array<string | null> = [];
  const listeners = new Set<LiteChatStoreListener>();
  let orderHead = 0;
  let retainedBytes = 0;
  let tombstoneCount = 0;

  const getRecords = (): LiteChatMessageRecord[] => {
    const records: LiteChatMessageRecord[] = [];
    for (let index = orderHead; index < orderedIds.length; index += 1) {
      const id = orderedIds[index];
      if (!id) continue;
      const record = recordsById.get(id);
      if (record) records.push(record);
    }
    return records;
  };

  const notify = (change: LiteChatStoreChange): void => {
    if (!hasStoreChange(change)) return;
    listeners.forEach((listener) => listener(change));
  };

  const apply = (actions: readonly LiteChatAction[]): LiteChatStoreChange => {
    const addedIds = new Set<string>();
    const removedIds = new Set<string>();
    const updatedIds = new Set<string>();
    let reset = false;

    for (const action of actions) {
      switch (action.type) {
        case 'reset':
          recordsById.clear();
          recordBytesById.clear();
          positionsById.clear();
          orderedIds.length = 0;
          orderHead = 0;
          retainedBytes = 0;
          tombstoneCount = 0;
          addedIds.clear();
          updatedIds.clear();
          removedIds.clear();
          reset = true;
          break;
        case 'upsert': {
          const id = cleanId(action.record.id);
          if (!id) break;
          const existingRecord = recordsById.get(id);
          const serializedRecord = JSON.stringify(action.record);

          if (existingRecord) {
            if (JSON.stringify(existingRecord) === serializedRecord) break;
            retainedBytes -= recordBytesById.get(id) || 0;
            recordsById.set(id, action.record);
            const nextRecordBytes = serializedRecord.length * 2;
            recordBytesById.set(id, nextRecordBytes);
            retainedBytes += nextRecordBytes;
            if (!addedIds.has(id)) updatedIds.add(id);
          } else {
            recordsById.set(id, action.record);
            const nextRecordBytes = serializedRecord.length * 2;
            recordBytesById.set(id, nextRecordBytes);
            retainedBytes += nextRecordBytes;
            positionsById.set(id, orderedIds.length);
            orderedIds.push(id);
            addedIds.add(id);
            removedIds.delete(id);
          }
          break;
        }
        case 'remove':
          removeRecord(action.id, removedIds);
          addedIds.delete(action.id);
          updatedIds.delete(action.id);
          break;
        case 'remove-author': {
          const channelId = cleanId(action.channelId);
          if (!channelId) break;
          for (const id of [...recordsById.keys()]) {
            if (recordsById.get(id)?.author?.channelId !== channelId) continue;
            removeRecord(id, removedIds);
            addedIds.delete(id);
            updatedIds.delete(id);
          }
          break;
        }
      }
    }

    while (recordsById.size > storeLimit || retainedBytes > storeByteLimit) {
      const oldestId = removeOldestRecord(removedIds);
      if (!oldestId) break;
      addedIds.delete(oldestId);
      updatedIds.delete(oldestId);
    }
    compactOrderIfNeeded();

    const change = {
      addedIds: [...addedIds],
      removedIds: [...removedIds],
      reset,
      updatedIds: [...updatedIds]
    };
    notify(change);
    return change;
  };

  return {
    apply,
    clear: () => apply([{ type: 'reset' }]),
    get: (id) => recordsById.get(id) || null,
    getLatest: (limit = effectiveRenderLimit) => {
      const safeLimit = normalizeLimit(limit, effectiveRenderLimit, storeLimit);
      const records: LiteChatMessageRecord[] = [];
      for (let index = orderedIds.length - 1; index >= orderHead; index -= 1) {
        const id = orderedIds[index];
        if (!id) continue;
        const record = recordsById.get(id);
        if (record) records.push(record);
        if (records.length >= safeLimit) break;
      }
      return records.reverse();
    },
    getRecords,
    getRetainedBytes: () => retainedBytes,
    getSize: () => recordsById.size,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  function removeRecord(rawId: string, removedIds: Set<string>): boolean {
    const id = cleanId(rawId);
    if (!id || !recordsById.delete(id)) return false;
    retainedBytes -= recordBytesById.get(id) || 0;
    recordBytesById.delete(id);
    const position = positionsById.get(id);
    positionsById.delete(id);
    if (position !== undefined && orderedIds[position] !== null) {
      orderedIds[position] = null;
      tombstoneCount += 1;
    }
    removedIds.add(id);
    return true;
  }

  function removeOldestRecord(removedIds: Set<string>): string {
    while (orderHead < orderedIds.length) {
      const id = orderedIds[orderHead];
      orderedIds[orderHead] = null;
      orderHead += 1;
      if (!id || !recordsById.has(id)) continue;
      tombstoneCount += 1;
      removeRecord(id, removedIds);
      return id;
    }
    return '';
  }

  function compactOrderIfNeeded(): void {
    const shouldCompactHead = orderHead >= ORDER_COMPACTION_MIN_TOMBSTONES;
    const shouldCompactTombstones =
      tombstoneCount >= ORDER_COMPACTION_MIN_TOMBSTONES && tombstoneCount >= recordsById.size;
    const shouldCompactLength = orderedIds.length > Math.max(64, storeLimit * 2);
    if (!shouldCompactHead && !shouldCompactTombstones && !shouldCompactLength) return;

    const activeIds: string[] = [];
    for (let index = orderHead; index < orderedIds.length; index += 1) {
      const id = orderedIds[index];
      if (id && recordsById.has(id)) activeIds.push(id);
    }
    orderedIds.length = 0;
    orderedIds.push(...activeIds);
    positionsById.clear();
    activeIds.forEach((id, index) => positionsById.set(id, index));
    orderHead = 0;
    tombstoneCount = 0;
  }
}

function hasStoreChange(change: LiteChatStoreChange): boolean {
  return (
    change.reset ||
    change.addedIds.length > 0 ||
    change.updatedIds.length > 0 ||
    change.removedIds.length > 0
  );
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value || fallback)));
}

function normalizeByteLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LITE_CHAT_STORE_BYTE_LIMIT;
  return Math.max(1, Math.min(MAX_LITE_CHAT_STORE_BYTE_LIMIT, Math.trunc(value || 0)));
}

function cleanId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
