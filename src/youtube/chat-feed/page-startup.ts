/** Bounded startup snapshot and buffering for the page-world chat feed. */
import { parseYouTubeChatFeedPayload } from './parser';
import type { YouTubeChatFeedBatchValues } from './page-events';
import type {
  YouTubeChatFeedAction,
  YouTubeChatFeedBatchSource,
  YouTubeChatFeedTransportBatch
} from './protocol';

type DataRecord = Record<string, unknown>;
type NativeChatRenderer = HTMLElement & { data?: unknown };
type StartupMetadata = Pick<
  YouTubeChatFeedTransportBatch,
  | 'compatibilityWarnings'
  | 'continuationTimeoutMs'
  | 'fatalErrors'
  | 'replayPlayerOffsetMs'
  | 'unreadableFeed'
>;

export const MAX_YOUTUBE_CHAT_FEED_SEED_ACTIONS = 499;

export interface YouTubeChatFeedInitialSnapshot extends StartupMetadata {
  actions: YouTubeChatFeedAction[];
}

export interface YouTubeChatFeedStartupBuffer {
  addInitialSnapshot(snapshot: YouTubeChatFeedInitialSnapshot): void;
  beginInitialSnapshot(): 'bootstrap' | 'rendered' | null;
  flush(receivedAt: number): YouTubeChatFeedBatchValues[];
  rememberBatch(values: YouTubeChatFeedBatchValues): void;
  reset(): void;
}

const YOUTUBE_INITIAL_DATA_ASSIGNMENT = 'window["ytInitialData"] = ';
const MAX_YOUTUBE_INITIAL_DATA_SCRIPT_LENGTH = 8 * 1024 * 1024;
const NATIVE_CHAT_FEED_RENDERER_KEYS: Record<string, string> = {
  'yt-gift-message-view-model': 'giftMessageViewModel',
  'yt-live-chat-membership-item-renderer': 'liveChatMembershipItemRenderer',
  'yt-live-chat-paid-message-renderer': 'liveChatPaidMessageRenderer',
  'yt-live-chat-paid-sticker-renderer': 'liveChatPaidStickerRenderer',
  'yt-live-chat-sponsorships-gift-purchase-announcement-renderer':
    'liveChatSponsorshipsGiftPurchaseAnnouncementRenderer',
  'yt-live-chat-sponsorships-gift-redemption-announcement-renderer':
    'liveChatSponsorshipsGiftRedemptionAnnouncementRenderer',
  'yt-live-chat-text-message-renderer': 'liveChatTextMessageRenderer'
};
const NATIVE_CHAT_FEED_RENDERER_SELECTOR = Object.keys(
  NATIVE_CHAT_FEED_RENDERER_KEYS
).join(',');

export function captureYouTubeChatFeedInitialSnapshot(): YouTubeChatFeedInitialSnapshot {
  const embeddedInitialData = readEmbeddedYouTubeInitialData();
  const parsedInitial = embeddedInitialData === undefined
    ? null
    : parseYouTubeChatFeedPayload(embeddedInitialData, { initial: true });
  const initialActions =
    parsedInitial?.actions.filter((action) => action.type !== 'reset') || [];
  if (parsedInitial && initialActions.length) {
    return createYouTubeChatFeedInitialSnapshot(initialActions, parsedInitial);
  }

  const parsedNativeRows = parseNativeChatFeedRows();
  return createYouTubeChatFeedInitialSnapshot(
    parsedNativeRows.actions.filter((action) => action.type === 'upsert'),
    parsedNativeRows,
    parsedInitial
  );
}

export function captureYouTubeChatFeedRenderedSnapshot(): YouTubeChatFeedInitialSnapshot {
  const parsedNativeRows = parseNativeChatFeedRows();
  return createYouTubeChatFeedInitialSnapshot(
    parsedNativeRows.actions.filter((action) => action.type === 'upsert'),
    parsedNativeRows
  );
}

