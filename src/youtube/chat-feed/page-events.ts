/** Serialization helpers for the page-world YouTube chat feed boundary. */
import {
  type YouTubeChatFeedControl,
  type YouTubeChatFeedTransportBatch
} from './protocol';

export type YouTubeChatFeedBatchValues = Omit<
  YouTubeChatFeedTransportBatch,
  'sequence'
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
  if (typeof control.enabled !== 'boolean') return null;
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
    ...(control.requestRendered === true ? { requestRendered: true } : {})
  };
}

export function createYouTubeChatFeedEventBatch(
  values: YouTubeChatFeedBatchValues,
  previousSequence: number
): YouTubeChatFeedTransportBatch {
  return {
    actions: values.actions,
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
    sequence: previousSequence + 1,
    ...(values.snapshot ? { snapshot: true } : {}),
    source: values.source,
    ...(values.startup ? { startup: true } : {}),
    ...(values.unreadableFeed ? { unreadableFeed: true } : {})
  };
}
