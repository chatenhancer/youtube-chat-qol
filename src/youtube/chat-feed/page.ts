/**
 * Page-world transport for the normalized YouTube chat feed.
 *
 * This owns the single fetch tap, parses sanitized chat actions, and emits
 * bounded batches to isolated-world consumers. It never exposes continuation
 * tokens, request bodies, credentials, or raw YouTube response objects.
 * Bounded startup and current-row snapshots may read already-rendered native
 * rows; there is no per-message DOM request bridge or renderer retry loop.
 */
import {
  YOUTUBE_CHAT_FEED_BATCH_EVENT,
  YOUTUBE_CHAT_FEED_CONTROL_EVENT,
  YOUTUBE_CHAT_FEED_PROTOCOL_VERSION,
  YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE,
  type YouTubeChatFeedBatchSource,
  type YouTubeChatFeedConsumer
} from './protocol';
import { parseYouTubeChatFeedPayload } from './parser';
import {
  cloneYouTubeChatFeedReplayRequest,
  createYouTubeChatFeedReplayRequestTracker,
  type YouTubeChatFeedReplayRequest,
  type YouTubeChatFeedReplayRequestTracker
} from './replay-requests';
import {
  createYouTubeChatFeedEventBatches,
  parseYouTubeChatFeedControl,
  type YouTubeChatFeedBatchValues
} from './page-events';
import {
  captureYouTubeChatFeedInitialSnapshot,
  captureYouTubeChatFeedRenderedSnapshot,
  createYouTubeChatFeedStartupBuffer,
  MAX_YOUTUBE_CHAT_FEED_SEED_ACTIONS,
  type YouTubeChatFeedStartupBuffer
} from './page-startup';
import { isYouTubeChatFeedPath } from './pages';

const YOUTUBE_CHAT_FEED_TRANSPORT_STATE_KEY = Symbol.for('ytcq:lite-chat-transport:v1');
// Long-lived tabs replace an older adapter when its control behavior changes.
const YOUTUBE_CHAT_FEED_TRANSPORT_REVISION = 5 as const;
const MAX_UNRESOLVED_CHAT_FEED_RESPONSES = 2;

interface PendingChatFeedResponse {
  receivedAt: number;
  replayRequest?: YouTubeChatFeedReplayRequest;
  response: Response;
  source: Exclude<YouTubeChatFeedBatchSource, 'initial'>;
}

interface ChatFeedTransportState {
  controlResolved: boolean;
  consumers: Set<YouTubeChatFeedConsumer>;
  enabled: boolean;
  generation: number;
  handleControl: (event: Event) => void;
  originalFetch: typeof window.fetch;
  parseChain: Promise<void>;
  pendingStartupResponses: PendingChatFeedResponse[];
  replayRequests: YouTubeChatFeedReplayRequestTracker;
  revision: typeof YOUTUBE_CHAT_FEED_TRANSPORT_REVISION;
  sequence: number;
  startup: YouTubeChatFeedStartupBuffer;
  wrapper: typeof window.fetch;
}

startYouTubeChatFeedTransport();

