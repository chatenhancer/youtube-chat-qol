/**
 * Normalized YouTube chat feed shared by extension consumers.
 *
 * The MAIN-world adapter owns the only fetch interception and parser. This
 * isolated-world source validates each sanitized batch once and fans it out to
 * every subscriber. Consumers join related data through stable message IDs and
 * must not depend on subscription order. This source never makes a network
 * request itself.
 */
import { parseYouTubeChatFeedBatchDetail } from './batch';
import {
  YOUTUBE_CHAT_FEED_BATCH_EVENT,
  YOUTUBE_CHAT_FEED_PROTOCOL_VERSION,
  type YouTubeChatFeedAction,
  type YouTubeChatFeedTransportBatch,
  type YouTubeChatFeedConsumer
} from './protocol';
import { dispatchYouTubeChatFeedControl } from './control';
import { isYouTubeChatFeedLocation } from './pages';
import { getMessageStableId } from '../messages';
import { NATIVE_CHAT_MESSAGE_SELECTOR } from '../selectors';

export type YouTubeChatFeedDelivery = 'replay-timeline' | 'transport';
export type YouTubeChatFeedActivity = 'existing' | 'new';
export type YouTubeChatFeedBatch = YouTubeChatFeedTransportBatch & {
  /** Whether this delivery belongs to startup state or became current afterward. */
  activity: YouTubeChatFeedActivity;
  delivery: YouTubeChatFeedDelivery;
  /** Preserves compatibility health when future replay actions are withheld. */
  transportHadUpsert?: boolean;
};
export type YouTubeChatFeedError =
  | 'action-backlog'
  | 'invalid-batch'
  | 'non-monotonic-sequence'
  | 'sequence-gap';

export interface YouTubeChatFeedSubscription {
  consumer: YouTubeChatFeedConsumer;
  onBatch: (batch: YouTubeChatFeedBatch) => void;
  onError?: (error: YouTubeChatFeedError) => void;
  requestInitial?: boolean;
}

const subscriptions = new Set<YouTubeChatFeedSubscription>();
const consumerCounts = new Map<YouTubeChatFeedConsumer, number>();
const MAX_PENDING_REPLAY_ACTIONS = 2_000;
const MAX_PENDING_REPLAY_ACTION_BYTES = 16 * 1024 * 1024;
const REPLAY_BACKWARD_SEEK_THRESHOLD_MS = 1_000;
const YOUTUBE_PLAYER_PROGRESS_KEY = 'yt-player-video-progress';

interface PendingReplayAction {
  action: YouTubeChatFeedAction;
  activity: YouTubeChatFeedActivity | null;
  batch: YouTubeChatFeedTransportBatch;
  bytes: number;
}

let listening = false;
let lastSequence = -1;
let pendingReplayActions: PendingReplayAction[] = [];
let pendingReplayActionBytes = 0;
let replayProgressMs: number | null = null;
let replayRequestsIdentifySeeks = false;

export function subscribeYouTubeChatFeed(
  subscription: YouTubeChatFeedSubscription
): () => void {
  ensureListening();
  subscriptions.add(subscription);

  const previousCount = consumerCounts.get(subscription.consumer) || 0;
  consumerCounts.set(subscription.consumer, previousCount + 1);
  if (previousCount === 0 || subscription.requestInitial) {
    dispatchYouTubeChatFeedControl({
      consumer: subscription.consumer,
      enabled: true,
      ...(subscription.requestInitial ? { requestInitial: true } : {})
    });
  }

  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    subscriptions.delete(subscription);

    const nextCount = Math.max(0, (consumerCounts.get(subscription.consumer) || 1) - 1);
    if (nextCount) {
      consumerCounts.set(subscription.consumer, nextCount);
    } else {
      consumerCounts.delete(subscription.consumer);
      dispatchYouTubeChatFeedControl({
        consumer: subscription.consumer,
        enabled: false
      });
    }

    if (!subscriptions.size) stopListening();
  };
}

export function isYouTubeChatFeedPage(locationValue: Location = window.location): boolean {
  return isYouTubeChatFeedLocation(locationValue);
}

export function getYouTubeChatFeedReplayDiagnostics(): {
  pendingActionBytes: number;
  pendingActions: number;
} {
  return {
    pendingActionBytes: pendingReplayActionBytes,
    pendingActions: pendingReplayActions.length
  };
}

/**
 * Reconciles replay actions with a connected native row YouTube has already
 * rendered. The row contributes only its stable ID; record data still comes
 * from the normalized feed.
 */