function createYouTubeChatFeedInitialSnapshot(
  actions: YouTubeChatFeedAction[],
  primary: ReturnType<typeof parseYouTubeChatFeedPayload>,
  fallback?: ReturnType<typeof parseYouTubeChatFeedPayload> | null
): YouTubeChatFeedInitialSnapshot {
  return {
    actions: actions.slice(-MAX_YOUTUBE_CHAT_FEED_SEED_ACTIONS),
    compatibilityWarnings: [
      ...primary.compatibilityWarnings,
      ...(fallback?.compatibilityWarnings || [])
    ],
    continuationTimeoutMs:
      primary.continuationTimeoutMs ?? fallback?.continuationTimeoutMs,
    fatalErrors: [
      ...primary.fatalErrors,
      ...(fallback?.fatalErrors || [])
    ],
    unreadableFeed: Boolean(primary.unreadableFeed || fallback?.unreadableFeed)
  };
}

export function createYouTubeChatFeedStartupBuffer(): YouTubeChatFeedStartupBuffer {
  let initialActions: YouTubeChatFeedAction[] = [];
  let preReadyActions: YouTubeChatFeedAction[] = [];
  let preReadyCompatibilityWarnings: string[] = [];
  let preReadyContinuationTimeoutMs: number | undefined;
  let preReadyFatalErrors: string[] = [];
  let preReadyReplayPlayerOffsetMs: number | undefined;
  let preReadySource: Extract<YouTubeChatFeedBatchSource, 'live' | 'replay'> | undefined;
  let preReadyUnreadableFeed = false;
  let initialSnapshotBuffered = false;
  let receiverReady = false;

  const rememberMetadata = (values: StartupMetadata): void => {
    if (receiverReady) return;
    if (values.continuationTimeoutMs !== undefined) {
      preReadyContinuationTimeoutMs = values.continuationTimeoutMs;
    }
    if (values.replayPlayerOffsetMs !== undefined) {
      preReadyReplayPlayerOffsetMs = values.replayPlayerOffsetMs;
    }
    if (values.compatibilityWarnings?.length) {
      preReadyCompatibilityWarnings = [...new Set([
        ...preReadyCompatibilityWarnings,
        ...values.compatibilityWarnings
      ])].slice(0, 32);
    }
    if (values.fatalErrors?.length) {
      preReadyFatalErrors = [...new Set([
        ...preReadyFatalErrors,
        ...values.fatalErrors
      ])].slice(0, 32);
    }
    if (values.unreadableFeed) preReadyUnreadableFeed = true;
  };

  const clearBufferedValues = (): void => {
    initialActions = [];
    preReadyActions = [];
    preReadyCompatibilityWarnings = [];
    preReadyContinuationTimeoutMs = undefined;
    preReadyFatalErrors = [];
    preReadyReplayPlayerOffsetMs = undefined;
    preReadySource = undefined;
    preReadyUnreadableFeed = false;
  };

  return {
    addInitialSnapshot(snapshot): void {
      initialActions = mergeYouTubeChatFeedStartupActions(initialActions, snapshot.actions);
      rememberMetadata(snapshot);
    },

    beginInitialSnapshot(): 'bootstrap' | 'rendered' | null {
      if (receiverReady) {
        clearBufferedValues();
        receiverReady = false;
        initialSnapshotBuffered = true;
        return 'rendered';
      }
      if (initialSnapshotBuffered && initialActions.length) return null;
      initialSnapshotBuffered = true;
      return 'bootstrap';
    },

    flush(receivedAt): YouTubeChatFeedBatchValues[] {
      if (receiverReady) return [];
      receiverReady = true;
      const actions = mergeYouTubeChatFeedStartupActions(initialActions, preReadyActions);
      const compatibilityWarnings = preReadyCompatibilityWarnings;
      const continuationTimeoutMs = preReadyContinuationTimeoutMs;
      const fatalErrors = preReadyFatalErrors;
      const replayPlayerOffsetMs = preReadyReplayPlayerOffsetMs;
      const source = preReadySource;
      const unreadableFeed = preReadyUnreadableFeed;
      clearBufferedValues();
      initialSnapshotBuffered = false;

      const batches: YouTubeChatFeedBatchValues[] = [{
        actions: [{ type: 'reset' }, ...actions],
        compatibilityWarnings,
        continuationTimeoutMs,
        fatalErrors,
        receivedAt,
        source: 'initial',
        unreadableFeed
      }];
      if (source) {
        batches.push({
          actions: [],
          continuationTimeoutMs,
          receivedAt,
          ...(replayPlayerOffsetMs !== undefined ? { replayPlayerOffsetMs } : {}),
          source
        });
      }
      return batches;
    },

    rememberBatch(values): void {
      if (receiverReady) return;
      if (values.source === 'live' || values.source === 'replay') {
        preReadySource = values.source;
      }
      for (const action of values.actions) {
        if (action.type === 'reset') {
          initialActions = [];
          preReadyActions = [];
          continue;
        }
        preReadyActions.push(action);
      }
      preReadyActions = preReadyActions.slice(-MAX_YOUTUBE_CHAT_FEED_SEED_ACTIONS);
      rememberMetadata(values);
    },

    reset(): void {
      clearBufferedValues();
      initialSnapshotBuffered = false;
      receiverReady = false;
    }
  };
}

