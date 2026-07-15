/**
 * Current normalized YouTube chat records keyed by stable message ID.
 *
 * The store consumes the shared feed after replay pacing, so features never
 * observe prefetched replay messages before their playback position. Native
 * DOM rows use their stable IDs only to find the corresponding feed record.
 */
import type { YouTubeChatMessageRecord } from './protocol';
import { getMessageStableId } from '../messages';
import {
  CHAT_MESSAGE_SELECTOR,
  NATIVE_CHAT_MESSAGE_SELECTOR
} from '../selectors';
import { dispatchYouTubeChatFeedControl } from './control';
import {
  reconcileYouTubeChatFeedReplayWithRenderedMessage,
  subscribeYouTubeChatFeed,
  type YouTubeChatFeedBatch
} from './source';

const RECORD_LIMIT = 800;
const PENDING_RECORD_LIMIT = 800;
const PENDING_RECORD_TIMEOUT_MS = 1_500;

interface PendingChatFeedRecord {
  promise: Promise<YouTubeChatMessageRecord | null>;
  resolve: (record: YouTubeChatMessageRecord | null) => void;
  timeoutId: number;
}

const recordsById = new Map<string, YouTubeChatMessageRecord>();
const pendingRecordsById = new Map<string, PendingChatFeedRecord>();
let ready = false;
let renderedSnapshotRequestPending = false;
let renderedSnapshotRequestTimeoutId = 0;
let unsubscribe: (() => void) | null = null;

export type YouTubeChatFeedRecord = YouTubeChatMessageRecord;

export function startYouTubeChatFeedRecordStore(): void {
  if (unsubscribe) return;
  unsubscribe = subscribeYouTubeChatFeed({
    consumer: 'records',
    onBatch: applyYouTubeChatFeedRecordBatch,
    requestInitial: true
  });
}

export function stopYouTubeChatFeedRecordStore(): void {
  unsubscribe?.();
  unsubscribe = null;
  ready = false;
  clearRenderedSnapshotRequest();
  clearYouTubeChatFeedRecords();
  resolveAllPendingRecords(null);
}

export function getYouTubeChatFeedRecord(
  messageOrId: HTMLElement | string
): YouTubeChatMessageRecord | null {
  const messageId = getChatFeedMessageId(messageOrId);
  return messageId ? recordsById.get(messageId) || null : null;
}

/** Current feed state for consumers that start after initial collection. */
export function getYouTubeChatFeedRecordState(): {
  ready: boolean;
  records: YouTubeChatMessageRecord[];
} {
  return {
    ready,
    records: [...recordsById.values()]
  };
}

export function requestYouTubeChatFeedRecord(
  messageOrId: HTMLElement | string
): Promise<YouTubeChatMessageRecord | null> {
  const messageId = getChatFeedMessageId(messageOrId);
  if (!messageId) return Promise.resolve(null);

  const record = recordsById.get(messageId);
  if (record) return Promise.resolve(record);

  const pending = pendingRecordsById.get(messageId);
  if (pending) return pending.promise;

  return createPendingRecordRequest(messageId).promise;
}

/**
 * Resolves feed data for a row that is currently rendered in chat. Native
 * replay rows may reconcile a matching paced action before the normal wait;
 * arbitrary ID lookups never advance the replay timeline.
 */
export function requestRenderedYouTubeChatFeedRecord(
  message: HTMLElement
): Promise<YouTubeChatMessageRecord | null> {
  const messageId = getConnectedRenderedMessageId(message);
  if (!messageId) return Promise.resolve(null);

  const record = recordsById.get(messageId);
  if (record) return Promise.resolve(record);

  const reconciled = reconcileYouTubeChatFeedReplayWithRenderedMessage(message);
  if (getConnectedRenderedMessageId(message) !== messageId) {
    return Promise.resolve(null);
  }

  const pending = requestYouTubeChatFeedRecord(messageId);
  if (!reconciled) requestRenderedSnapshotIfNeeded(message);
  return pending;
}

