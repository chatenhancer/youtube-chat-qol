/**
 * Page-world YouTube message data adapter.
 *
 * This runs in the page's MAIN world so it can read YouTube's renderer-owned
 * `data` property for message elements requested by the isolated extension
 * world. It emits only a small sanitized allowlist back.
 */
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT,
  type YouTubeMessageData
} from './message-data-events';
import {
  LITE_CHAT_BATCH_EVENT,
  LITE_CHAT_CONTROL_EVENT,
  LITE_CHAT_PROTOCOL_VERSION,
  LITE_MODE_BOOTSTRAP_INTENT_ATTRIBUTE,
  type LiteChatAction,
  type LiteChatBatch,
  type LiteChatBatchSource,
  type LiteChatControl
} from '../features/lite-mode/protocol';
import { parseLiteChatPayload } from './lite-chat-parser';
import {
  cloneLiteChatReplayRequest,
  createLiteChatReplayRequestTracker,
  type LiteChatReplayRequest,
  type LiteChatReplayRequestTracker
} from './lite-chat-replay-requests';
import { CHAT_MESSAGE_SELECTOR } from './selectors';
import {
  MAX_LITE_CHAT_BATCH_ACTIONS,
  MAX_LITE_CHAT_BATCH_DETAIL_LENGTH
} from '../features/lite-mode/batch';

type DataRecord = Record<string, unknown>;
type MessageRenderer = HTMLElement & { data?: unknown };

const MAX_DATA_RETRIES = 10;
const RETRY_MS = 50;
const SENT_CACHE_LIMIT = 800;
const LITE_CHAT_TRANSPORT_STATE_KEY = Symbol.for('ytcq:lite-chat-transport:v1');
const MAX_LITE_CHAT_SEED_ACTIONS = 499;
const MAX_UNRESOLVED_LITE_CHAT_RESPONSES = 2;

interface PendingLiteChatResponse {
  receivedAt: number;
  replayRequest?: LiteChatReplayRequest;
  response: Response;
  source: Exclude<LiteChatBatchSource, 'initial'>;
}

interface LiteChatTransportState {
  controlResolved: boolean;
  enabled: boolean;
  generation: number;
  handleControl: (event: Event) => void;
  initialActions: LiteChatAction[];
  originalFetch: typeof window.fetch;
  parseChain: Promise<void>;
  pendingStartupResponses: PendingLiteChatResponse[];
  preReadyActions: LiteChatAction[];
  preReadyCompatibilityWarnings: string[];
  preReadyContinuationTimeoutMs?: number;
  preReadyFatalErrors: string[];
  preReadyReplayPlayerOffsetMs?: number;
  preReadySource?: Extract<LiteChatBatchSource, 'live' | 'replay'>;
  preReadyUnreadableFeed: boolean;
  receiverReady: boolean;
  replayRequests: LiteChatReplayRequestTracker;
  sequence: number;
  wrapper: typeof window.fetch;
}

