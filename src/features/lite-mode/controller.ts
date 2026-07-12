/**
 * Controller for the optional Lite chat surface.
 *
 * YouTube continues to own the header, composer, transport, and chat mode. The
 * controller replaces only the native item list and discards it as soon as Lite
 * takes ownership so the browser can reclaim its subtree. Returning to native
 * chat reloads only the chat document while a loading surface remains visible.
 * Automatic failures retain a one-document cooldown across that reload.
 */
import {
  LITE_CHAT_BATCH_EVENT,
  type LiteChatAction,
  type LiteChatBatch
} from './protocol';
import {
  MAX_LITE_CHAT_CONTINUATION_TIMEOUT_MS,
  parseLiteChatBatchDetail
} from './batch';
import {
  cleanupStaleLiteModeDom,
  discardNativeList,
  findNativeList,
  isNativeFeedDiscarded,
  NATIVE_HIDDEN_CLASS,
  NATIVE_LIST_SELECTOR,
  NATIVE_RETAINER_ATTRIBUTE,
  revealConnectedNativeLists
} from './native-list';
import {
  clearLiteModeBootstrapIntent,
  clearLiteModeSessionCooldown,
  dispatchLiteChatControl,
  hasLiteModeSessionCooldown,
  isSupportedLiteModePage,
  requestNativeChatRestore,
  requestReplayLiteModeReload,
  setLiteModeBootstrapIntent,
  setLiteModeSessionCooldown
} from './bootstrap';
import {
  createLiteChatRenderer,
  type LiteChatRenderer,
  type LiteChatRowRenderedCallback
} from './renderer';
import { createLiteChatStore, type LiteChatStore } from './store';
import { t } from '../../shared/i18n';

export { parseLiteChatBatchDetail } from './batch';

export const LITE_MODE_FALLBACK_EVENT = 'ytcq:lite-mode-fallback';

const NATIVE_CHAT_RENDERER_SELECTOR = 'yt-live-chat-renderer';
const NATIVE_HIDE_TIMESTAMPS_ATTRIBUTE = 'hide-timestamps';
const NATIVE_TIMESTAMP_TOGGLE_SELECTOR =
  'yt-live-chat-toggle-renderer tp-yt-paper-toggle-button';
const PARTICIPANT_LIST_SELECTOR = 'yt-live-chat-participant-list-renderer';
const STARTUP_TIMEOUT_MS = 20_000;
const REPLAY_STARTUP_TIMEOUT_MS = 45_000;
const DEFAULT_SOURCE_TIMEOUT_MS = 35_000;
const MAX_SOURCE_WATCHDOG_MS = MAX_LITE_CHAT_CONTINUATION_TIMEOUT_MS * 2 + 5_000;
const DEFAULT_LIVE_ACTION_WINDOW_MS = 1_000;
const MAX_LIVE_ACTION_WINDOW_MS = 5_000;
const MIN_LIVE_ACTION_INTERVAL_MS = 25;
const MAX_LIVE_ACTION_INTERVAL_MS = 2_500;
const MAX_LIVE_ACTIONS_PER_TICK = 16;
const MAX_PENDING_LIVE_ACTIONS = 2_000;
const MAX_PENDING_REPLAY_ACTIONS = 2_000;
// One-off YouTube message types are skipped without disrupting Lite mode. Three
// independent unreadable feed batches without a supported message indicate
// that the main feed schema, rather than one special row, is no longer usable.
const MAX_UNREADABLE_FEED_BATCHES_WITHOUT_PROGRESS = 3;
const REPLAY_BACKWARD_SEEK_THRESHOLD_MS = 1_000;
const YOUTUBE_PLAYER_PROGRESS_KEY = 'yt-player-video-progress';

export type LiteModeStopReason =
  | 'explicit'
  | 'cleanup'
  | 'startup-timeout'
  | 'source-timeout'
  | 'invalid-batch'
  | 'non-monotonic-sequence'
  | 'sequence-gap'
  | 'unreadable-response'
  | 'unreadable-feed'
  | 'action-backlog'
  | 'root-replaced';

export interface StartLiteModeOptions {
  /** Explicit off-to-on retries can bypass a previous automatic session cooldown. */
  clearCooldown?: boolean;
}

