/**
 * Tracks YouTube replay request chains without consuming or modifying them.
 *
 * Normal polling uses `liveChatReplayContinuationData`; progress-bar seeks use
 * `playerSeekContinuationData`. YouTube currently sends the request as a
 * gzip-compressed `Request`, so Lite reads only a clone and never exposes the
 * continuation values outside this page-world helper.
 */

const MAX_REQUEST_BODY_LENGTH = 64 * 1024;
const MAX_CONTINUATION_LENGTH = 4_096;
const BACKWARD_SEEK_THRESHOLD_MS = 1_000;
const FORWARD_SEEK_MINIMUM_MS = 15_000;
const FORWARD_PLAYBACK_RATE_ALLOWANCE = 3;

export interface LiteChatReplayRequestContext {
  epoch: number;
  playerOffsetMs?: number;
  reset: boolean;
}

export type LiteChatReplayRequest =
  | LiteChatReplayRequestContext
  | Promise<LiteChatReplayRequestContext | undefined>;

export interface LiteChatReplayRequestTracker {
  capture: (
    request: Request | null,
    init?: RequestInit
  ) => Promise<LiteChatReplayRequestContext | undefined>;
  isObsolete: (request: LiteChatReplayRequestContext | undefined) => boolean;
  rememberResponse: (payload: unknown) => void;
  reset: () => void;
}

interface ReplayRequestData {
  continuation?: string;
  playerOffsetMs?: number;
}

interface ReplayContinuationTokens {
  replay?: string;
  seek?: string;
}

export function cloneLiteChatReplayRequest(input: RequestInfo | URL): Request | null {
  if (!(input instanceof Request)) return null;
  try {
    return input.clone();
  } catch {
    return null;
  }
}

export function createLiteChatReplayRequestTracker(
  onSeek: () => void
): LiteChatReplayRequestTracker {
  let continuation: string | undefined;
  let epoch = 0;
  let lastPlayerOffsetMs: number | undefined;
  let lastRequestAt: number | undefined;
  let requestChain = Promise.resolve();
  let seekContinuation: string | undefined;
  let trackingGeneration = 0;

  const capture = (
    request: Request | null,
    init?: RequestInit
  ): Promise<LiteChatReplayRequestContext | undefined> => {
    const requestGeneration = trackingGeneration;
    const context = requestChain
      .catch(() => undefined)
      .then(async () => {
        const body = await readReplayRequestBody(request, init);
        if (requestGeneration !== trackingGeneration || body === null) return undefined;
        const data = parseReplayRequestData(body);
        if (!data) return undefined;

        const matchesReplayContinuation = Boolean(
          data.continuation && data.continuation === continuation
        );
        const matchesSeekContinuation = Boolean(
          data.continuation && data.continuation === seekContinuation
        );
        const reset = matchesSeekContinuation || (
          !matchesReplayContinuation &&
          !matchesSeekContinuation &&
          isPlayerOffsetDiscontinuity(data.playerOffsetMs)
        );

        if (reset) {
          epoch += 1;
          onSeek();
        }
        if (data.playerOffsetMs !== undefined) {
          lastPlayerOffsetMs = data.playerOffsetMs;
          lastRequestAt = Date.now();
        }
        return {
          epoch,
          ...(data.playerOffsetMs !== undefined
            ? { playerOffsetMs: data.playerOffsetMs }
            : {}),
          reset
        };
      });
    requestChain = context.then(() => undefined, () => undefined);
    return context.catch(() => undefined);
  };

  const isPlayerOffsetDiscontinuity = (nextOffsetMs: number | undefined): boolean => {
    if (nextOffsetMs === undefined || lastPlayerOffsetMs === undefined) return false;
    const deltaMs = nextOffsetMs - lastPlayerOffsetMs;
    if (deltaMs < -BACKWARD_SEEK_THRESHOLD_MS) return true;
    const elapsedMs = lastRequestAt === undefined
      ? 0
      : Math.max(0, Date.now() - lastRequestAt);
    return deltaMs > Math.max(
      FORWARD_SEEK_MINIMUM_MS,
      elapsedMs * FORWARD_PLAYBACK_RATE_ALLOWANCE
    );
  };

  return {
    capture,
    isObsolete: (request) => Boolean(request && request.epoch !== epoch),
    rememberResponse: (payload) => {
      const tokens = parseReplayContinuationTokens(payload);
      if (tokens.replay) continuation = tokens.replay;
      if (tokens.seek) seekContinuation = tokens.seek;
    },
    reset: () => {
      trackingGeneration += 1;
      continuation = undefined;
      epoch = 0;
      lastPlayerOffsetMs = undefined;
      lastRequestAt = undefined;
      requestChain = Promise.resolve();
      seekContinuation = undefined;
    }
  };
}

async function readReplayRequestBody(
  request: Request | null,
  init?: RequestInit
): Promise<string | null> {
  if (typeof init?.body === 'string') return init.body;
  if (!request) return null;
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_LENGTH) return null;

  try {
    const contentEncoding = request.headers.get('content-encoding')?.trim().toLowerCase();
    let body: string;
    if (!contentEncoding || contentEncoding === 'identity') {
      body = await request.text();
    } else if (contentEncoding === 'gzip' && request.body) {
      body = await new Response(
        request.body.pipeThrough(new DecompressionStream('gzip'))
      ).text();
    } else {
      return null;
    }
    return body.length <= MAX_REQUEST_BODY_LENGTH ? body : null;
  } catch {
    return null;
  }
}

function parseReplayRequestData(body: string): ReplayRequestData | null {
  if (body.length === 0 || body.length > MAX_REQUEST_BODY_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  const record = asRecord(parsed);
  if (!record) return null;
  const continuation = getBoundedContinuation(record.continuation);
  const playerOffsetMs = parsePlayerOffsetMs(
    asRecord(record.currentPlayerState)?.playerOffsetMs
  );
  if (!continuation && playerOffsetMs === undefined) return null;
  return {
    ...(continuation ? { continuation } : {}),
    ...(playerOffsetMs !== undefined ? { playerOffsetMs } : {})
  };
}

function parsePlayerOffsetMs(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const offset = Number(value);
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : undefined;
}

function parseReplayContinuationTokens(payload: unknown): ReplayContinuationTokens {
  const root = asRecord(payload);
  const continuationContents = asRecord(root?.continuationContents);
  const liveChatContinuation = asRecord(continuationContents?.liveChatContinuation);
  const continuations = liveChatContinuation?.continuations;
  if (!Array.isArray(continuations)) return {};

  const tokens: ReplayContinuationTokens = {};
  for (const value of continuations.slice(0, 20)) {
    const item = asRecord(value);
    if (!item) continue;
    const replay = asRecord(item.liveChatReplayContinuationData);
    const seek = asRecord(item.playerSeekContinuationData);
    tokens.replay ||= getBoundedContinuation(replay?.continuation);
    tokens.seek ||= getBoundedContinuation(seek?.continuation);
  }
  return tokens;
}

function getBoundedContinuation(value: unknown): string | undefined {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_CONTINUATION_LENGTH
    ? value
    : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
