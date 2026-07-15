/** Serialization helpers for the page-world YouTube chat feed boundary. */
import {
  MAX_YOUTUBE_CHAT_FEED_BATCH_ACTIONS,
  MAX_YOUTUBE_CHAT_FEED_BATCH_DETAIL_LENGTH
} from './batch';
import {
  YOUTUBE_CHAT_FEED_PROTOCOL_VERSION,
  type YouTubeChatFeedAction,
  type YouTubeChatFeedControl,
  type YouTubeChatFeedTransportBatch
} from './protocol';

export type YouTubeChatFeedBatchValues = Omit<
  YouTubeChatFeedTransportBatch,
  'sequence' | 'version'
>;

export function parseYouTubeChatFeedControl(value: unknown): YouTubeChatFeedControl | null {
  if (typeof value !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const control = parsed as Record<string, unknown>;
  if (
    control.version !== YOUTUBE_CHAT_FEED_PROTOCOL_VERSION ||
    typeof control.enabled !== 'boolean'
  ) {
    return null;
  }
  if (
    control.consumer !== 'inbox' &&
    control.consumer !== 'lite' &&
    control.consumer !== 'records'
  ) {
    return null;
  }
  if (
    control.requestInitial !== undefined &&
    typeof control.requestInitial !== 'boolean'
  ) {
    return null;
  }
  if (
    control.requestRendered !== undefined &&
    typeof control.requestRendered !== 'boolean'
  ) {
    return null;
  }
  if (control.requestInitial === true && control.requestRendered === true) return null;
  return {
    consumer: control.consumer,
    enabled: control.enabled,
    ...(control.requestInitial === true ? { requestInitial: true } : {}),
    ...(control.requestRendered === true ? { requestRendered: true } : {}),
    version: YOUTUBE_CHAT_FEED_PROTOCOL_VERSION
  };
}

export function createYouTubeChatFeedEventBatches(
  values: YouTubeChatFeedBatchValues,
  startingSequence: number
): YouTubeChatFeedTransportBatch[] {
  return splitYouTubeChatFeedBatchActions(values, startingSequence).map((actions, index) => (
    createYouTubeChatFeedBatch(values, actions, startingSequence + index + 1)
  ));
}

function splitYouTubeChatFeedBatchActions(
  values: YouTubeChatFeedBatchValues,
  startingSequence: number
): YouTubeChatFeedAction[][] {
  if (!values.actions.length) return [[]];
  const chunks: YouTubeChatFeedAction[][] = [];
  let chunk: YouTubeChatFeedAction[] = [];
  let chunkLength = getYouTubeChatFeedBatchLength(values, chunk, startingSequence + 1);

  for (const action of values.actions) {
    const serializedAction = JSON.stringify(action);
    const separatorLength = chunk.length ? 1 : 0;
    const exceedsCount = chunk.length >= MAX_YOUTUBE_CHAT_FEED_BATCH_ACTIONS;
    const exceedsLength =
      chunkLength + separatorLength + serializedAction.length >
      MAX_YOUTUBE_CHAT_FEED_BATCH_DETAIL_LENGTH;
    if (chunk.length && (exceedsCount || exceedsLength)) {
      chunks.push(chunk);
      chunk = [];
      chunkLength = getYouTubeChatFeedBatchLength(
        values,
        chunk,
        startingSequence + chunks.length + 1
      );
    }
    chunk.push(action);
    chunkLength += (chunk.length > 1 ? 1 : 0) + serializedAction.length;
  }
  chunks.push(chunk);
  return chunks;
}

function getYouTubeChatFeedBatchLength(
  values: YouTubeChatFeedBatchValues,
  actions: YouTubeChatFeedAction[],
  sequence: number
): number {
  return JSON.stringify(createYouTubeChatFeedBatch(values, actions, sequence)).length;
}

function createYouTubeChatFeedBatch(
  values: YouTubeChatFeedBatchValues,
  actions: YouTubeChatFeedAction[],
  sequence: number
): YouTubeChatFeedTransportBatch {
  return {
    actions,
    ...(values.compatibilityWarnings?.length
      ? { compatibilityWarnings: values.compatibilityWarnings }
      : {}),
    ...(values.continuationTimeoutMs !== undefined
      ? { continuationTimeoutMs: values.continuationTimeoutMs }
      : {}),
    ...(values.fatalErrors?.length
      ? { fatalErrors: values.fatalErrors }
      : {}),
    receivedAt: values.receivedAt,
    ...(values.replayPlayerOffsetMs !== undefined
      ? { replayPlayerOffsetMs: values.replayPlayerOffsetMs }
      : {}),
    sequence,
    ...(values.snapshot ? { snapshot: true } : {}),
    source: values.source,
    ...(values.startup ? { startup: true } : {}),
    ...(values.unreadableFeed ? { unreadableFeed: true } : {}),
    version: YOUTUBE_CHAT_FEED_PROTOCOL_VERSION
  };
}