export interface RefreshLiteModeOptions {
  /** Set only for a deliberate user retry, never for normal option hydration. */
  userInitiatedRetry?: boolean;
}

export interface CleanupLiteModeOptions {
  /**
   * Defaults to true so stale cleanup before option hydration does not reveal
   * native chat between the document-start intent and normal boot.
   */
  preserveBootstrapIntent?: boolean;
}

let active = false;
let sessionDisabled = false;
let lastRefreshEnabled: boolean | undefined;
let lastSequence = -1;
let renderer: LiteChatRenderer | null = null;
let store: LiteChatStore | null = null;
let nativeRestorePending = false;
let nativeUiObserver: MutationObserver | null = null;
let observedNativeUiTargets: Element[] = [];
let startupTimer = 0;
let sourceTimer = 0;
let timestampSyncTimer = 0;
let liveActionTimer = 0;
let liveActionIntervalMs = MAX_LIVE_ACTION_INTERVAL_MS;
let liveActionsPerTick = 1;
let pendingLiveActions: LiteChatAction[] = [];
let pendingReplayActions: LiteChatAction[] = [];
let replayProgressMs: number | null = null;
let replayRequestsIdentifySeeks = false;
let receivedSourceBatch = false;
let unreadableFeedBatchesWithoutProgress = 0;
let lastContinuationTimeoutMs: number | undefined;
let participantsPanelSelected = false;
let rowRenderedCallback: LiteChatRowRenderedCallback | null = null;
let batchListeners = new AbortController();
let documentUnloading = false;

export function startLiteMode(options: StartLiteModeOptions = {}): void {
  if (!isSupportedLiteModePage()) {
    clearLiteModeBootstrapIntent();
    return;
  }
  if (nativeRestorePending) return;
  if (active) {
    dispatchLiteChatControl(true);
    return;
  }

  if (options.clearCooldown) {
    clearLiteModeSessionCooldown();
    sessionDisabled = false;
  } else if (sessionDisabled || hasLiteModeSessionCooldown()) {
    sessionDisabled = true;
    clearLiteModeBootstrapIntent();
    dispatchLiteChatControl(false);
    return;
  }

  active = true;
  documentUnloading = false;
  lastSequence = -1;
  receivedSourceBatch = false;
  unreadableFeedBatchesWithoutProgress = 0;
  lastContinuationTimeoutMs = undefined;
  participantsPanelSelected = false;
  setLiteModeBootstrapIntent(true);
  store = createLiteChatStore();
  renderer = createLiteChatRenderer(store, {
    onRowRendered: (row, record, source) => {
      try {
        rowRenderedCallback?.(row, record, source);
      } catch (error) {
        reportLiteModeError(error);
      }
    }
  });
  mountLiteRoot();

  batchListeners.abort();
  batchListeners = new AbortController();
  window.addEventListener(LITE_CHAT_BATCH_EVENT, handleLiteChatBatchEvent, {
    signal: batchListeners.signal
  });
  document.addEventListener('click', handleNativeTimestampToggleClick, {
    capture: true,
    signal: batchListeners.signal
  });
  window.addEventListener('beforeunload', handleDocumentUnload, {
    capture: true,
    signal: batchListeners.signal
  });
  window.addEventListener('pagehide', handleDocumentUnload, {
    capture: true,
    signal: batchListeners.signal
  });
  window.addEventListener('pageshow', handleDocumentShow, {
    capture: true,
    signal: batchListeners.signal
  });
  window.addEventListener('message', handleYouTubePlayerProgress, {
    signal: batchListeners.signal
  });
  // Attach the receiver before draining the buffered startup snapshot, while
  // the page-world handler can still merge data from the connected native list.
  dispatchLiteChatControl(true, true);
  discardNativeListIfPresent();
  nativeUiObserver = new MutationObserver(handleNativeUiMutations);
  refreshNativeUiObserverTargets();
  scheduleStartupTimeout();
  syncNativeTimestampToggle();
  syncParticipantsPanelState();
}