export function reconcileYouTubeChatFeedReplayWithRenderedMessage(
  message: HTMLElement
): boolean {
  const messageId = getConnectedNativeMessageId(message);
  if (!messageId || window.location.pathname !== '/live_chat_replay') return false;

  const matchingEntry = pendingReplayActions.find((entry) =>
    entry.action.type === 'upsert' &&
    entry.action.record.id === messageId &&
    entry.action.replayOffsetMs !== undefined
  );
  const replayOffsetMs = matchingEntry?.action.replayOffsetMs;
  if (replayOffsetMs === undefined) return false;

  if (replayProgressMs === null || replayOffsetMs > replayProgressMs) {
    replayProgressMs = replayOffsetMs;
    classifyPendingReplayActivity(replayOffsetMs);
  }
  drainPendingReplayActions();
  return getConnectedNativeMessageId(message) === messageId;
}

function getConnectedNativeMessageId(message: HTMLElement): string {
  if (!message.isConnected || !message.matches(NATIVE_CHAT_MESSAGE_SELECTOR)) return '';
  return getMessageStableId(message);
}

function ensureListening(): void {
  if (listening) return;
  listening = true;
  lastSequence = -1;
  window.addEventListener(YOUTUBE_CHAT_FEED_BATCH_EVENT, handleYouTubeChatFeedEvent);
  window.addEventListener('message', handleYouTubePlayerProgress);
}

function stopListening(): void {
  if (!listening) return;
  listening = false;
  lastSequence = -1;
  window.removeEventListener(YOUTUBE_CHAT_FEED_BATCH_EVENT, handleYouTubeChatFeedEvent);
  window.removeEventListener('message', handleYouTubePlayerProgress);
  clearReplayState();
}

function handleYouTubeChatFeedEvent(event: Event): void {
  if (!(event instanceof CustomEvent)) {
    reportFeedError('invalid-batch');
    return;
  }

  const batch = parseYouTubeChatFeedBatchDetail(event.detail);
  if (!batch) {
    reportFeedError('invalid-batch');
    return;
  }
  if (lastSequence >= 0 && batch.sequence !== lastSequence + 1) {
    reportFeedError(
      batch.sequence <= lastSequence ? 'non-monotonic-sequence' : 'sequence-gap'
    );
    return;
  }

  lastSequence = batch.sequence;
  deliverYouTubeChatFeedBatch(batch);
}

function deliverYouTubeChatFeedBatch(batch: YouTubeChatFeedTransportBatch): void {
  if (batch.source === 'replay' && batch.replayPlayerOffsetMs !== undefined) {
    replayRequestsIdentifySeeks = true;
    replayProgressMs = batch.replayPlayerOffsetMs;
    classifyPendingReplayActivity(replayProgressMs);
  }

  const hasReset = batch.actions.some((action) => action.type === 'reset');
  if (
    hasReset &&
    batch.source === 'replay' &&
    batch.replayPlayerOffsetMs === undefined
  ) {
    replayProgressMs = null;
  }
  const hasTimedReplayActions = batch.actions.some(hasReplayOffset);
  if (!hasReset && batch.source !== 'replay' && !hasTimedReplayActions) {
    runFeedBatch(createTransportBatch(batch, batch.actions));
    return;
  }

  if (hasReset) {
    clearReplayActionQueue();
    const immediateActions = batch.actions.filter((action) => !hasReplayOffset(action));
    const timedActions = batch.actions.filter(hasReplayOffset);
    const queued = enqueueReplayActions(timedActions, batch);
    runFeedBatch(createTransportBatch(batch, immediateActions));
    if (!queued) return;
    drainPendingReplayActions();
    return;
  }

  if (!enqueueReplayActions(batch.actions, batch)) return;
  runFeedBatch(createTransportBatch(batch, []));
  drainPendingReplayActions();
}

function createTransportBatch(
  batch: YouTubeChatFeedTransportBatch,
  actions: YouTubeChatFeedAction[]
): YouTubeChatFeedBatch {
  return {
    ...batch,
    activity: getTransportActivity(batch),
    actions,
    delivery: 'transport',
    ...(batch.actions.some((action) => action.type === 'upsert')
      ? { transportHadUpsert: true }
      : {})
  };
}

function enqueueReplayActions(
  actions: readonly YouTubeChatFeedAction[],
  batch: YouTubeChatFeedTransportBatch
): boolean {
  if (!actions.length) return true;
  const entries = actions.map((action) => ({
    action,
    activity: getPendingReplayActivity(action, batch),
    batch,
    bytes: getYouTubeChatFeedActionBytes(action)
  }));
  const addedBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
  if (
    pendingReplayActions.length + entries.length > MAX_PENDING_REPLAY_ACTIONS ||
    pendingReplayActionBytes + addedBytes > MAX_PENDING_REPLAY_ACTION_BYTES
  ) {
    clearReplayActionQueue();
    reportFeedError('action-backlog');
    return false;
  }

  pendingReplayActions.push(...entries);
  pendingReplayActionBytes += addedBytes;
  return true;
}