const retryCounts = new WeakMap<Element, number>();
const retryTimers = new WeakMap<Element, number>();
const sentPayloads = new Map<string, string>();
const sentMessageIds: string[] = [];
const NATIVE_LITE_CHAT_RENDERER_KEYS: Record<string, string> = {
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
const NATIVE_LITE_CHAT_RENDERER_SELECTOR = Object.keys(NATIVE_LITE_CHAT_RENDERER_KEYS).join(',');

startYouTubeMessageDataAdapter();
startLiteChatTransport();

function startYouTubeMessageDataAdapter(): void {
  document.addEventListener(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, handleYouTubeMessageDataRequest);
}

function startLiteChatTransport(): void {
  if (!isLiteChatTransportPage() || typeof window.fetch !== 'function') return;

  const registry = window as unknown as Record<PropertyKey, unknown>;
  if (isLiteChatTransportState(registry[LITE_CHAT_TRANSPORT_STATE_KEY])) return;

  const originalFetch = window.fetch;
  const state = {} as LiteChatTransportState;
  const wrapper = function liteChatFetch(
    this: Window,
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    if (!state.enabled && state.controlResolved) {
      return Reflect.apply(originalFetch, this, [input, init]) as Promise<Response>;
    }
    let requestUrl = '';
    let requestedSource: Exclude<LiteChatBatchSource, 'initial'> | null = null;
    if (input instanceof Request) {
      try {
        requestUrl = input.url;
        requestedSource = getLiteChatResponseSource(requestUrl);
      } catch {
        // Native fetch still receives unusual Request implementations untouched.
      }
    }
    const replayRequestClone = requestedSource === 'replay'
      ? cloneLiteChatReplayRequest(input)
      : null;
    const responsePromise = Reflect.apply(originalFetch, this, [input, init]) as Promise<Response>;

    const requestedUrl = requestUrl || getFetchInputUrl(input);
    const sourceFromRequest = requestedSource || getLiteChatResponseSource(requestedUrl);
    const replayRequest = sourceFromRequest === 'replay'
      ? state.replayRequests.capture(replayRequestClone, init)
      : undefined;
    const requestGeneration = state.enabled ? state.generation : null;
    return responsePromise.then(async (response) => {
      if (!state.enabled && state.controlResolved) return response;
      const source = getLiteChatResponseSource(response.url || requestedUrl);
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
          queueLiteChatFailure(
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
          -MAX_UNRESOLVED_LITE_CHAT_RESPONSES
        );
        return response;
      }
      const generation = requestGeneration ?? state.generation;
      if (generation !== state.generation) return response;
      await queueLiteChatResponse(
        state,
        clone,
        source,
        generation,
        receivedAt,
        replayRequestContext
      );
      return response;
    });
  } as typeof window.fetch;

  Object.assign(state, {
    controlResolved: false,
    enabled: false,
    generation: 0,
    handleControl: (event: Event) => handleLiteChatControl(event, state),
    initialActions: [],
    originalFetch,
    parseChain: Promise.resolve(),
    pendingStartupResponses: [],
    preReadyActions: [],
    preReadyCompatibilityWarnings: [],
    preReadyFatalErrors: [],
    preReadyUnreadableFeed: false,
    receiverReady: false,
    replayRequests: createLiteChatReplayRequestTracker(() => {
      // A slow response from the abandoned replay position must neither block
      // nor overwrite the newest seek response.
      state.parseChain = Promise.resolve();
    }),
    sequence: 0,
    wrapper
  });
  Object.defineProperty(registry, LITE_CHAT_TRANSPORT_STATE_KEY, {
    configurable: true,
    value: state
  });
  window.addEventListener(LITE_CHAT_CONTROL_EVENT, state.handleControl);
  window.fetch = wrapper;
  if (document.documentElement.getAttribute(LITE_MODE_BOOTSTRAP_INTENT_ATTRIBUTE) === 'true') {
    window.dispatchEvent(new CustomEvent(LITE_CHAT_CONTROL_EVENT, {
      detail: JSON.stringify({ enabled: true, version: LITE_CHAT_PROTOCOL_VERSION })
    }));
  }
}

function isLiteChatTransportPage(): boolean {
  return window.location.hostname !== 'studio.youtube.com' &&
    (window.location.pathname === '/live_chat' || window.location.pathname === '/live_chat_replay');
}

function handleLiteChatControl(event: Event, state: LiteChatTransportState): void {
  if (!(event instanceof CustomEvent)) return;
  const control = parseLiteChatControl(event.detail);
  if (!control) return;

  const hadControlDecision = state.controlResolved;
  state.controlResolved = true;
  const wasEnabled = state.enabled;
  if (control.enabled !== wasEnabled) {
    state.generation += 1;
    // A clone body from the previous generation may still be parsing. Do not
    // let that obsolete work hold a later off-to-on retry behind its promise.
    // Its eventual emission remains harmlessly rejected by the generation
    // guard in emitLiteChatBatch.
    state.parseChain = Promise.resolve();
    resetLiteChatStartupBuffer(state);
    if (hadControlDecision) state.replayRequests.reset();
  }
  state.enabled = control.enabled;
  if (!state.enabled) {
    state.pendingStartupResponses = [];
    return;
  }
  if (!wasEnabled || control.requestInitial === true) {
    queueInitialLiteChatData(
      state,
      state.generation,
      Date.now(),
      control.requestInitial === true
    );
  }
  drainPendingLiteChatResponses(state);
}

function drainPendingLiteChatResponses(state: LiteChatTransportState): void {
  if (!state.enabled || !state.pendingStartupResponses.length) return;
  const generation = state.generation;
  const responses = state.pendingStartupResponses;
  state.pendingStartupResponses = [];
  responses.forEach(({ receivedAt, replayRequest, response, source }) => {
    queueLiteChatResponse(state, response, source, generation, receivedAt, replayRequest);
  });
}