export function stopLiteMode(reason: LiteModeStopReason = 'explicit'): void {
  if (nativeRestorePending) return;
  const automaticFailure = isAutomaticFailureReason(reason);
  if (automaticFailure) {
    sessionDisabled = true;
    setLiteModeSessionCooldown();
  }

  if (reason !== 'cleanup' && isNativeFeedDiscarded()) {
    beginNativeRestore(automaticFailure);
    return;
  }

  completeLiteModeStop(reason, automaticFailure);
}

function completeLiteModeStop(
  reason: LiteModeStopReason,
  automaticFailure: boolean,
  notifyFallback = true
): void {
  teardownLiteMode(true);

  if (automaticFailure && notifyFallback) {
    window.dispatchEvent(new CustomEvent(LITE_MODE_FALLBACK_EVENT, {
      detail: JSON.stringify({ reason })
    }));
  }
}

function beginNativeRestore(automaticFailure: boolean): void {
  nativeRestorePending = true;
  active = false;
  clearStartupTimer();
  clearSourceTimer();
  clearTimestampSyncTimer();
  clearPacedActionQueues();
  batchListeners.abort();
  batchListeners = new AbortController();
  nativeUiObserver?.disconnect();
  nativeUiObserver = null;
  observedNativeUiTargets = [];
  dispatchLiteChatControl(false);
  clearLiteModeBootstrapIntent();
  requestNativeChatRestore({
    automaticFailure,
    message: t('liteModeLoadingChat')
  });
}

export function refreshLiteMode(
  enabled: boolean,
  options: RefreshLiteModeOptions = {}
): void {
  const deliberateRetry = enabled && (
    options.userInitiatedRetry === true || lastRefreshEnabled === false
  );
  lastRefreshEnabled = enabled;
  if (!enabled) {
    stopLiteMode('explicit');
    return;
  }
  if (
    deliberateRetry &&
    window.location.pathname === '/live_chat_replay' &&
    !active &&
    !isNativeFeedDiscarded()
  ) {
    clearLiteModeSessionCooldown();
    sessionDisabled = false;
    requestReplayLiteModeReload();
    return;
  }
  startLiteMode({ clearCooldown: deliberateRetry });
}

export function cleanupLiteMode(options: CleanupLiteModeOptions = {}): void {
  const preserveBootstrapIntent = options.preserveBootstrapIntent !== false;
  const hadLiteModeSurface = active || isNativeFeedDiscarded() || Boolean(document.querySelector(
    `.ytcq-lite-root, template[${NATIVE_RETAINER_ATTRIBUTE}], .${NATIVE_HIDDEN_CLASS}`
  ));
  if (preserveBootstrapIntent && hadLiteModeSurface) {
    setLiteModeBootstrapIntent(true);
  }
  // Advance the page adapter generation so a replacement content-script
  // instance can request a fresh initial seed after extension reload.
  teardownLiteMode(!preserveBootstrapIntent);
  cleanupStaleLiteModeDom();
}

export function isLiteModeActive(): boolean {
  return active;
}

export function setLiteModeRowRenderedCallback(
  callback: LiteChatRowRenderedCallback | null
): void {
  rowRenderedCallback = callback;
}

export function getLiteModeMessageElement(messageId: string): HTMLElement | null {
  return renderer?.getMessageElement(messageId) || null;
}

function handleLiteChatBatchEvent(event: Event): void {
  if (!active) return;
  if (!(event instanceof CustomEvent)) {
    failLiteMode('invalid-batch');
    return;
  }

  const batch = parseLiteChatBatchDetail(event.detail);
  if (!batch) {
    failLiteMode('invalid-batch');
    return;
  }
  if (lastSequence >= 0 && batch.sequence !== lastSequence + 1) {
    const reason = batch.sequence <= lastSequence ? 'non-monotonic-sequence' : 'sequence-gap';
    failLiteMode(reason);
    return;
  }
  if (batch.fatalErrors?.length) {
    failLiteMode('unreadable-response');
    return;
  }

  lastSequence = batch.sequence;
  if (batch.source === 'replay' && batch.replayPlayerOffsetMs !== undefined) {
    replayRequestsIdentifySeeks = true;
    replayProgressMs = batch.replayPlayerOffsetMs;
  }
  if (!isFeedCompatibilityHealthy(batch)) {
    failLiteMode('unreadable-feed');
    return;
  }
  if (isSourceHeartbeat(batch.source) && !receivedSourceBatch) {
    receivedSourceBatch = true;
    clearStartupTimer();
    renderer?.setConnectionState('connected');
  }
  applyBatchActions(batch);
  if (!active) return;
  if (isSourceHeartbeat(batch.source)) {
    scheduleSourceWatchdog(batch.continuationTimeoutMs);
  }
}