function drainPendingReplayActions(): void {
  if (!pendingReplayActions.length) return;
  let dueCount = 0;
  for (const entry of pendingReplayActions) {
    const offset = entry.action.replayOffsetMs;
    if (
      offset !== undefined &&
      offset > 0 &&
      (replayProgressMs === null || offset > replayProgressMs)
    ) {
      break;
    }
    dueCount += 1;
  }
  if (!dueCount) return;

  const dueEntries = pendingReplayActions.splice(0, dueCount);
  pendingReplayActionBytes = Math.max(
    0,
    pendingReplayActionBytes - dueEntries.reduce((total, entry) => total + entry.bytes, 0)
  );

  let index = 0;
  while (index < dueEntries.length) {
    const batch = dueEntries[index].batch;
    const activity = dueEntries[index].activity || 'existing';
    const actions: YouTubeChatFeedAction[] = [];
    while (
      index < dueEntries.length &&
      dueEntries[index].batch === batch &&
      (dueEntries[index].activity || 'existing') === activity
    ) {
      actions.push(dueEntries[index].action);
      index += 1;
    }
    runFeedBatch({
      activity,
      actions,
      delivery: 'replay-timeline',
      receivedAt: batch.receivedAt,
      sequence: batch.sequence,
      source: batch.source,
      version: batch.version
    });
  }
}

function handleYouTubePlayerProgress(event: MessageEvent): void {
  if (window.location.pathname !== '/live_chat_replay') return;
  if (!event.data || typeof event.data !== 'object' || Array.isArray(event.data)) return;
  const seconds = (event.data as Record<string, unknown>)[YOUTUBE_PLAYER_PROGRESS_KEY];
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return;
  const nextProgressMs = Math.round(seconds * 1_000);
  if (!Number.isSafeInteger(nextProgressMs)) return;

  if (
    !replayRequestsIdentifySeeks &&
    replayProgressMs !== null &&
    nextProgressMs < replayProgressMs - REPLAY_BACKWARD_SEEK_THRESHOLD_MS
  ) {
    clearReplayActionQueue();
    runFeedBatch({
      activity: 'existing',
      actions: [{ type: 'reset' }],
      delivery: 'replay-timeline',
      receivedAt: Date.now(),
      sequence: Math.max(0, lastSequence),
      source: 'replay',
      version: YOUTUBE_CHAT_FEED_PROTOCOL_VERSION
    });
  }
  replayProgressMs = nextProgressMs;
  classifyPendingReplayActivity(nextProgressMs);
  drainPendingReplayActions();
}

function getTransportActivity(
  batch: YouTubeChatFeedTransportBatch
): YouTubeChatFeedActivity {
  return batch.source === 'initial' || batch.snapshot === true || batch.startup === true
    ? 'existing'
    : 'new';
}

function getPendingReplayActivity(
  action: YouTubeChatFeedAction,
  batch: YouTubeChatFeedTransportBatch
): YouTubeChatFeedActivity | null {
  const resetsReplayTimeline = batch.source === 'replay' &&
    batch.actions.some((batchAction) => batchAction.type === 'reset');
  if (getTransportActivity(batch) === 'new' && !resetsReplayTimeline) return 'new';
  const offset = action.replayOffsetMs;
  if (offset === undefined || offset <= 0) return 'existing';
  if (replayProgressMs === null) return null;
  return offset > replayProgressMs ? 'new' : 'existing';
}

function classifyPendingReplayActivity(progressMs: number): void {
  pendingReplayActions.forEach((entry) => {
    if (entry.activity !== null) return;
    const offset = entry.action.replayOffsetMs;
    entry.activity = offset !== undefined && offset > progressMs ? 'new' : 'existing';
  });
}

function hasReplayOffset(action: YouTubeChatFeedAction): boolean {
  return action.type !== 'reset' && action.replayOffsetMs !== undefined;
}

function getYouTubeChatFeedActionBytes(action: YouTubeChatFeedAction): number {
  return JSON.stringify(action).length * 2;
}

function clearReplayActionQueue(): void {
  pendingReplayActions = [];
  pendingReplayActionBytes = 0;
}

function clearReplayState(): void {
  clearReplayActionQueue();
  replayProgressMs = null;
  replayRequestsIdentifySeeks = false;
}

function runFeedBatch(batch: YouTubeChatFeedBatch): void {
  subscriptions.forEach((subscription) => {
    try {
      subscription.onBatch(batch);
    } catch (error) {
      reportSubscriberError(error);
    }
  });
}

function reportFeedError(error: YouTubeChatFeedError): void {
  subscriptions.forEach((subscription) => {
    try {
      subscription.onError?.(error);
    } catch (subscriberError) {
      reportSubscriberError(subscriberError);
    }
  });
}

function reportSubscriberError(error: unknown): void {
  const reportError = (globalThis as { reportError?: (value: unknown) => void }).reportError;
  try {
    reportError?.(error);
  } catch {
    // One consumer must not prevent the other from receiving the same batch.
  }
}
