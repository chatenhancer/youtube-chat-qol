/**
 * Controller for the optional Lite chat surface.
 *
 * YouTube continues to own the header, composer, transport, and chat mode. The
 * controller replaces only the native item list and discards it as soon as Lite
 * takes ownership so the browser can reclaim its subtree. Returning to native
 * chat reloads only the chat document while a loading surface remains visible.
 * Automatic failures retain a one-document cooldown across that reload.
 */
import type { YouTubeChatFeedAction, YouTubeChatFeedTransportBatch } from '../../youtube/chat-feed/protocol';
import { MAX_YOUTUBE_CHAT_FEED_CONTINUATION_TIMEOUT_MS } from '../../youtube/chat-feed/batch';
import {
  cleanupStaleLiteModeDom,
  discardNativeList,
  findNativeList,
  inspectDetachedNativeLists,
  isNativeFeedDiscarded,
  NATIVE_HIDDEN_CLASS,
  NATIVE_LIST_SELECTOR,
  NATIVE_RETAINER_ATTRIBUTE,
  resetDetachedNativeListDiagnostics,
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
import {
  getLiteModeFallbackCode,
  type LiteModeAutomaticFailureReason
} from './fallback';
import { t } from '../../shared/i18n';
import {
  getYouTubeChatFeedReplayDiagnostics,
  subscribeYouTubeChatFeed,
  type YouTubeChatFeedBatch,
  type YouTubeChatFeedError
} from '../../youtube/chat-feed/source';
import { getYouTubeChatFeedRecordState } from '../../youtube/chat-feed/records';

export const LITE_MODE_FALLBACK_EVENT = 'ytcq:lite-mode-fallback';

const NATIVE_CHAT_RENDERER_SELECTOR = 'yt-live-chat-renderer';
const NATIVE_HIDE_TIMESTAMPS_ATTRIBUTE = 'hide-timestamps';
const NATIVE_TIMESTAMP_TOGGLE_SELECTOR =
  'yt-live-chat-toggle-renderer tp-yt-paper-toggle-button';
const NATIVE_TICKER_SELECTOR = 'yt-live-chat-ticker-renderer, #ticker';
const STARTUP_TIMEOUT_MS = 20_000;
const REPLAY_STARTUP_TIMEOUT_MS = 45_000;
const DEFAULT_SOURCE_TIMEOUT_MS = 35_000;
const MAX_SOURCE_WATCHDOG_MS = MAX_YOUTUBE_CHAT_FEED_CONTINUATION_TIMEOUT_MS * 2 + 5_000;
// One-off YouTube message types are skipped without disrupting Lite mode. Three
// independent unreadable feed batches without a supported message indicate
// that the main feed schema, rather than one special row, is no longer usable.
const MAX_UNREADABLE_FEED_BATCHES_WITHOUT_PROGRESS = 3;

export type LiteModeStopReason =
  | 'explicit'
  | 'cleanup'
  | LiteModeAutomaticFailureReason;

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
let renderer: LiteChatRenderer | null = null;
let store: LiteChatStore | null = null;
let nativeRestorePending = false;
let nativeUiObserver: MutationObserver | null = null;
let observedNativeUiTargets: Element[] = [];
let startupTimer = 0;
let sourceTimer = 0;
let timestampSyncTimer = 0;
let feedReady = false;
let unreadableFeedBatchesWithoutProgress = 0;
let rowRenderedCallback: LiteChatRowRenderedCallback | null = null;
let batchListeners = new AbortController();
let unsubscribeChatFeed: (() => void) | null = null;
let documentUnloading = false;

export function startLiteMode(options: StartLiteModeOptions = {}): void {
  if (!isSupportedLiteModePage()) {
    clearLiteModeBootstrapIntent();
    return;
  }
  if (nativeRestorePending) return;
  if (active) return;

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
  feedReady = false;
  unreadableFeedBatchesWithoutProgress = 0;
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
  const initialFeedState = getYouTubeChatFeedRecordState();
  const initialRecords = initialFeedState.records;
  if (initialRecords.length) {
    applyStoreActions(
      initialRecords.map((record) => ({ record, type: 'upsert' })),
      'initial'
    );
  }
  if (initialFeedState.ready) {
    // The record store has already observed the shared feed, including the
    // valid empty-feed case, so Lite does not need another initial request.
    markLiteModeFeedReady();
  }

  batchListeners.abort();
  batchListeners = new AbortController();
  unsubscribeChatFeed?.();
  unsubscribeChatFeed = subscribeYouTubeChatFeed({
    consumer: 'lite',
    onBatch: handleLiteChatBatch,
    onError: handleLiteChatFeedError,
    // The record store can become ready before YouTube mounts its native
    // startup rows. If it is still empty, capture those rows synchronously
    // while the native list is connected, immediately before discarding it.
    requestInitial: initialRecords.length === 0
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
  // Reuse records already captured before feature boot. The always-on record
  // store owns initial capture, and Lite receives the same batch if it is still
  // in flight.
  discardNativeListIfPresent();
  // The root changes size when the native list disappears. Pin once against
  // that final layout so restored history starts at the live edge.
  renderer?.scrollToLiveEdge();
  nativeUiObserver = new MutationObserver(handleNativeUiMutations);
  refreshNativeUiObserverTargets();
  scheduleStartupTimeout();
  syncNativeTimestampToggle();
}

export function stopLiteMode(reason: LiteModeStopReason = 'explicit'): void {
  if (nativeRestorePending) return;
  const automaticFailure = isAutomaticFailureReason(reason);
  if (automaticFailure) {
    sessionDisabled = true;
    setLiteModeSessionCooldown();
  }

  if (reason !== 'cleanup' && isNativeFeedDiscarded()) {
    beginNativeRestore(reason, automaticFailure);
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

  if (automaticFailure && notifyFallback && isAutomaticFailureReason(reason)) {
    const code = getLiteModeFallbackCode(reason);
    window.dispatchEvent(new CustomEvent(LITE_MODE_FALLBACK_EVENT, {
      detail: JSON.stringify({ code, reason })
    }));
  }
}

function beginNativeRestore(reason: LiteModeStopReason, automaticFailure: boolean): void {
  nativeRestorePending = true;
  active = false;
  clearStartupTimer();
  clearSourceTimer();
  clearTimestampSyncTimer();
  unsubscribeLiteChatFeed();
  batchListeners.abort();
  batchListeners = new AbortController();
  nativeUiObserver?.disconnect();
  nativeUiObserver = null;
  observedNativeUiTargets = [];
  clearLiteModeBootstrapIntent();
  requestNativeChatRestore({
    automaticFailure,
    ...(automaticFailure && isAutomaticFailureReason(reason)
      ? { fallbackCode: getLiteModeFallbackCode(reason) }
      : {}),
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

export function hasRetainedLiteModeMessage(messageId: string): boolean {
  const id = messageId.trim();
  return active && Boolean(id && store?.get(id));
}

export function revealRetainedLiteModeMessage(messageId: string): HTMLElement | null {
  const id = messageId.trim();
  if (!active || !id || !store?.get(id)) return null;
  return renderer?.revealMessage(id) || null;
}

function handleLiteChatBatch(batch: YouTubeChatFeedBatch): void {
  if (!active) return;
  const isTransportDelivery = batch.delivery === 'transport';
  if (isTransportDelivery) {
    if (batch.fatalErrors?.length) {
      if (isTransientYouTubeFeedFailure(batch.fatalErrors)) {
        waitForLiteModeFeedRecovery();
        return;
      }
      failLiteMode('unreadable-response');
      return;
    }
    if (!isFeedCompatibilityHealthy(batch)) {
      failLiteMode('unreadable-feed');
      return;
    }
    if (isSourceHeartbeat(batch.source)) markLiteModeFeedReady();
  }
  applyStoreActions(batch.actions, batch.source);
  refreshLiteMemoryDiagnostics(isTransportDelivery);
  if (!active) return;
  if (isTransportDelivery && isSourceHeartbeat(batch.source)) {
    scheduleSourceWatchdog(batch.continuationTimeoutMs);
  }
}

function handleLiteChatFeedError(error: YouTubeChatFeedError): void {
  failLiteMode(error);
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

function applyStoreActions(
  actions: readonly YouTubeChatFeedAction[],
  source: YouTubeChatFeedTransportBatch['source']
): void {
  renderer?.rememberActionSources(actions, source);
  store?.apply(actions);
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
  refreshLiteMemoryDiagnostics(true);
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
}

function refreshNativeUiObserverTargets(): void {
  const targets = [
    ...document.querySelectorAll<HTMLElement>(NATIVE_CHAT_RENDERER_SELECTOR),
    ...getNativeTimestampToggles()
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
    mutation.target.closest(`${NATIVE_LIST_SELECTOR}, .ytcq-lite-root`)
  ) {
    return false;
  }
  return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
    if (!(node instanceof Element)) return false;
    return node.matches('yt-live-chat-toggle-renderer') ||
      node.matches(NATIVE_CHAT_RENDERER_SELECTOR) ||
      node.matches(NATIVE_TIMESTAMP_TOGGLE_SELECTOR) ||
      Boolean(node.querySelector(NATIVE_TIMESTAMP_TOGGLE_SELECTOR)) ||
      Boolean(node.querySelector(NATIVE_CHAT_RENDERER_SELECTOR));
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

function scheduleSourceWatchdog(continuationTimeoutMs: number | undefined): void {
  clearSourceTimer();
  if (window.location.pathname === '/live_chat_replay') return;
  const providerTimeout = continuationTimeoutMs || 0;
  const timeout = providerTimeout
    ? Math.min(MAX_SOURCE_WATCHDOG_MS, Math.max(12_000, providerTimeout * 2 + 5_000))
    : DEFAULT_SOURCE_TIMEOUT_MS;
  sourceTimer = window.setTimeout(() => {
    sourceTimer = 0;
    if (document.visibilityState === 'hidden') {
      scheduleSourceWatchdog(continuationTimeoutMs);
      return;
    }
    failLiteMode('source-timeout');
  }, timeout);
}

function scheduleStartupTimeout(): void {
  clearStartupTimer();
  if (!active || feedReady) return;
  const timeout = window.location.pathname === '/live_chat_replay'
    ? REPLAY_STARTUP_TIMEOUT_MS
    : STARTUP_TIMEOUT_MS;
  startupTimer = window.setTimeout(() => {
    startupTimer = 0;
    if (document.visibilityState === 'hidden') {
      scheduleStartupTimeout();
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
  unsubscribeLiteChatFeed();
  batchListeners.abort();
  batchListeners = new AbortController();
  nativeUiObserver?.disconnect();
  nativeUiObserver = null;
  observedNativeUiTargets = [];
  revealConnectedNativeLists();
  renderer?.destroy();
  renderer = null;
  store = null;
  resetDetachedNativeListDiagnostics();
  feedReady = false;
  unreadableFeedBatchesWithoutProgress = 0;
  documentUnloading = false;
  if (clearIntent) clearLiteModeBootstrapIntent();
}

function unsubscribeLiteChatFeed(): void {
  unsubscribeChatFeed?.();
  unsubscribeChatFeed = null;
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

function markLiteModeFeedReady(): void {
  if (feedReady) return;
  feedReady = true;
  clearStartupTimer();
  renderer?.setConnectionState('connected');
}

function waitForLiteModeFeedRecovery(): void {
  feedReady = false;
  clearSourceTimer();
  renderer?.setConnectionState('connecting');
  // YouTube retries temporary server failures itself. Keep the original
  // recovery deadline when several failed responses arrive in succession.
  if (!startupTimer) scheduleStartupTimeout();
}

function isTransientYouTubeFeedFailure(errors: readonly string[]): boolean {
  return errors.every((error) => /^response:http-(?:429|5\d\d)$/.test(error));
}

function isAutomaticFailureReason(
  reason: LiteModeStopReason
): reason is LiteModeAutomaticFailureReason {
  return !['explicit', 'cleanup'].includes(reason);
}

function isSourceHeartbeat(source: YouTubeChatFeedTransportBatch['source']): boolean {
  return source === 'live' || source === 'replay';
}

function isFeedCompatibilityHealthy(batch: YouTubeChatFeedBatch): boolean {
  if (batch.transportHadUpsert || batch.actions.some((action) => action.type === 'upsert')) {
    unreadableFeedBatchesWithoutProgress = 0;
    return true;
  }
  if (!batch.unreadableFeed) return true;
  unreadableFeedBatchesWithoutProgress += 1;
  return unreadableFeedBatchesWithoutProgress < MAX_UNREADABLE_FEED_BATCHES_WITHOUT_PROGRESS;
}

function refreshLiteMemoryDiagnostics(sampleNative = false): void {
  const root = renderer?.root;
  if (!root) return;
  const replayDiagnostics = getYouTubeChatFeedReplayDiagnostics();
  root.dataset.ytcqLiteStoreSize = String(store?.getSize() || 0);
  root.dataset.ytcqLiteStoreBytes = String(store?.getRetainedBytes() || 0);
  root.dataset.ytcqLitePendingLiveActions = '0';
  root.dataset.ytcqLitePendingLiveActionBytes = '0';
  root.dataset.ytcqLitePendingReplayActions = String(replayDiagnostics.pendingActions);
  root.dataset.ytcqLitePendingReplayActionBytes = String(replayDiagnostics.pendingActionBytes);
  if (!sampleNative) return;

  const detached = inspectDetachedNativeLists();
  root.dataset.ytcqLiteDetachedNativeAlive = String(detached.aliveCount);
  root.dataset.ytcqLiteDetachedNativeTracked = String(detached.trackedCount);
  root.dataset.ytcqLiteDetachedNativeRepopulations = String(detached.repopulationCount);
  root.dataset.ytcqLiteDetachedNativeReclaimedDescendants = String(
    detached.reclaimedDescendantCount
  );
  root.dataset.ytcqLiteNativeTickerElements = String(
    Array.from(document.querySelectorAll<HTMLElement>(NATIVE_TICKER_SELECTOR))
      .reduce((count, ticker) => count + 1 + ticker.querySelectorAll('*').length, 0)
  );
}

function reportLiteModeError(error: unknown): void {
  const reportError = (globalThis as { reportError?: (value: unknown) => void }).reportError;
  try {
    reportError?.(error);
  } catch {
    // One optional callback must not take down the Lite renderer.
  }
}