function startYouTubeChatFeedTransport(): void {
  if (!isYouTubeChatFeedPath(window.location.pathname) || typeof window.fetch !== 'function') return;

  const registry = window as unknown as Record<PropertyKey, unknown>;
  const existingState = registry[YOUTUBE_CHAT_FEED_TRANSPORT_STATE_KEY];
  if (isChatFeedTransportState(existingState)) return;
  removePreviousYouTubeChatFeedTransport(existingState);

  const originalFetch = window.fetch;
  const state = {} as ChatFeedTransportState;
  const wrapper = function youtubeChatFeedFetch(
    this: Window,
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    if (!state.enabled && state.controlResolved) {
      return Reflect.apply(originalFetch, this, [input, init]) as Promise<Response>;
    }
    let requestUrl = '';
    let requestedSource: Exclude<YouTubeChatFeedBatchSource, 'initial'> | null = null;
    if (input instanceof Request) {
      try {
        requestUrl = input.url;
        requestedSource = getYouTubeChatFeedResponseSource(requestUrl);
      } catch {
        // Native fetch still receives unusual Request implementations untouched.
      }
    }
    const replayRequestClone = requestedSource === 'replay'
      ? cloneYouTubeChatFeedReplayRequest(input)
      : null;
    const responsePromise = Reflect.apply(originalFetch, this, [input, init]) as Promise<Response>;

    const requestedUrl = requestUrl || getFetchInputUrl(input);
    const sourceFromRequest = requestedSource || getYouTubeChatFeedResponseSource(requestedUrl);
    const replayRequest = sourceFromRequest === 'replay'
      ? state.replayRequests.capture(replayRequestClone, init)
      : undefined;
    const requestGeneration = state.enabled ? state.generation : null;
    void responsePromise.then((response) => {
      if (!state.enabled && state.controlResolved) return response;
      const source = getYouTubeChatFeedResponseSource(response.url || requestedUrl);
      if (!source) return response;
      if (
        state.enabled &&
        requestGeneration !== null &&
        requestGeneration !== state.generation
      ) {
        return response;
      }
      let clone: Response;
      try {
        clone = response.clone();
      } catch {
        if (state.enabled) {
          void queueYouTubeChatFeedFailure(
            state,
            source,
            state.generation,
            'response:clone-failed',
            source === 'replay' ? replayRequest : undefined
          );
        }
        return response;
      }
      const receivedAt = Date.now();
      const replayRequestContext = source === 'replay' ? replayRequest : undefined;
      if (!state.enabled) {
        state.pendingStartupResponses.push({
          receivedAt,
          ...(replayRequestContext ? { replayRequest: replayRequestContext } : {}),
          response: clone,
          source
        });
        state.pendingStartupResponses = state.pendingStartupResponses.slice(
          -MAX_UNRESOLVED_CHAT_FEED_RESPONSES
        );
        return response;
      }
      const generation = requestGeneration ?? state.generation;
      if (generation !== state.generation) return response;
      void queueYouTubeChatFeedResponse(
        state,
        clone,
        source,
        generation,
        receivedAt,
        replayRequestContext
      );
      return response;
    }).catch(() => undefined);
    return responsePromise;
  } as typeof window.fetch;

  Object.assign(state, {
    controlResolved: false,
    consumers: new Set<YouTubeChatFeedConsumer>(),
    enabled: false,
    generation: 0,
    handleControl: (event: Event) => handleYouTubeChatFeedControl(event, state),
    originalFetch,
    parseChain: Promise.resolve(),
    pendingStartupResponses: [],
    replayRequests: createYouTubeChatFeedReplayRequestTracker(() => {
      // A slow response from the abandoned replay position must neither block
      // nor overwrite the newest seek response.
      state.parseChain = Promise.resolve();
    }),
    revision: YOUTUBE_CHAT_FEED_TRANSPORT_REVISION,
    sequence: 0,
    startup: createYouTubeChatFeedStartupBuffer(),
    wrapper
  });
  Object.defineProperty(registry, YOUTUBE_CHAT_FEED_TRANSPORT_STATE_KEY, {
    configurable: true,
    value: state
  });
  window.addEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, state.handleControl);
  window.fetch = wrapper;
  if (document.documentElement.getAttribute(YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE) === 'true') {
    window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_CONTROL_EVENT, {
      detail: JSON.stringify({
        consumer: 'lite',
        enabled: true,
        version: YOUTUBE_CHAT_FEED_PROTOCOL_VERSION
      })
    }));
  }
}

function handleYouTubeChatFeedControl(event: Event, state: ChatFeedTransportState): void {
  if (!(event instanceof CustomEvent)) return;
  const control = parseYouTubeChatFeedControl(event.detail);
  if (!control) return;

  const hadControlDecision = state.controlResolved;
  state.controlResolved = true;
  const wasEnabled = state.enabled;
  if (control.enabled) {
    state.consumers.add(control.consumer);
  } else {
    state.consumers.delete(control.consumer);
  }
  const nextEnabled = state.consumers.size > 0;
  if (nextEnabled !== wasEnabled) {
    state.generation += 1;
    // A clone body from the previous generation may still be parsing. Do not
    // let that obsolete work hold a later off-to-on retry behind its promise.
    // Its eventual emission remains harmlessly rejected by the generation
    // guard in emitYouTubeChatFeedBatch.
    state.parseChain = Promise.resolve();
    state.startup.reset();
    if (hadControlDecision) state.replayRequests.reset();
  }
  state.enabled = nextEnabled;
  if (!state.enabled) {
    state.pendingStartupResponses = [];
    return;
  }
  if (!wasEnabled || control.requestInitial === true) {
    queueInitialYouTubeChatFeedData(
      state,
      state.generation,
      Date.now(),
      control.requestInitial === true
    );
  } else if (control.requestRendered === true) {
    queueRenderedYouTubeChatFeedData(state, state.generation, Date.now());
  }
  drainPendingChatFeedResponses(state);
}

function drainPendingChatFeedResponses(state: ChatFeedTransportState): void {
  if (!state.enabled || !state.pendingStartupResponses.length) return;
  const generation = state.generation;
  const responses = state.pendingStartupResponses;
  state.pendingStartupResponses = [];
  responses.forEach(({ receivedAt, replayRequest, response, source }) => {
    void queueYouTubeChatFeedResponse(
      state,
      response,
      source,
      generation,
      receivedAt,
      replayRequest,
      true
    );
  });
}