function parseLiteChatControl(value: unknown): LiteChatControl | null {
  if (typeof value !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const control = parsed as Record<string, unknown>;
  if (control.version !== LITE_CHAT_PROTOCOL_VERSION || typeof control.enabled !== 'boolean') return null;
  if (control.requestInitial !== undefined && typeof control.requestInitial !== 'boolean') return null;
  return {
    enabled: control.enabled,
    ...(control.requestInitial === true ? { requestInitial: true } : {}),
    version: LITE_CHAT_PROTOCOL_VERSION
  };
}

function queueInitialLiteChatData(
  state: LiteChatTransportState,
  generation: number,
  receivedAt: number,
  receiverReady: boolean
): void {
  let initialData: unknown;
  try {
    initialData = (globalThis as typeof globalThis & { ytInitialData?: unknown }).ytInitialData;
  } catch {
    // The global is only one optional history seed. Native renderer data and
    // captured continuation responses can still start Lite safely without it.
    initialData = undefined;
  }

  // Parse native renderer data synchronously while the controller still owns
  // the native list. Its expensive subtree is discarded as soon as this
  // control event returns.
  const parsedInitial = initialData === undefined
    ? null
    : parseLiteChatPayload(initialData, { initial: true });
  const parsedNativeRows = parseNativeLiteChatRows();
  enqueueLiteChatParse(state, generation, () => {
    const nativeActions = parsedNativeRows.actions.filter((action) => action.type === 'upsert');
    const initialActions = parsedInitial?.actions.filter((action) => action.type !== 'reset') || [];
    const chosenActions = (nativeActions.length ? nativeActions : initialActions)
      .slice(-MAX_LITE_CHAT_SEED_ACTIONS);
    state.initialActions = mergeLiteChatStartupActions(state.initialActions, chosenActions);
    rememberLiteChatStartupMetadata(state, {
      compatibilityWarnings: [
        ...(parsedInitial?.compatibilityWarnings || []),
        ...parsedNativeRows.compatibilityWarnings
      ],
      continuationTimeoutMs: parsedInitial?.continuationTimeoutMs,
      fatalErrors: [
        ...(parsedInitial?.fatalErrors || []),
        ...parsedNativeRows.fatalErrors
      ],
      unreadableFeed: Boolean(parsedInitial?.unreadableFeed || parsedNativeRows.unreadableFeed)
    });
    if (receiverReady) flushLiteChatStartupBuffer(state, generation, receivedAt);
  });
}

function flushLiteChatStartupBuffer(
  state: LiteChatTransportState,
  generation: number,
  receivedAt: number
): void {
  state.receiverReady = true;
  const actions = [...state.initialActions, ...state.preReadyActions]
    .slice(-MAX_LITE_CHAT_SEED_ACTIONS);
  const compatibilityWarnings = state.preReadyCompatibilityWarnings;
  const continuationTimeoutMs = state.preReadyContinuationTimeoutMs;
  const fatalErrors = state.preReadyFatalErrors;
  const replayPlayerOffsetMs = state.preReadyReplayPlayerOffsetMs;
  const source = state.preReadySource;
  const unreadableFeed = state.preReadyUnreadableFeed;
  state.initialActions = [];
  state.preReadyActions = [];
  state.preReadyCompatibilityWarnings = [];
  state.preReadyContinuationTimeoutMs = undefined;
  state.preReadyFatalErrors = [];
  state.preReadyReplayPlayerOffsetMs = undefined;
  state.preReadySource = undefined;
  state.preReadyUnreadableFeed = false;
  void emitLiteChatBatch(state, {
    actions: [{ type: 'reset' }, ...actions],
    compatibilityWarnings,
    continuationTimeoutMs,
    fatalErrors,
    receivedAt,
    source: 'initial',
    unreadableFeed
  }, generation);
  if (source) {
    void emitLiteChatBatch(state, {
      actions: [],
      continuationTimeoutMs,
      receivedAt,
      ...(replayPlayerOffsetMs !== undefined ? { replayPlayerOffsetMs } : {}),
      source
    }, generation);
  }
}

function mergeLiteChatStartupActions(
  existing: readonly LiteChatAction[],
  incoming: readonly LiteChatAction[]
): LiteChatAction[] {
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
  return merged.slice(-MAX_LITE_CHAT_SEED_ACTIONS);
}

function resetLiteChatStartupBuffer(state: LiteChatTransportState): void {
  state.initialActions = [];
  state.preReadyActions = [];
  state.preReadyCompatibilityWarnings = [];
  state.preReadyContinuationTimeoutMs = undefined;
  state.preReadyFatalErrors = [];
  state.preReadyReplayPlayerOffsetMs = undefined;
  state.preReadySource = undefined;
  state.preReadyUnreadableFeed = false;
  state.receiverReady = false;
}

function parseNativeLiteChatRows(): ReturnType<typeof parseLiteChatPayload> {
  const actions = Array.from(
    document.querySelectorAll<MessageRenderer>(NATIVE_LITE_CHAT_RENDERER_SELECTOR)
  ).slice(-MAX_LITE_CHAT_SEED_ACTIONS).flatMap((message) => {
    const rendererKey = NATIVE_LITE_CHAT_RENDERER_KEYS[message.tagName.toLowerCase()];
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
  const parsed = parseLiteChatPayload({ actions });
  // Native renderer data is only a best-effort history seed and can be
  // observed before YouTube fills its message field. Incomplete DOM rows must
  // not affect compatibility health; authoritative fetch responses do.
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

function queueLiteChatResponse(
  state: LiteChatTransportState,
  response: Response,
  source: Exclude<LiteChatBatchSource, 'initial'>,
  generation: number,
  receivedAt: number,
  replayRequest?: LiteChatReplayRequest
): Promise<void> {
  const task = async (): Promise<void> => {
    const resolvedReplayRequest = await replayRequest;
    if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;
    const replayMetadata = resolvedReplayRequest?.playerOffsetMs !== undefined
      ? { replayPlayerOffsetMs: resolvedReplayRequest.playerOffsetMs }
      : {};
    if (!response.ok) {
      await emitAndRememberLiteChatBatch(state, {
        actions: [],
        fatalErrors: getFeedDiagnostics(source, `response:http-${response.status}`),
        receivedAt,
        ...replayMetadata,
        source
      }, generation);
      return;
    }

    let body: string;
    try {
      body = await response.text();
    } catch {
      if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;
      await emitAndRememberLiteChatBatch(state, {
        actions: [],
        fatalErrors: getFeedDiagnostics(source, 'response:body-read-failed'),
        receivedAt,
        ...replayMetadata,
        source
      }, generation);
      return;
    }
    if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      await emitAndRememberLiteChatBatch(state, {
        actions: [],
        fatalErrors: getFeedDiagnostics(source, 'response:invalid-json'),
        receivedAt,
        ...replayMetadata,
        source
      }, generation);
      return;
    }
    if (state.replayRequests.isObsolete(resolvedReplayRequest)) return;
    if (source === 'replay') state.replayRequests.rememberResponse(payload);

    const parsed = parseLiteChatPayload(payload);
    if (source !== 'send' && !parsed.foundChat) {
      parsed.fatalErrors.push('response:unrecognized-chat-payload');
    }
    await emitAndRememberLiteChatBatch(state, {
      actions: resolvedReplayRequest?.reset && !parsed.actions.some((action) => action.type === 'reset')
        ? [{ type: 'reset' }, ...parsed.actions.slice(-MAX_LITE_CHAT_SEED_ACTIONS)]
        : parsed.actions,
      compatibilityWarnings: getFeedDiagnostics(source, ...parsed.compatibilityWarnings),
      continuationTimeoutMs: parsed.continuationTimeoutMs,
      fatalErrors: getFeedDiagnostics(source, ...parsed.fatalErrors),
      receivedAt,
      ...replayMetadata,
      source,
      unreadableFeed: source === 'send' ? false : parsed.unreadableFeed
    }, generation);
  };
  return enqueueLiteChatParse(
    state,
    generation,
    task
  );
}

function queueLiteChatFailure(
  state: LiteChatTransportState,
  source: LiteChatBatchSource,
  generation: number,
  reason: string,
  replayRequest?: LiteChatReplayRequest,
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
    await emitAndRememberLiteChatBatch(state, {
      actions: [],
      fatalErrors: getFeedDiagnostics(source, reason),
      receivedAt: Date.now(),
      ...(resolvedReplayRequest?.playerOffsetMs !== undefined
        ? { replayPlayerOffsetMs: resolvedReplayRequest.playerOffsetMs }
        : {}),
      source
    }, generation);
  };
  return enqueueLiteChatParse(state, generation, () => task().finally(settle), settle);
}

function getFeedDiagnostics(
  source: LiteChatBatchSource,
  ...values: string[]
): string[] {
  return source === 'send' ? [] : values;
}

function emitAndRememberLiteChatBatch(
  state: LiteChatTransportState,
  values: Omit<LiteChatBatch, 'sequence' | 'version'>,
  generation: number
): Promise<void> {
  rememberLiteChatStartupBatch(state, values);
  return emitLiteChatBatch(state, values, generation);
}

function rememberLiteChatStartupBatch(
  state: LiteChatTransportState,
  values: Omit<LiteChatBatch, 'sequence' | 'version'>
): void {
  if (state.receiverReady) return;
  if (values.source === 'live' || values.source === 'replay') {
    state.preReadySource = values.source;
  }
  for (const action of values.actions) {
    if (action.type === 'reset') {
      state.initialActions = [];
      state.preReadyActions = [];
      continue;
    }
    state.preReadyActions.push(action);
  }
  state.preReadyActions = state.preReadyActions.slice(-MAX_LITE_CHAT_SEED_ACTIONS);
  rememberLiteChatStartupMetadata(state, values);
}

function rememberLiteChatStartupMetadata(
  state: LiteChatTransportState,
  values: Pick<
    LiteChatBatch,
    | 'compatibilityWarnings'
    | 'continuationTimeoutMs'
    | 'fatalErrors'
    | 'replayPlayerOffsetMs'
    | 'unreadableFeed'
  >
): void {
  if (state.receiverReady) return;
  if (values.continuationTimeoutMs !== undefined) {
    state.preReadyContinuationTimeoutMs = values.continuationTimeoutMs;
  }
  if (values.replayPlayerOffsetMs !== undefined) {
    state.preReadyReplayPlayerOffsetMs = values.replayPlayerOffsetMs;
  }
  if (values.compatibilityWarnings?.length) {
    state.preReadyCompatibilityWarnings = [...new Set([
      ...state.preReadyCompatibilityWarnings,
      ...values.compatibilityWarnings
    ])].slice(0, 32);
  }
  if (values.fatalErrors?.length) {
    state.preReadyFatalErrors = [...new Set([
      ...state.preReadyFatalErrors,
      ...values.fatalErrors
    ])].slice(0, 32);
  }
  if (values.unreadableFeed) state.preReadyUnreadableFeed = true;
}

function enqueueLiteChatParse(
  state: LiteChatTransportState,
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

function emitLiteChatBatch(
  state: LiteChatTransportState,
  values: Omit<LiteChatBatch, 'sequence' | 'version'>,
  generation: number
): Promise<void> {
  if (!state.enabled || generation !== state.generation) return Promise.resolve();
  const actionChunks = splitLiteChatBatchActions(values, state.sequence);
  for (const actions of actionChunks) {
    state.sequence += 1;
    const batch = createLiteChatBatch(values, actions, state.sequence);
    window.dispatchEvent(new CustomEvent(LITE_CHAT_BATCH_EVENT, {
      detail: JSON.stringify(batch)
    }));
    if (!state.enabled || generation !== state.generation) return Promise.resolve();
  }
  return Promise.resolve();
}

function splitLiteChatBatchActions(
  values: Omit<LiteChatBatch, 'sequence' | 'version'>,
  startingSequence: number
): LiteChatAction[][] {
  if (!values.actions.length) return [[]];
  const chunks: LiteChatAction[][] = [];
  let chunk: LiteChatAction[] = [];
  let chunkLength = getLiteChatBatchLength(values, chunk, startingSequence + 1);

  for (const action of values.actions) {
    const serializedAction = JSON.stringify(action);
    const separatorLength = chunk.length ? 1 : 0;
    const exceedsCount = chunk.length >= MAX_LITE_CHAT_BATCH_ACTIONS;
    const exceedsLength =
      chunkLength + separatorLength + serializedAction.length > MAX_LITE_CHAT_BATCH_DETAIL_LENGTH;
    if (chunk.length && (exceedsCount || exceedsLength)) {
      chunks.push(chunk);
      chunk = [];
      chunkLength = getLiteChatBatchLength(
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

function getLiteChatBatchLength(
  values: Omit<LiteChatBatch, 'sequence' | 'version'>,
  actions: LiteChatAction[],
  sequence: number
): number {
  return JSON.stringify(createLiteChatBatch(values, actions, sequence)).length;
}

function createLiteChatBatch(
  values: Omit<LiteChatBatch, 'sequence' | 'version'>,
  actions: LiteChatAction[],
  sequence: number
): LiteChatBatch {
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
    source: values.source,
    ...(values.unreadableFeed ? { unreadableFeed: true } : {}),
    version: LITE_CHAT_PROTOCOL_VERSION
  };
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

function getLiteChatResponseSource(value: string): Exclude<LiteChatBatchSource, 'initial'> | null {
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

function isLiteChatTransportState(value: unknown): value is LiteChatTransportState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<LiteChatTransportState>;
  return typeof state.wrapper === 'function' &&
    typeof state.handleControl === 'function' &&
    typeof state.sequence === 'number';
}

function handleYouTubeMessageDataRequest(event: Event): void {
  const message = getRequestedYouTubeMessage(event.target);
  if (!message) return;
  processYouTubeMessageData(message);
}

function getRequestedYouTubeMessage(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.closest('.ytcq-lite-message')) return null;
  const message = target.matches(CHAT_MESSAGE_SELECTOR) && target instanceof HTMLElement
    ? target
    : target.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  return message?.classList.contains('ytcq-lite-message') ? null : message;
}

function processYouTubeMessageData(message: HTMLElement): void {
  if (emitYouTubeMessageData(message)) {
    clearYouTubeMessageDataRetry(message);
    retryCounts.delete(message);
    return;
  }

  scheduleYouTubeMessageDataRetry(message);
}

function scheduleYouTubeMessageDataRetry(message: HTMLElement): void {
  const count = retryCounts.get(message) || 0;
  if (count >= MAX_DATA_RETRIES || retryTimers.has(message)) return;

  retryCounts.set(message, count + 1);
  const timer = window.setTimeout(() => {
    retryTimers.delete(message);
    if (!message.isConnected) {
      retryCounts.delete(message);
      return;
    }
    processYouTubeMessageData(message);
  }, count === 0 ? 0 : RETRY_MS);
  retryTimers.set(message, timer);
}

function clearYouTubeMessageDataRetry(message: HTMLElement): void {
  const timer = retryTimers.get(message);
  if (timer !== undefined) window.clearTimeout(timer);
  retryTimers.delete(message);
}

function emitYouTubeMessageData(message: HTMLElement): boolean {
  const payload = getYouTubeMessageDataPayload(message);
  if (!payload) return false;

  const serialized = JSON.stringify(payload);
  if (sentPayloads.get(payload.messageId) === serialized) return true;
  rememberSentPayload(payload.messageId, serialized);
  message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
    bubbles: true,
    composed: true,
    detail: serialized
  }));
  return true;
}

function rememberSentPayload(messageId: string, serialized: string): void {
  if (!sentPayloads.has(messageId)) sentMessageIds.push(messageId);
  sentPayloads.set(messageId, serialized);
  while (sentMessageIds.length > SENT_CACHE_LIMIT) {
    const oldest = sentMessageIds.shift();
    if (oldest) sentPayloads.delete(oldest);
  }
}

function getYouTubeMessageDataPayload(message: HTMLElement): YouTubeMessageData | null {
  const messageId = getMessageId(message);
  if (!messageId) return null;

  const rendererData = (message as MessageRenderer).data;
  if (!rendererData || typeof rendererData !== 'object' || Array.isArray(rendererData)) return null;
  const data = rendererData as DataRecord;

  const payload: YouTubeMessageData = { messageId };
  const timestampUsec = getTextValue(data.timestampUsec);
  const authorExternalChannelId = getTextValue(data.authorExternalChannelId);
  const authorName = getFormattedText(data.authorName);
  const authorPhotoUrl = getThumbnailUrl(data.authorPhoto);

  if (timestampUsec) payload.timestampUsec = timestampUsec;
  if (authorExternalChannelId) payload.authorExternalChannelId = authorExternalChannelId;
  if (authorName) payload.authorName = authorName;
  if (authorPhotoUrl) payload.authorPhotoUrl = authorPhotoUrl;

  return Object.keys(payload).length > 1 ? payload : null;
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

function getFormattedText(value: unknown): string {
  if (typeof value === 'string') return cleanText(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as DataRecord;
  const simpleText = getTextValue(record.simpleText);
  if (simpleText) return simpleText;
  if (!Array.isArray(record.runs)) return '';
  return cleanText(record.runs
    .map((run) => run && typeof run === 'object' && !Array.isArray(run)
      ? getTextValue((run as DataRecord).text)
      : '')
    .join(''));
}

function getThumbnailUrl(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const thumbnails = (value as DataRecord).thumbnails;
  if (!Array.isArray(thumbnails)) return '';
  for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
    const thumbnail = thumbnails[index];
    if (!thumbnail || typeof thumbnail !== 'object' || Array.isArray(thumbnail)) continue;
    const url = getTextValue((thumbnail as DataRecord).url);
    if (url) return url;
  }
  return '';
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
