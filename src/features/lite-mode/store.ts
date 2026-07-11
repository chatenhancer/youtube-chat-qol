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
export const DEFAULT_LITE_CHAT_STORE_LIMIT = 1_000;

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
  getSize(): number;
  subscribe(listener: LiteChatStoreListener): () => void;
}

export type LiteChatStoreListener = (
  change: LiteChatStoreChange,
  records: readonly LiteChatMessageRecord[]
) => void;

export interface CreateLiteChatStoreOptions {
  renderLimit?: number;
  storeLimit?: number;
}

export function createLiteChatStore(
  options: CreateLiteChatStoreOptions = {}
): LiteChatStore {
  const renderLimit = normalizeLimit(
    options.renderLimit,
    DEFAULT_LITE_CHAT_RENDER_LIMIT,
    DEFAULT_LITE_CHAT_STORE_LIMIT
  );
  const storeLimit = normalizeLimit(
    options.storeLimit,
    DEFAULT_LITE_CHAT_STORE_LIMIT,
    10_000
  );
  const effectiveRenderLimit = Math.min(renderLimit, storeLimit);
  const recordsById = new Map<string, LiteChatMessageRecord>();
  const orderedIds: string[] = [];
  const listeners = new Set<LiteChatStoreListener>();

  const getRecords = (): LiteChatMessageRecord[] => {
    return orderedIds
      .map((id) => recordsById.get(id))
      .filter((record): record is LiteChatMessageRecord => Boolean(record));
  };

  const notify = (change: LiteChatStoreChange): void => {
    if (!hasStoreChange(change)) return;
    const records = getRecords();
    listeners.forEach((listener) => listener(change, records));
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
          orderedIds.length = 0;
          addedIds.clear();
          updatedIds.clear();
          removedIds.clear();
          reset = true;
          break;
        case 'upsert': {
          const id = cleanId(action.record.id);
          if (!id) break;
          const existingRecord = recordsById.get(id);

          if (existingRecord) {
            if (recordsMatch(existingRecord, action.record)) break;
            recordsById.set(id, action.record);
            if (!addedIds.has(id)) updatedIds.add(id);
          } else {
            recordsById.set(id, action.record);
            orderedIds.push(id);
            addedIds.add(id);
            removedIds.delete(id);
          }
          break;
        }
        case 'remove':
          removeRecord(action.id, recordsById, orderedIds, removedIds);
          addedIds.delete(action.id);
          updatedIds.delete(action.id);
          break;
        case 'remove-author': {
          const channelId = cleanId(action.channelId);
          if (!channelId) break;
          for (const id of [...orderedIds]) {
            if (recordsById.get(id)?.author?.channelId !== channelId) continue;
            removeRecord(id, recordsById, orderedIds, removedIds);
            addedIds.delete(id);
            updatedIds.delete(id);
          }
          break;
        }
      }
    }

    while (orderedIds.length > storeLimit) {
      const oldestId = orderedIds.shift();
      if (!oldestId) break;
      recordsById.delete(oldestId);
      addedIds.delete(oldestId);
      updatedIds.delete(oldestId);
      removedIds.add(oldestId);
    }

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
      return orderedIds
        .slice(-safeLimit)
        .map((id) => recordsById.get(id))
        .filter((record): record is LiteChatMessageRecord => Boolean(record));
    },
    getRecords,
    getSize: () => recordsById.size,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function removeRecord(
  rawId: string,
  recordsById: Map<string, LiteChatMessageRecord>,
  orderedIds: string[],
  removedIds: Set<string>
): void {
  const id = cleanId(rawId);
  if (!id || !recordsById.delete(id)) return;
  const index = orderedIds.indexOf(id);
  if (index >= 0) orderedIds.splice(index, 1);
  removedIds.add(id);
}

function hasStoreChange(change: LiteChatStoreChange): boolean {
  return change.reset ||
    change.addedIds.length > 0 ||
    change.updatedIds.length > 0 ||
    change.removedIds.length > 0;
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.trunc(value || fallback)));
}

function cleanId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function recordsMatch(first: LiteChatMessageRecord, second: LiteChatMessageRecord): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}