function queueInitialYouTubeChatFeedData(
  state: ChatFeedTransportState,
  generation: number,
  receivedAt: number,
  receiverReady: boolean
): void {
  const capture = state.startup.beginInitialSnapshot();
  const snapshot = capture === 'bootstrap'
    ? captureYouTubeChatFeedInitialSnapshot()
    : capture === 'rendered'
      // A later re-seed must reflect the current document, not its stale
      // one-time ytInitialData bootstrap.
      ? captureYouTubeChatFeedRenderedSnapshot()
      : null;
  enqueueYouTubeChatFeedParse(state, generation, () => {
    if (snapshot) state.startup.addInitialSnapshot(snapshot);
    if (receiverReady) flushYouTubeChatFeedStartupBuffer(state, generation, receivedAt);
  });
}

function queueRenderedYouTubeChatFeedData(
  state: ChatFeedTransportState,
  generation: number,
  receivedAt: number
): void {
  const snapshot = captureYouTubeChatFeedRenderedSnapshot();
  void enqueueYouTubeChatFeedParse(state, generation, () =>
    emitYouTubeChatFeedBatch(state, {
      actions: snapshot.actions,
      compatibilityWarnings: snapshot.compatibilityWarnings,
      continuationTimeoutMs: snapshot.continuationTimeoutMs,
      fatalErrors: snapshot.fatalErrors,
      receivedAt,
      ...(snapshot.replayPlayerOffsetMs !== undefined
        ? { replayPlayerOffsetMs: snapshot.replayPlayerOffsetMs }
        : {}),
      source: 'initial',
      unreadableFeed: snapshot.unreadableFeed
    }, generation)
  );
}

function flushYouTubeChatFeedStartupBuffer(
  state: ChatFeedTransportState,
  generation: number,
  receivedAt: number
): void {
  state.startup.flush(receivedAt).forEach((batch) => {
    void emitYouTubeChatFeedBatch(state, batch, generation);
  });
}

function queueYouTubeChatFeedResponse(
  state: ChatFeedTransportState,
  response: Response,
  source: Exclude<YouTubeChatFeedBatchSource, 'initial'>,
  generation: number,
  receivedAt: number,
  replayRequest?: YouTubeChatFeedReplayRequest,
  startup = false
): Promise<void> {
  const task = async (): Promise<void> => {
    const resolvedReplayRequest = await replayRequest;
    if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;
    const startupMetadata = startup ? { startup: true as const } : {};
    const replayMetadata = resolvedReplayRequest?.playerOffsetMs !== undefined
      ? { replayPlayerOffsetMs: resolvedReplayRequest.playerOffsetMs }
      : {};
    if (!response.ok) {
      await emitAndRememberYouTubeChatFeedBatch(state, {
        actions: [],
        fatalErrors: getFeedDiagnostics(source, `response:http-${response.status}`),
        receivedAt,
        ...replayMetadata,
        source,
        ...startupMetadata
      }, generation);
      return;
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;
      await emitAndRememberYouTubeChatFeedBatch(state, {
        actions: [],
        fatalErrors: getFeedDiagnostics(source, 'response:body-read-failed'),
        receivedAt,
        ...replayMetadata,
        source,
        ...startupMetadata
      }, generation);
      return;
    }
    if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      await emitAndRememberYouTubeChatFeedBatch(state, {
        actions: [],
        fatalErrors: getFeedDiagnostics(source, 'response:invalid-json'),
        receivedAt,
        ...replayMetadata,
        source,
        ...startupMetadata
      }, generation);
      return;
    }
    if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;
    if (source === 'replay') state.replayRequests.rememberResponse(payload);

    const parsed = parseYouTubeChatFeedPayload(payload);
    if (source !== 'send' && !parsed.foundChat) {
      parsed.fatalErrors.push('response:unrecognized-chat-payload');
    }
    const snapshot = parsed.actions.some((action) => action.type === 'reset');
    await emitAndRememberYouTubeChatFeedBatch(state, {
      actions: resolvedReplayRequest?.reset && !parsed.actions.some((action) => action.type === 'reset')
        ? [{ type: 'reset' }, ...parsed.actions.slice(-MAX_YOUTUBE_CHAT_FEED_SEED_ACTIONS)]
        : parsed.actions,
      compatibilityWarnings: getFeedDiagnostics(source, ...parsed.compatibilityWarnings),
      continuationTimeoutMs: parsed.continuationTimeoutMs,
      fatalErrors: getFeedDiagnostics(source, ...parsed.fatalErrors),
      receivedAt,
      ...replayMetadata,
      ...(snapshot ? { snapshot: true } : {}),
      source,
      ...startupMetadata,
      unreadableFeed: source === 'send' ? false : parsed.unreadableFeed
    }, generation);
  };
  return enqueueYouTubeChatFeedParse(
    state,
    generation,
    task
  );
}