function mountLiteRoot(): void {
  const root = renderer?.root;
  if (!root) return;
  const nativeList = findNativeList();
  if (nativeList?.parentNode) {
    nativeList.parentNode.insertBefore(root, nativeList);
    return;
  }

  const chatRenderer = document.querySelector<HTMLElement>('yt-live-chat-renderer');
  if (chatRenderer) {
    const input = chatRenderer.querySelector<HTMLElement>('yt-live-chat-message-input-renderer');
    chatRenderer.insertBefore(root, input?.parentElement === chatRenderer ? input : null);
    return;
  }
  (document.body || document.documentElement).append(root);
}

function applyBatchActions(batch: LiteChatBatch): void {
  // A clientMessages refresh is one state replacement, not a burst of live
  // velocity. Apply its snapshot immediately, but keep replay-wrapped actions
  // synchronized to the video even when they were buffered into the seed.
  if (batch.actions.some((action) => action.type === 'reset')) {
    clearLiveActionQueue();
    clearReplayActionQueue();
    const timedReplayActions = batch.actions.filter(hasReplayOffset);
    const immediateActions = batch.actions.filter((action) => !hasReplayOffset(action));
    applyStoreActions(immediateActions, batch.source);
    enqueueReplayActions(timedReplayActions);
    return;
  }
  if (batch.source === 'replay') {
    enqueueReplayActions(batch.actions);
    return;
  }
  if (batch.source !== 'live' || batch.actions.length === 0) {
    applyStoreActions(batch.actions, batch.source);
    return;
  }
  if (!liveActionTimer && !pendingLiveActions.length && batch.actions.length === 1) {
    applyStoreActions(batch.actions, batch.source);
    return;
  }
  if (pendingLiveActions.length + batch.actions.length > MAX_PENDING_LIVE_ACTIONS) {
    failLiteMode('action-backlog');
    return;
  }

  // Keep every live action in transport order. A later delete/reset must not
  // leapfrog a queued upsert, and a later single-message batch must not either.
  pendingLiveActions.push(...batch.actions);
  // YouTube can hold a continuation for several seconds. Pace the whole batch
  // across that expected response window so the queue does not drain into a
  // visible pause before the next continuation arrives. Busy batches still use
  // shorter intervals and multiple actions per tick to avoid a backlog.
  const actionWindowMs = batch.continuationTimeoutMs && batch.continuationTimeoutMs > 0
    ? Math.min(batch.continuationTimeoutMs, MAX_LIVE_ACTION_WINDOW_MS)
    : DEFAULT_LIVE_ACTION_WINDOW_MS;
  const nextInterval = Math.max(
    MIN_LIVE_ACTION_INTERVAL_MS,
    Math.min(MAX_LIVE_ACTION_INTERVAL_MS, Math.floor(actionWindowMs / batch.actions.length))
  );
  const nextActionsPerTick = Math.max(
    1,
    Math.min(
      MAX_LIVE_ACTIONS_PER_TICK,
      Math.ceil((batch.actions.length * nextInterval) / actionWindowMs)
    )
  );
  liveActionIntervalMs = liveActionTimer
    ? Math.min(liveActionIntervalMs, nextInterval)
    : nextInterval;
  liveActionsPerTick = liveActionTimer
    ? Math.max(liveActionsPerTick, nextActionsPerTick)
    : nextActionsPerTick;
  if (!liveActionTimer) {
    liveActionTimer = window.setTimeout(drainPendingLiveActions, liveActionIntervalMs);
  }
}

function applyStoreActions(
  actions: readonly LiteChatAction[],
  source: LiteChatBatch['source']
): void {
  renderer?.rememberActionSources(actions, source);
  store?.apply(actions);
}