function applyYouTubeChatFeedRecordBatch(batch: YouTubeChatFeedBatch): void {
  ready = true;
  batch.actions.forEach((action) => {
    if (action.type === 'reset') {
      clearYouTubeChatFeedRecords();
      return;
    }
    if (action.type === 'upsert') {
      rememberYouTubeChatFeedRecord(action.record);
      return;
    }
    if (action.type === 'remove') {
      recordsById.delete(action.id);
      resolvePendingRecord(action.id, null);
      return;
    }

    for (const [messageId, record] of recordsById) {
      if (record.author?.channelId === action.channelId) recordsById.delete(messageId);
    }
  });
  if (batch.source === 'initial') clearRenderedSnapshotRequest();
}

function rememberYouTubeChatFeedRecord(record: YouTubeChatMessageRecord): void {
  recordsById.delete(record.id);
  recordsById.set(record.id, record);
  resolvePendingRecord(record.id, record);

  while (recordsById.size > RECORD_LIMIT) {
    const oldestId = recordsById.keys().next().value;
    if (!oldestId) return;
    recordsById.delete(oldestId);
  }
}

function clearYouTubeChatFeedRecords(): void {
  recordsById.clear();
}

function getChatFeedMessageId(messageOrId: HTMLElement | string): string {
  return typeof messageOrId === 'string'
    ? messageOrId.trim()
    : getMessageStableId(messageOrId);
}

function getConnectedRenderedMessageId(message: HTMLElement): string {
  if (!message.isConnected || !message.matches(CHAT_MESSAGE_SELECTOR)) return '';
  return getMessageStableId(message);
}

function requestRenderedSnapshotIfNeeded(message: HTMLElement): void {
  if (
    !ready ||
    renderedSnapshotRequestPending ||
    !message.matches(NATIVE_CHAT_MESSAGE_SELECTOR)
  ) {
    return;
  }

  renderedSnapshotRequestPending = true;
  dispatchYouTubeChatFeedControl({
    consumer: 'records',
    enabled: true,
    requestRendered: true
  });
  renderedSnapshotRequestTimeoutId = window.setTimeout(
    clearRenderedSnapshotRequest,
    PENDING_RECORD_TIMEOUT_MS
  );
}

function clearRenderedSnapshotRequest(): void {
  if (renderedSnapshotRequestTimeoutId) {
    window.clearTimeout(renderedSnapshotRequestTimeoutId);
    renderedSnapshotRequestTimeoutId = 0;
  }
  renderedSnapshotRequestPending = false;
}

function createPendingRecordRequest(messageId: string): PendingChatFeedRecord {
  let resolveRequest: (record: YouTubeChatMessageRecord | null) => void = () => undefined;
  const promise = new Promise<YouTubeChatMessageRecord | null>((resolve) => {
    resolveRequest = resolve;
  });
  const timeoutId = window.setTimeout(() => {
    resolvePendingRecord(messageId, null);
  }, PENDING_RECORD_TIMEOUT_MS);
  const request: PendingChatFeedRecord = {
    promise,
    resolve: resolveRequest,
    timeoutId
  };
  pendingRecordsById.set(messageId, request);
  enforcePendingRecordLimit();
  return request;
}

function resolvePendingRecord(
  messageId: string,
  record: YouTubeChatMessageRecord | null
): void {
  const request = pendingRecordsById.get(messageId);
  if (!request) return;
  pendingRecordsById.delete(messageId);
  window.clearTimeout(request.timeoutId);
  request.resolve(record);
}

function resolveAllPendingRecords(record: null): void {
  [...pendingRecordsById.keys()].forEach((messageId) => {
    resolvePendingRecord(messageId, record);
  });
}

function enforcePendingRecordLimit(): void {
  while (pendingRecordsById.size > PENDING_RECORD_LIMIT) {
    const oldestId = pendingRecordsById.keys().next().value;
    if (!oldestId) return;
    resolvePendingRecord(oldestId, null);
  }
}