function queueYouTubeChatFeedFailure(
  state: ChatFeedTransportState,
  source: YouTubeChatFeedBatchSource,
  generation: number,
  reason: string,
  replayRequest?: YouTubeChatFeedReplayRequest,
  onSettled?: () => void
): Promise<void> {
  let settled = false;
  const settle = (): void => {
    if (settled) return;
    settled = true;
    onSettled?.();
  };
  const task = async (): Promise<void> => {
    const resolvedReplayRequest = await replayRequest;
    if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;
    await emitAndRememberYouTubeChatFeedBatch(state, {
      actions: [],
      fatalErrors: getFeedDiagnostics(source, reason),
      receivedAt: Date.now(),
      ...(resolvedReplayRequest?.playerOffsetMs !== undefined
        ? { replayPlayerOffsetMs: resolvedReplayRequest.playerOffsetMs }
        : {}),
      source
    }, generation);
  };
  return enqueueYouTubeChatFeedParse(state, generation, () => task().finally(settle), settle);
}

function getFeedDiagnostics(
  source: YouTubeChatFeedBatchSource,
  ...values: string[]
): string[] {
  return source === 'send' ? [] : values;
}

function emitAndRememberYouTubeChatFeedBatch(
  state: ChatFeedTransportState,
  values: YouTubeChatFeedBatchValues,
  generation: number
): Promise<void> {
  state.startup.rememberBatch(values);
  return emitYouTubeChatFeedBatch(state, values, generation);
}

function enqueueYouTubeChatFeedParse(
  state: ChatFeedTransportState,
  generation: number,
  task: () => void | Promise<void>,
  onSkipped?: () => void
): Promise<void> {
  state.parseChain = state.parseChain
    .catch(() => undefined)
    .then(async () => {
      if (!state.enabled || generation !== state.generation) {
        onSkipped?.();
        return;
      }
      await task();
    });
  return state.parseChain.catch(() => undefined);
}

function emitYouTubeChatFeedBatch(
  state: ChatFeedTransportState,
  values: YouTubeChatFeedBatchValues,
  generation: number
): Promise<void> {
  if (!state.enabled || generation !== state.generation) return Promise.resolve();
  const batches = createYouTubeChatFeedEventBatches(values, state.sequence);
  for (const batch of batches) {
    state.sequence = batch.sequence;
    window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_FEED_BATCH_EVENT, {
      detail: JSON.stringify(batch)
    }));
    if (!state.enabled || generation !== state.generation) return Promise.resolve();
  }
  return Promise.resolve();
}

function getFetchInputUrl(input: RequestInfo | URL): string {
  try {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input.url;
  } catch {
    return '';
  }
}

function getYouTubeChatFeedResponseSource(
  value: string
): Exclude<YouTubeChatFeedBatchSource, 'initial'> | null {
  let url: URL;
  try {
    url = new URL(value, window.location.href);
  } catch {
    return null;
  }
  if (!['www.youtube.com', 'studio.youtube.com'].includes(url.hostname)) return null;

  if (url.pathname === '/youtubei/v1/live_chat/get_live_chat') return 'live';
  if (url.pathname === '/youtubei/v1/live_chat/get_live_chat_replay') return 'replay';
  if (url.pathname === '/youtubei/v1/live_chat/send_message') return 'send';
  return null;
}

function isChatFeedTransportState(value: unknown): value is ChatFeedTransportState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<ChatFeedTransportState>;
  return state.revision === YOUTUBE_CHAT_FEED_TRANSPORT_REVISION &&
    state.consumers instanceof Set &&
    typeof state.originalFetch === 'function' &&
    typeof state.wrapper === 'function' &&
    typeof state.handleControl === 'function' &&
    typeof state.sequence === 'number';
}

function removePreviousYouTubeChatFeedTransport(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const state = value as {
    controlResolved?: boolean;
    enabled?: boolean;
    handleControl?: EventListener;
    originalFetch?: typeof window.fetch;
    wrapper?: typeof window.fetch;
  };

  if (typeof state.handleControl === 'function') {
    window.removeEventListener(YOUTUBE_CHAT_FEED_CONTROL_EVENT, state.handleControl);
  }
  state.controlResolved = true;
  state.enabled = false;
  if (
    typeof state.wrapper === 'function' &&
    typeof state.originalFetch === 'function' &&
    window.fetch === state.wrapper
  ) {
    window.fetch = state.originalFetch;
  }
}