function drainPendingLiveActions(): void {
  liveActionTimer = 0;
  if (!active || !pendingLiveActions.length) return;
  const actionCount = Math.min(
    MAX_LIVE_ACTIONS_PER_TICK,
    pendingLiveActions.length,
    Math.max(liveActionsPerTick, Math.ceil(pendingLiveActions.length / 100))
  );
  applyStoreActions(pendingLiveActions.splice(0, actionCount), 'live');
  if (!pendingLiveActions.length) {
    liveActionIntervalMs = MAX_LIVE_ACTION_INTERVAL_MS;
    liveActionsPerTick = 1;
    return;
  }
  liveActionTimer = window.setTimeout(drainPendingLiveActions, liveActionIntervalMs);
}

function enqueueReplayActions(actions: readonly LiteChatAction[]): void {
  if (!actions.length) return;
  if (pendingReplayActions.length + actions.length > MAX_PENDING_REPLAY_ACTIONS) {
    failLiteMode('action-backlog');
    return;
  }
  pendingReplayActions.push(...actions);
  drainPendingReplayActions();
}

function drainPendingReplayActions(): void {
  if (!active || !pendingReplayActions.length) return;
  let dueCount = 0;
  for (const action of pendingReplayActions) {
    const offset = action.replayOffsetMs;
    if (offset !== undefined && offset > 0 && (replayProgressMs === null || offset > replayProgressMs)) {
      break;
    }
    dueCount += 1;
  }
  if (!dueCount) return;
  applyStoreActions(pendingReplayActions.splice(0, dueCount), 'replay');
}

function handleYouTubePlayerProgress(event: MessageEvent): void {
  if (!active || window.location.pathname !== '/live_chat_replay') return;
  // The signal can originate from a nested player window rather than this
  // frame's direct parent. Treat only the bounded numeric payload as trusted.
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
    applyStoreActions([{ type: 'reset' }], 'replay');
  }
  replayProgressMs = nextProgressMs;
  drainPendingReplayActions();
}

function hasReplayOffset(action: LiteChatAction): boolean {
  return action.type !== 'reset' && action.replayOffsetMs !== undefined;
}

function discardNativeListIfPresent(): void {
  if (!active) return;
  const currentNativeList = findNativeList();
  if (!currentNativeList) return;
  const timestampsVisible = sampleNativeTimestampsVisible(currentNativeList);
  if (timestampsVisible !== null) renderer?.setTimestampsVisible(timestampsVisible);
  renderer?.root && currentNativeList.before(renderer.root);
  currentNativeList.classList.add(NATIVE_HIDDEN_CLASS);
  currentNativeList.setAttribute('aria-hidden', 'true');
  discardNativeList(currentNativeList);
}

export function handleLiteModeDomMutations(mutations: readonly MutationRecord[]): void {
  if (!active) return;
  if (mutations.every((mutation) =>
    mutation.target instanceof Element && Boolean(mutation.target.closest('.ytcq-lite-root'))
  )) {
    return;
  }
  if (mutations.some(mutationTouchesNativeUi)) {
    refreshNativeUiObserverTargets();
    syncNativeTimestampToggle();
    syncParticipantsPanelState();
  }
  const root = renderer?.root;
  if (!root?.isConnected) {
    failLiteMode('root-replaced');
    return;
  }
  if (mutations.some(mutationAddsNativeList)) discardNativeListIfPresent();
}

function mutationAddsNativeList(mutation: MutationRecord): boolean {
  return Array.from(mutation.addedNodes).some((node) =>
    node instanceof Element && (
      node.matches(NATIVE_LIST_SELECTOR) || Boolean(node.querySelector(NATIVE_LIST_SELECTOR))
    )
  );
}

function handleDocumentUnload(): void {
  documentUnloading = true;
}

function handleDocumentShow(): void {
  documentUnloading = false;
}

function handleNativeUiMutations(mutations: MutationRecord[]): void {
  if (!active) return;
  if (mutations.some((mutation) =>
    mutation.target instanceof Element &&
    (
      mutation.target.matches(NATIVE_CHAT_RENDERER_SELECTOR) ||
      isNativeTimestampToggle(mutation.target)
    )
  )) {
    syncNativeTimestampToggle();
  }
  if (mutations.some((mutation) =>
    mutation.target instanceof Element &&
    mutation.target.matches(PARTICIPANT_LIST_SELECTOR)
  )) {
    syncParticipantsPanelState();
  }
}