function readEmbeddedYouTubeInitialData(): unknown {
  for (const script of Array.from(document.scripts).slice(0, 64)) {
    const text = script.textContent?.trim();
    if (
      !text ||
      text.length > MAX_YOUTUBE_INITIAL_DATA_SCRIPT_LENGTH ||
      !text.startsWith(YOUTUBE_INITIAL_DATA_ASSIGNMENT) ||
      !text.endsWith(';')
    ) {
      continue;
    }
    try {
      return JSON.parse(text.slice(YOUTUBE_INITIAL_DATA_ASSIGNMENT.length, -1));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function mergeYouTubeChatFeedStartupActions(
  existing: readonly YouTubeChatFeedAction[],
  incoming: readonly YouTubeChatFeedAction[]
): YouTubeChatFeedAction[] {
  const merged = [...existing];
  for (const action of incoming) {
    if (action.type === 'reset') {
      merged.length = 0;
      continue;
    }
    if (action.type === 'upsert') {
      const previousIndex = merged.findIndex(
        (candidate) => candidate.type === 'upsert' && candidate.record.id === action.record.id
      );
      if (previousIndex >= 0) merged.splice(previousIndex, 1);
    }
    merged.push(action);
  }
  return merged.slice(-MAX_YOUTUBE_CHAT_FEED_SEED_ACTIONS);
}

function parseNativeChatFeedRows(): ReturnType<typeof parseYouTubeChatFeedPayload> {
  const actions = Array.from(
    document.querySelectorAll<NativeChatRenderer>(NATIVE_CHAT_FEED_RENDERER_SELECTOR)
  ).slice(-MAX_YOUTUBE_CHAT_FEED_SEED_ACTIONS).flatMap((message) => {
    const rendererKey = NATIVE_CHAT_FEED_RENDERER_KEYS[message.tagName.toLowerCase()];
    if (!rendererKey) return [];
    const rendererData = asDataRecord(message.data);
    if (!rendererData) return [];
    const id = getTextValue(rendererData.id) || getMessageId(message);
    if (!id) return [];
    return [{
      addChatItemAction: {
        item: {
          [rendererKey]: getTextValue(rendererData.id) ? rendererData : { ...rendererData, id }
        }
      }
    }];
  });
  const parsed = parseYouTubeChatFeedPayload({ actions });
  return {
    ...parsed,
    compatibilityWarnings: [],
    fatalErrors: [],
    unreadableFeed: false
  };
}

function asDataRecord(value: unknown): DataRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as DataRecord
    : null;
}

function getMessageId(message: HTMLElement): string {
  return cleanText(message.getAttribute('data-message-id') || message.id || '');
}

function getTextValue(value: unknown): string {
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'bigint') return value.toString();
  return '';
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