function refreshNativeUiObserverTargets(): void {
  const targets = [
    ...document.querySelectorAll<HTMLElement>(NATIVE_CHAT_RENDERER_SELECTOR),
    ...getNativeTimestampToggles(),
    ...document.querySelectorAll<HTMLElement>(PARTICIPANT_LIST_SELECTOR)
  ];
  if (
    targets.length === observedNativeUiTargets.length &&
    targets.every((target, index) => target === observedNativeUiTargets[index])
  ) {
    return;
  }

  observedNativeUiTargets = targets;
  nativeUiObserver?.disconnect();
  targets.forEach((target) => {
    nativeUiObserver?.observe(target, {
      attributeFilter: [
        'active',
        'aria-hidden',
        'aria-pressed',
        'aria-selected',
        'checked',
        'class',
        'hidden',
        NATIVE_HIDE_TIMESTAMPS_ATTRIBUTE,
        'selected'
      ],
      attributes: true
    });
  });
}

function mutationTouchesNativeUi(mutation: MutationRecord): boolean {
  if (
    mutation.target instanceof Element &&
    (
      mutation.target.matches(NATIVE_CHAT_RENDERER_SELECTOR) ||
      mutation.target.matches('yt-live-chat-toggle-renderer')
    )
  ) {
    return true;
  }
  if (
    mutation.target instanceof Element &&
    mutation.target.closest(`${NATIVE_LIST_SELECTOR}, .ytcq-lite-root, ${PARTICIPANT_LIST_SELECTOR}`)
  ) {
    return false;
  }
  return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
    if (!(node instanceof Element)) return false;
    return node.matches('yt-live-chat-toggle-renderer') ||
      node.matches(NATIVE_CHAT_RENDERER_SELECTOR) ||
      node.matches(NATIVE_TIMESTAMP_TOGGLE_SELECTOR) ||
      node.matches(PARTICIPANT_LIST_SELECTOR) ||
      Boolean(node.querySelector(NATIVE_TIMESTAMP_TOGGLE_SELECTOR)) ||
      Boolean(node.querySelector(NATIVE_CHAT_RENDERER_SELECTOR)) ||
      Boolean(node.querySelector(PARTICIPANT_LIST_SELECTOR));
  });
}

function sampleNativeTimestampsVisible(nativeList: HTMLElement): boolean | null {
  const timestamp = Array.from(nativeList.querySelectorAll<HTMLElement>('#timestamp'))
    .find((element) => Boolean(element.textContent?.trim()));
  if (!timestamp) return null;

  const style = window.getComputedStyle(timestamp);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function syncNativeTimestampToggle(): void {
  const chatRenderer = document.querySelector<HTMLElement>(NATIVE_CHAT_RENDERER_SELECTOR);
  if (chatRenderer) {
    renderer?.setTimestampsVisible(
      !chatRenderer.hasAttribute(NATIVE_HIDE_TIMESTAMPS_ATTRIBUTE)
    );
    return;
  }

  const toggle = getNativeTimestampToggles().at(-1);
  if (!toggle) return;

  renderer?.setTimestampsVisible(isNativeTimestampToggleEnabled(toggle));
}

function handleNativeTimestampToggleClick(event: Event): void {
  const toggleRenderer = event.composedPath().find((target): target is HTMLElement =>
    target instanceof Element && target.matches('yt-live-chat-toggle-renderer')
  );
  if (!toggleRenderer || !isNativeTimestampToggleRenderer(toggleRenderer)) return;
  const toggle = toggleRenderer.querySelector<HTMLElement>('tp-yt-paper-toggle-button');
  if (
    !toggle ||
    toggle.hasAttribute('disabled') ||
    toggle.getAttribute('aria-disabled') === 'true'
  ) {
    return;
  }

  const previous = isNativeTimestampToggleEnabled(toggle);
  clearTimestampSyncTimer();
  timestampSyncTimer = window.setTimeout(() => {
    timestampSyncTimer = 0;
    if (!active) return;

    const chatRenderer = document.querySelector<HTMLElement>(NATIVE_CHAT_RENDERER_SELECTOR);
    if (chatRenderer) {
      renderer?.setTimestampsVisible(
        !chatRenderer.hasAttribute(NATIVE_HIDE_TIMESTAMPS_ATTRIBUTE)
      );
      return;
    }

    const connectedToggle = getNativeTimestampToggles().at(-1);
    if (connectedToggle) {
      const connectedState = isNativeTimestampToggleEnabled(connectedToggle);
      if (connectedToggle !== toggle || connectedState !== previous) {
        renderer?.setTimestampsVisible(connectedState);
        return;
      }
    }

    // YouTube often tears down the menu in the same click that changes this
    // setting. If no updated connected control survives, read the detached
    // control once and otherwise apply the click's known toggle transition.
    const detachedState = isNativeTimestampToggleEnabled(toggle);
    renderer?.setTimestampsVisible(
      detachedState === previous ? !previous : detachedState
    );
  }, 0);
}

function getNativeTimestampToggles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('yt-live-chat-toggle-renderer'))
    .filter(isNativeTimestampToggleRenderer)
    .map((toggleRenderer) => toggleRenderer.querySelector<HTMLElement>(
      'tp-yt-paper-toggle-button'
    ))
    .filter((toggle): toggle is HTMLElement => Boolean(toggle));
}

function isNativeTimestampToggle(element: Element): boolean {
  const toggleRenderer = element.matches('yt-live-chat-toggle-renderer')
    ? element
    : element.closest('yt-live-chat-toggle-renderer');
  return toggleRenderer instanceof HTMLElement &&
    isNativeTimestampToggleRenderer(toggleRenderer);
}

function isNativeTimestampToggleRenderer(toggleRenderer: HTMLElement): boolean {
  if (toggleRenderer.dataset.ytcqNativeSetting === 'timestamps') return true;
  const toggle = toggleRenderer.querySelector('tp-yt-paper-toggle-button');
  if (/^timestamps?$/i.test(toggle?.getAttribute('aria-label')?.trim() || '')) return true;
  const clockPath = toggleRenderer.querySelector('yt-icon svg path')?.getAttribute('d') || '';
  return clockPath.startsWith('M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11');
}

function isNativeTimestampToggleEnabled(toggle: Element): boolean {
  return toggle.getAttribute('aria-pressed') === 'true' ||
    toggle.hasAttribute('checked') ||
    toggle.hasAttribute('active');
}

function syncParticipantsPanelState(): void {
  const selected = isNativeParticipantsPanelSelected();
  const root = renderer?.root;
  if (root) {
    root.hidden = selected;
    if (selected) root.setAttribute('aria-hidden', 'true');
    else root.removeAttribute('aria-hidden');
  }
  if (selected === participantsPanelSelected) return;

  participantsPanelSelected = selected;
  if (selected) {
    clearStartupTimer();
    clearSourceTimer();
  } else if (active && receivedSourceBatch) {
    scheduleSourceWatchdog(lastContinuationTimeoutMs);
  } else if (active) {
    scheduleStartupTimeout();
  }
}

function isNativeParticipantsPanelSelected(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(PARTICIPANT_LIST_SELECTOR))
    .some((participantList) => {
      const selected = participantList.classList.contains('iron-selected') ||
        participantList.hasAttribute('selected') ||
        participantList.getAttribute('aria-selected') === 'true';
      return selected &&
        !participantList.hidden &&
        participantList.getAttribute('aria-hidden') !== 'true';
    });
}

function scheduleSourceWatchdog(continuationTimeoutMs: number | undefined): void {
  lastContinuationTimeoutMs = continuationTimeoutMs;
  clearSourceTimer();
  if (
    window.location.pathname === '/live_chat_replay' ||
    participantsPanelSelected
  ) {
    return;
  }
  const providerTimeout = continuationTimeoutMs || 0;
  const timeout = providerTimeout
    ? Math.min(MAX_SOURCE_WATCHDOG_MS, Math.max(12_000, providerTimeout * 2 + 5_000))
    : DEFAULT_SOURCE_TIMEOUT_MS;
  sourceTimer = window.setTimeout(() => {
    sourceTimer = 0;
    if (document.visibilityState === 'hidden' || isNativeParticipantsPanelSelected()) {
      syncParticipantsPanelState();
      if (participantsPanelSelected) return;
      scheduleSourceWatchdog(continuationTimeoutMs);
      return;
    }
    failLiteMode('source-timeout');
  }, timeout);
}

function scheduleStartupTimeout(): void {
  clearStartupTimer();
  if (!active || receivedSourceBatch || participantsPanelSelected) return;
  const timeout = window.location.pathname === '/live_chat_replay'
    ? REPLAY_STARTUP_TIMEOUT_MS
    : STARTUP_TIMEOUT_MS;
  startupTimer = window.setTimeout(() => {
    startupTimer = 0;
    if (document.visibilityState === 'hidden' || isNativeParticipantsPanelSelected()) {
      syncParticipantsPanelState();
      if (!participantsPanelSelected) scheduleStartupTimeout();
      return;
    }
    failLiteMode('startup-timeout');
  }, timeout);
}

function failLiteMode(reason: Exclude<LiteModeStopReason, 'explicit' | 'cleanup'>): void {
  if (!active || documentUnloading) return;
  stopLiteMode(reason);
}

function teardownLiteMode(clearIntent: boolean): void {
  active = false;
  nativeRestorePending = false;
  clearStartupTimer();
  clearSourceTimer();
  clearTimestampSyncTimer();
  clearPacedActionQueues();
  batchListeners.abort();
  batchListeners = new AbortController();
  nativeUiObserver?.disconnect();
  nativeUiObserver = null;
  observedNativeUiTargets = [];
  dispatchLiteChatControl(false);
  revealConnectedNativeLists();
  renderer?.destroy();
  renderer = null;
  store = null;
  lastSequence = -1;
  receivedSourceBatch = false;
  unreadableFeedBatchesWithoutProgress = 0;
  lastContinuationTimeoutMs = undefined;
  participantsPanelSelected = false;
  documentUnloading = false;
  if (clearIntent) clearLiteModeBootstrapIntent();
}

function clearStartupTimer(): void {
  if (!startupTimer) return;
  window.clearTimeout(startupTimer);
  startupTimer = 0;
}

function clearSourceTimer(): void {
  if (!sourceTimer) return;
  window.clearTimeout(sourceTimer);
  sourceTimer = 0;
}

function clearTimestampSyncTimer(): void {
  if (!timestampSyncTimer) return;
  window.clearTimeout(timestampSyncTimer);
  timestampSyncTimer = 0;
}

function clearLiveActionQueue(): void {
  if (liveActionTimer) window.clearTimeout(liveActionTimer);
  liveActionTimer = 0;
  liveActionIntervalMs = MAX_LIVE_ACTION_INTERVAL_MS;
  liveActionsPerTick = 1;
  pendingLiveActions = [];
}

function clearReplayActionQueue(): void {
  pendingReplayActions = [];
}

function clearPacedActionQueues(): void {
  clearLiveActionQueue();
  clearReplayActionQueue();
  replayProgressMs = null;
  replayRequestsIdentifySeeks = false;
}

function isAutomaticFailureReason(reason: LiteModeStopReason): boolean {
  return !['explicit', 'cleanup'].includes(reason);
}

function isSourceHeartbeat(source: LiteChatBatch['source']): boolean {
  return source === 'live' || source === 'replay';
}

function isFeedCompatibilityHealthy(batch: LiteChatBatch): boolean {
  if (batch.actions.some((action) => action.type === 'upsert')) {
    unreadableFeedBatchesWithoutProgress = 0;
    return true;
  }
  if (!batch.unreadableFeed) return true;
  unreadableFeedBatchesWithoutProgress += 1;
  return unreadableFeedBatchesWithoutProgress < MAX_UNREADABLE_FEED_BATCHES_WITHOUT_PROGRESS;
}

function reportLiteModeError(error: unknown): void {
  const reportError = (globalThis as { reportError?: (value: unknown) => void }).reportError;
  try {
    reportError?.(error);
  } catch {
    // One optional callback must not take down the Lite renderer.
  }
}
