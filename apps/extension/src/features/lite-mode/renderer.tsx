/**
 * Same-document renderer for the optional Lite chat feed.
 *
 * Rows are plain HTML with a small native-compatible slot shape. That keeps
 * existing message adapters useful without creating private YouTube custom
 * elements. The renderer mounts a bounded window, pages through retained
 * history in either direction, and keeps incoming messages from moving the
 * window while the user is reading older chat.
 */
import { jsx, el } from '../../shared/jsx-dom';
import { t } from '../../shared/i18n';
import { createSvgIcon, MATERIAL_ICON_VIEW_BOX, MORE_VERTICAL_ICON_PATH } from '../../shared/icons';
import { createLoadingSpinner } from '../../shared/loading-spinner';
import {
  CHAT_LIVE_EDGE_RELEASE_EVENT,
  CHAT_LIVE_EDGE_RETURN_EVENT
} from '../../youtube/chat-scroll';
import { formatMessageTimestampUsec } from '../../youtube/messages';
import type {
  YouTubeChatFeedAction,
  YouTubeChatAuthor,
  YouTubeChatFeedBatchSource,
  YouTubeChatMessageColors,
  YouTubeChatMessageRecord,
  YouTubeChatRichRun
} from '../../youtube/chat-feed/protocol';
import {
  areLiteChatRecordsEqual,
  DEFAULT_LITE_CHAT_RENDER_LIMIT,
  type LiteChatStore,
  type LiteChatStoreChange
} from './store';

const LIVE_EDGE_TOLERANCE_PX = 2;
// Native live chat spreads continuation actions across the observed interval
// between responses. It renders one row at a time when possible, then releases
// ordered groups at the minimum interval when traffic is too fast to keep up.
const LIVE_PRESENTATION_DEFAULT_WINDOW_MS = 10_000;
const LIVE_PRESENTATION_MIN_INTERVAL_MS = 80;
const LIVE_PRESENTATION_MAX_INTERVAL_MS = 1_000;
const LIVE_PRESENTATION_INTERVAL_SAMPLE_LIMIT = 5;
const MAX_PENDING_MESSAGE_COUNT = 999;
const PAGE_LOAD_THRESHOLD_PX = 48;
const LIVE_EDGE_SCROLL_INTENT_MS = 500;
const POINTER_SCROLL_DRAG_THRESHOLD_PX = 4;

interface ActiveScrollPointer {
  id: number;
  lastScrollTop: number;
  moved: boolean;
  startY: number;
}

export type LiteChatRowSource = 'added' | 'changed' | 'existing';
export type LiteChatConnectionState = 'connected' | 'connecting';
export type LiteChatRowRenderedCallback = (
  row: HTMLElement,
  record: YouTubeChatMessageRecord,
  source: LiteChatRowSource
) => void;

export interface CreateLiteChatRendererOptions {
  lastLiveBatchIntervalMs?: number;
  lastLiveBatchReceivedAt?: number;
  nativePresentationEndId?: string;
  onRowRendered?: LiteChatRowRenderedCallback;
  renderLimit?: number;
  timestampsVisible?: boolean;
}

export interface LiteChatRenderer {
  destroy(): void;
  getMessageElement(id: string): HTMLElement | null;
  getPinnedRecordCount(): number;
  hasMessage(id: string): boolean;
  rememberActionSources(
    actions: readonly YouTubeChatFeedAction[],
    origin: YouTubeChatFeedBatchSource,
    receivedAt?: number
  ): void;
  render(): void;
  revealMessage(id: string): HTMLElement | null;
  root: HTMLElement;
  scrollToLiveEdge(): void;
  setConnectionState(state: LiteChatConnectionState): void;
  setTimestampsVisible(visible: boolean): void;
}

export function createLiteChatRenderer(
  store: LiteChatStore,
  options: CreateLiteChatRendererOptions = {}
): LiteChatRenderer {
  const renderLimit = normalizeRenderLimit(options.renderLimit);
  const pageSize = Math.max(1, Math.floor(renderLimit / 2));
  const rowsById = new Map<string, HTMLElement>();
  const renderedRecords = new Map<string, YouTubeChatMessageRecord>();
  const dispatchedRecordIds = new Set<string>();
  const pendingRowSources = new Map<string, LiteChatRowSource>();
  const pendingLivePresentationIds: string[] = [];
  const pendingLivePresentationIdSet = new Set<string>();
  const liveBatchIntervals: number[] = [];
  let stagedActionSources = new Map<string, LiteChatRowSource>();
  let stagedActionOrigin: YouTubeChatFeedBatchSource | null = null;
  let followingLiveEdge = true;
  let frozenEndId = '';
  let pinnedRecords: YouTubeChatMessageRecord[] | null = null;
  let pinnedRenderQueued = false;
  let pendingMessageCount = 0;
  let destroyed = false;
  let scrollFrame = 0;
  let activeScrollPointer: ActiveScrollPointer | null = null;
  let nativePresentationEndId = options.nativePresentationEndId?.trim() || '';
  let livePresentationAnchorAt = performance.now();
  let lastLiveBatchAt: number | null = null;
  let lastLiveBatchReceivedAt =
    typeof options.lastLiveBatchReceivedAt === 'number' &&
    Number.isFinite(options.lastLiveBatchReceivedAt)
      ? options.lastLiveBatchReceivedAt
      : null;
  let livePresentationTimer = 0;
  let returnIntentPending = false;
  let returnIntentTimer = 0;
  const scrollListeners = new AbortController();

  const loadingSpinner = createLoadingSpinner('ytcq-lite-loading-spinner');
  const emptyStateLabel = el<HTMLSpanElement>(
    <span class="ytcq-lite-empty-state-label">{t('liteModeWaitingForChat')}</span>
  );
  const emptyState = el<HTMLDivElement>(
    <div class="ytcq-lite-empty-state" role="status">
      {loadingSpinner}
      {emptyStateLabel}
    </div>
  );
  const items = el<HTMLDivElement>(
    <div id="items" class="ytcq-lite-items">
      {emptyState}
    </div>
  );
  const scrollAnchor = el<HTMLDivElement>(
    <div class="ytcq-lite-scroll-anchor" aria-hidden="true" />
  );
  const scroller = el<HTMLDivElement>(
    <div id="item-scroller" class="ytcq-lite-scroller" tabIndex={0}>
      {items}
      {scrollAnchor}
    </div>
  );
  const newMessagesButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-lite-new-messages"
      hidden
      onClick={() => scrollToLiveEdge()}
    />
  );
  const root = el<HTMLElement>(
    <section
      class="ytcq-lite-root"
      role="log"
      aria-label={t('liteMode')}
      aria-live="polite"
      aria-relevant="additions removals text"
      data-ytcq-following-live-edge="true"
      data-ytcq-observe-removal=""
    >
      {scroller}
      {newMessagesButton}
    </section>
  );

  scroller.addEventListener('scroll', handleScroll, {
    passive: true,
    signal: scrollListeners.signal
  });
  scroller.addEventListener('wheel', handleWheel, {
    passive: true,
    signal: scrollListeners.signal
  });
  scroller.addEventListener('keydown', handleScrollKeyDown, {
    signal: scrollListeners.signal
  });
  scroller.addEventListener('pointerdown', handlePointerDown, {
    passive: true,
    signal: scrollListeners.signal
  });
  window.addEventListener('pointermove', handlePointerMove, {
    passive: true,
    signal: scrollListeners.signal
  });
  window.addEventListener('pointerup', finishPointerScroll, {
    passive: true,
    signal: scrollListeners.signal
  });
  window.addEventListener('pointercancel', finishPointerScroll, {
    passive: true,
    signal: scrollListeners.signal
  });
  window.addEventListener('blur', resetPointerScroll, { signal: scrollListeners.signal });
  scroller.addEventListener(CHAT_LIVE_EDGE_RELEASE_EVENT, requestLiveEdgeRelease, {
    signal: scrollListeners.signal
  });
  scroller.addEventListener(CHAT_LIVE_EDGE_RETURN_EVENT, scrollToLiveEdge, {
    signal: scrollListeners.signal
  });
  const resizeObserver =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (!followingLiveEdge) return;
          // ResizeObserver runs before paint. Pin here alongside the browser
          // anchor so translated text, fonts, and decoded media keep
          // the live edge stable even where CSS scroll anchoring is unavailable.
          pinScrollToBottom();
        })
      : null;
  resizeObserver?.observe(items);

  const unsubscribe = store.subscribe((change) => {
    if (destroyed) return;
    handleStoreChange(change);
  });

  renderRecords(null);
  setConnectionState('connecting');
  setTimestampsVisible(options.timestampsVisible === true);

  return {
    destroy,
    getMessageElement: (id) => rowsById.get(id) || null,
    getPinnedRecordCount: () => pinnedRecords?.length || 0,
    hasMessage: (id) => Boolean(store.get(id) || pinnedRecords?.some((record) => record.id === id)),
    rememberActionSources,
    render: () => renderRecords(null),
    revealMessage,
    root,
    scrollToLiveEdge,
    setConnectionState,
    setTimestampsVisible
  };

  function rememberActionSources(
    actions: readonly YouTubeChatFeedAction[],
    origin: YouTubeChatFeedBatchSource,
    receivedAt?: number
  ): void {
    if (origin === 'initial' && lastLiveBatchAt === null) {
      livePresentationAnchorAt = performance.now();
    } else if (origin === 'live') {
      rememberLiveBatchArrival(performance.now(), receivedAt);
    }
    const source: LiteChatRowSource = origin === 'initial' ? 'existing' : 'added';
    stagedActionSources = new Map();
    stagedActionOrigin = origin;
    for (const action of actions) {
      if (action.type !== 'upsert') continue;
      stagedActionSources.set(
        action.record.id,
        dispatchedRecordIds.has(action.record.id) ? 'changed' : source
      );
    }
    reconcilePinnedRecords(actions);
  }

  function reconcilePinnedRecords(actions: readonly YouTubeChatFeedAction[]): void {
    if (followingLiveEdge || pinnedRecords === null) return;
    if (actions.some((action) => action.type === 'reset')) return;

    let nextRecords = pinnedRecords;
    for (const action of actions) {
      if (action.type === 'upsert') {
        const index = nextRecords.findIndex((record) => record.id === action.record.id);
        if (index < 0 || areLiteChatRecordsEqual(nextRecords[index], action.record)) continue;
        nextRecords = [...nextRecords];
        nextRecords[index] = action.record;
      } else if (action.type === 'remove') {
        nextRecords = nextRecords.filter((record) => record.id !== action.id);
      } else if (action.type === 'remove-author') {
        nextRecords = nextRecords.filter((record) => record.author?.channelId !== action.channelId);
      }
    }
    if (nextRecords === pinnedRecords) return;

    setPinnedRecords(nextRecords);
    schedulePinnedRender();
  }

  function schedulePinnedRender(): void {
    if (pinnedRenderQueued) return;
    pinnedRenderQueued = true;
    queueMicrotask(() => {
      pinnedRenderQueued = false;
      if (destroyed || followingLiveEdge || pinnedRecords === null) return;
      renderRecords(null);
    });
  }

  function handleStoreChange(change: LiteChatStoreChange): void {
    const wasFollowingLiveEdge = followingLiveEdge;
    const previousFrozenEndId = frozenEndId;
    const actionOrigin = stagedActionOrigin;
    stagedActionOrigin = null;
    rememberChangedRowSources(change);
    if (change.reset) {
      clearLivePresentation();
      if (wasFollowingLiveEdge) {
        setFollowingLiveEdge(true);
        frozenEndId = '';
        pendingMessageCount = 0;
      } else {
        setPinnedRecords(store.getRecords());
        setFollowingLiveEdge(false);
        frozenEndId = previousFrozenEndId;
        pendingMessageCount = getResetPendingMessageCount(store.getRecords(), previousFrozenEndId);
      }
    } else if (!followingLiveEdge && change.addedIds.length) {
      pendingMessageCount = Math.min(
        MAX_PENDING_MESSAGE_COUNT,
        pendingMessageCount + change.addedIds.length
      );
    }

    if (!change.reset) {
      removePendingLivePresentationIds(change.removedIds);
    }
    stageInitialHandoff(actionOrigin);
    if (!change.reset) stageLiveAdditions(change, actionOrigin);
    ensureRetainedLivePresentationRow();

    if (followingLiveEdge || doesStoreChangeAffectFrozenWindow(change)) {
      renderRecords(change);
    }
    refreshNewMessagesButton();
    if (followingLiveEdge) {
      pinScrollToBottom();
    }
  }

  function stageInitialHandoff(origin: YouTubeChatFeedBatchSource | null): void {
    if (origin !== 'initial' || !nativePresentationEndId) return;

    const records = store.getRecords();
    const endIndex = records.findIndex((record) => record.id === nativePresentationEndId);
    if (endIndex < 0) return;
    nativePresentationEndId = '';

    const idsToStage = records.slice(endIndex + 1).map((record) => record.id);
    if (!idsToStage.length || document.visibilityState !== 'visible') return;

    for (const id of idsToStage) {
      pendingLivePresentationIdSet.add(id);
      pendingLivePresentationIds.push(id);
    }
    inheritInitialHandoffCadence(idsToStage.length);
    scheduleLivePresentation(getNextLivePresentationDelay(performance.now()));
  }

  function inheritInitialHandoffCadence(pendingCount: number): void {
    const inheritedInterval =
      typeof options.lastLiveBatchIntervalMs === 'number' &&
      Number.isFinite(options.lastLiveBatchIntervalMs) &&
      options.lastLiveBatchIntervalMs > 0
        ? Math.min(options.lastLiveBatchIntervalMs, LIVE_PRESENTATION_DEFAULT_WINDOW_MS)
        : LIVE_PRESENTATION_DEFAULT_WINDOW_MS;
    const batchAge =
      lastLiveBatchReceivedAt === null ? 0 : Math.max(0, Date.now() - lastLiveBatchReceivedAt);
    const remainingInterval = Math.max(0, inheritedInterval - batchAge);
    const minimumOrderedWindow = Math.min(
      LIVE_PRESENTATION_DEFAULT_WINDOW_MS,
      pendingCount * LIVE_PRESENTATION_MIN_INTERVAL_MS
    );

    liveBatchIntervals.push(Math.max(remainingInterval, minimumOrderedWindow));
    lastLiveBatchAt = performance.now();
  }

  function stageLiveAdditions(
    change: LiteChatStoreChange,
    origin: YouTubeChatFeedBatchSource | null
  ): void {
    if (origin !== 'live') return;

    const newMessageIds = change.addedIds.filter((id) => {
      return Boolean(store.get(id)) && pendingRowSources.get(id) === 'added';
    });
    if (!newMessageIds.length) return;

    if (document.visibilityState !== 'visible') {
      // There is no presentation to smooth while hidden. Drop any existing
      // hold as well so a newer hidden response cannot pass queued rows.
      clearLivePresentation();
      return;
    }

    const alreadyPresenting = pendingLivePresentationIdSet.size > 0;
    // The first row is the queue's zero-delay emission. If a queue is already
    // draining, every new row joins it so a newer response cannot jump ahead.
    const idsToStage = alreadyPresenting ? newMessageIds : newMessageIds.slice(1);
    for (const id of idsToStage) {
      if (pendingLivePresentationIdSet.has(id)) continue;
      pendingLivePresentationIdSet.add(id);
      pendingLivePresentationIds.push(id);
    }
    if (!pendingLivePresentationIds.length) return;
    scheduleLivePresentation(getNextLivePresentationDelay(performance.now()));
  }

  function rememberLiveBatchArrival(now: number, receivedAt: number | undefined): void {
    const validReceivedAt =
      typeof receivedAt === 'number' && Number.isFinite(receivedAt) ? receivedAt : null;
    const transportInterval =
      validReceivedAt !== null && lastLiveBatchReceivedAt !== null
        ? validReceivedAt - lastLiveBatchReceivedAt
        : 0;
    const interval =
      transportInterval > 0
        ? transportInterval
        : now - (lastLiveBatchAt ?? livePresentationAnchorAt);
    if (interval > 0) {
      // A late Lite subscriber inherits the preceding transport timestamp, so
      // its first response keeps Native's established cadence. The initial
      // snapshot clock remains the cold-start fallback.
      liveBatchIntervals.push(
        lastLiveBatchAt === null
          ? Math.min(interval, LIVE_PRESENTATION_DEFAULT_WINDOW_MS)
          : interval
      );
      if (liveBatchIntervals.length > LIVE_PRESENTATION_INTERVAL_SAMPLE_LIMIT) {
        liveBatchIntervals.shift();
      }
    }
    if (
      validReceivedAt !== null &&
      (lastLiveBatchReceivedAt === null || validReceivedAt >= lastLiveBatchReceivedAt)
    ) {
      lastLiveBatchReceivedAt = validReceivedAt;
    }
    lastLiveBatchAt = now;
  }

  function getRemainingLivePresentationWindow(now: number): number {
    if (lastLiveBatchAt === null || !liveBatchIntervals.length) {
      return LIVE_PRESENTATION_DEFAULT_WINDOW_MS;
    }
    return Math.max(0, Math.max(...liveBatchIntervals) - (now - lastLiveBatchAt));
  }

  function getLivePresentationReleaseCount(remainingWindow: number): number {
    const availableIntervals = Math.max(1, remainingWindow / LIVE_PRESENTATION_MIN_INTERVAL_MS);
    return Math.max(1, Math.ceil(pendingLivePresentationIds.length / availableIntervals));
  }

  function getNextLivePresentationDelay(now: number): number {
    const remainingWindow = getRemainingLivePresentationWindow(now);
    if (getLivePresentationReleaseCount(remainingWindow) > 1) {
      return LIVE_PRESENTATION_MIN_INTERVAL_MS;
    }
    const randomizedInterval =
      (remainingWindow / Math.max(1, pendingLivePresentationIds.length)) * (Math.random() + 0.5);
    return Math.min(
      LIVE_PRESENTATION_MAX_INTERVAL_MS,
      Math.max(LIVE_PRESENTATION_MIN_INTERVAL_MS, randomizedInterval)
    );
  }

  function scheduleLivePresentation(delay: number): void {
    if (destroyed || !pendingLivePresentationIds.length || livePresentationTimer) {
      return;
    }

    livePresentationTimer = window.setTimeout(presentNextLiveRows, delay);
  }

  function presentNextLiveRows(): void {
    livePresentationTimer = 0;
    if (destroyed) {
      clearLivePresentation();
      return;
    }

    removePendingLivePresentationIds(pendingLivePresentationIds.filter((id) => !store.get(id)));
    if (!pendingLivePresentationIds.length) {
      clearLivePresentation();
      return;
    }

    const now = performance.now();
    const remainingWindow = getRemainingLivePresentationWindow(now);
    const releaseCount = getLivePresentationReleaseCount(remainingWindow);
    for (let index = 0; index < releaseCount; index += 1) {
      const id = pendingLivePresentationIds.shift();
      if (!id) break;
      pendingLivePresentationIdSet.delete(id);
    }

    // Keep YouTube's continuation cadence advancing while the reader checks
    // history, but leave the frozen DOM untouched. Returning to live can then
    // resume the in-flight response instead of waiting for the next response.
    if (followingLiveEdge) {
      renderRecords(null, releaseCount === 1);
      pinScrollToBottom();
    }
    if (!pendingLivePresentationIds.length) {
      clearLivePresentation();
      return;
    }
    scheduleLivePresentation(
      releaseCount > 1 ? LIVE_PRESENTATION_MIN_INTERVAL_MS : getNextLivePresentationDelay(now)
    );
  }

  function removePendingLivePresentationIds(ids: readonly string[]): void {
    if (!ids.length || !pendingLivePresentationIds.length) return;
    const removedIds = new Set(ids);
    for (const id of removedIds) pendingLivePresentationIdSet.delete(id);
    const retainedIds = pendingLivePresentationIds.filter((id) => !removedIds.has(id));
    pendingLivePresentationIds.length = 0;
    pendingLivePresentationIds.push(...retainedIds);
    if (!pendingLivePresentationIds.length) clearLivePresentation();
  }

  function ensureRetainedLivePresentationRow(): void {
    if (
      !followingLiveEdge ||
      !pendingLivePresentationIds.length ||
      store.getRecords().some((record) => !pendingLivePresentationIdSet.has(record.id))
    ) {
      return;
    }

    const id = pendingLivePresentationIds.shift();
    if (id) pendingLivePresentationIdSet.delete(id);
    if (!pendingLivePresentationIds.length) clearLivePresentation();
  }

  function clearLivePresentation(): void {
    if (livePresentationTimer) window.clearTimeout(livePresentationTimer);
    livePresentationTimer = 0;
    pendingLivePresentationIds.length = 0;
    pendingLivePresentationIdSet.clear();
  }

  function doesStoreChangeAffectFrozenWindow(change: LiteChatStoreChange): boolean {
    if (change.reset) return true;
    if (change.removedIds.some((id) => id === frozenEndId || rowsById.has(id))) return true;
    return change.updatedIds.some((id) => rowsById.has(id));
  }

  function getResetPendingMessageCount(
    records: readonly YouTubeChatMessageRecord[],
    previousEndId: string
  ): number {
    const endIndex = records.findIndex((record) => record.id === previousEndId);
    if (endIndex < 0) return Math.min(MAX_PENDING_MESSAGE_COUNT, records.length);
    return Math.min(MAX_PENDING_MESSAGE_COUNT, Math.max(0, records.length - endIndex - 1));
  }

  function rememberChangedRowSources(change: LiteChatStoreChange): void {
    const stagedSources = stagedActionSources;
    stagedActionSources = new Map();

    if (change.reset) {
      pendingRowSources.clear();
      dispatchedRecordIds.clear();
      if (followingLiveEdge || pinnedRecords === null) {
        rowsById.forEach((row) => row.remove());
        rowsById.clear();
        renderedRecords.clear();
      }
    }

    for (const id of change.removedIds) {
      pendingRowSources.delete(id);
      dispatchedRecordIds.delete(id);
    }

    for (const id of change.addedIds) {
      if (dispatchedRecordIds.has(id)) continue;
      pendingRowSources.set(id, stagedSources.get(id) || (change.reset ? 'existing' : 'added'));
    }

    for (const id of change.updatedIds) {
      if (dispatchedRecordIds.has(id)) {
        pendingRowSources.set(id, 'changed');
      } else if (!pendingRowSources.has(id)) {
        pendingRowSources.set(id, stagedSources.get(id) || 'changed');
      }
    }
  }

  function renderRecords(
    change: LiteChatStoreChange | null,
    animateAddedRows = change !== null
  ): void {
    const desired = getDesiredRecords();
    const desiredIds = new Set(desired.map((record) => record.id));
    emptyState.hidden = desired.length > 0;

    for (const [id, row] of rowsById) {
      if (desiredIds.has(id)) continue;
      row.remove();
      rowsById.delete(id);
      renderedRecords.delete(id);
    }

    let previousRow: ChildNode = emptyState;
    desired.forEach((record) => {
      let row = rowsById.get(record.id);
      const previousRecord = renderedRecords.get(record.id);
      const created = !row;
      const changed = previousRecord !== record || change?.updatedIds.includes(record.id);

      if (!row) {
        row = createLiteChatMessageRow(record);
        rowsById.set(record.id, row);
      } else if (changed) {
        // Recreate updated rows so element-keyed feature state cannot survive a
        // transport revision after its author/message children were replaced.
        // Existing feature wiring and translation snapshots can then attach to
        // the fresh row through the changed callback.
        const replacement = createLiteChatMessageRow(record);
        row.replaceWith(replacement);
        rowsById.set(record.id, replacement);
        row = replacement;
      }

      let rowSource: LiteChatRowSource | null = null;
      if (created || changed) {
        rowSource = created ? pendingRowSources.get(record.id) || 'existing' : 'changed';
        if (created && animateAddedRows && rowSource === 'added') {
          row.classList.add('ytcq-lite-message-enter');
        }
      }
      renderedRecords.set(record.id, record);
      const expectedRow = previousRow.nextSibling;
      if (row !== expectedRow) items.insertBefore(row, expectedRow);
      previousRow = row;
      if (rowSource) {
        options.onRowRendered?.(row, record, rowSource);
        dispatchedRecordIds.add(record.id);
        pendingRowSources.delete(record.id);
      }
    });

    if (!frozenEndId && desired.length) {
      frozenEndId = desired[desired.length - 1].id;
    }
  }

  function getDesiredRecords(): readonly YouTubeChatMessageRecord[] {
    if (!followingLiveEdge && pinnedRecords !== null) {
      const endIndex = getPinnedEndIndex();
      if (endIndex < 0) return [];
      return getRecordWindow(pinnedRecords, endIndex);
    }

    const latest = pendingLivePresentationIdSet.size
      ? store
          .getRecords()
          .filter((record) => !pendingLivePresentationIdSet.has(record.id))
          .slice(-renderLimit)
      : store.getLatest(renderLimit);
    frozenEndId = latest[latest.length - 1]?.id || '';
    return latest;
  }

  function handleScroll(): void {
    updatePointerScrollIntent();
    if (
      returnIntentPending &&
      !followingLiveEdge &&
      isNearScrollEnd(scroller) &&
      advanceTowardLiveEdge()
    ) {
      return;
    }
    scheduleScrollStateUpdate();
  }

  function handleWheel(event: WheelEvent): void {
    if (event.deltaY < 0) {
      requestLiveEdgeRelease();
    } else if (event.deltaY > 0) {
      requestLiveEdgeReturn();
    }
  }

  function handleScrollKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (
      event.key === 'ArrowUp' ||
      event.key === 'PageUp' ||
      event.key === 'Home' ||
      ((event.key === ' ' || event.key === 'Spacebar') && event.shiftKey)
    ) {
      requestLiveEdgeRelease();
    } else if (
      event.key === 'ArrowDown' ||
      event.key === 'PageDown' ||
      event.key === 'End' ||
      ((event.key === ' ' || event.key === 'Spacebar') && !event.shiftKey)
    ) {
      requestLiveEdgeReturn();
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    if (activeScrollPointer) return;
    activeScrollPointer = {
      id: event.pointerId,
      lastScrollTop: scroller.scrollTop,
      moved: false,
      startY: event.clientY
    };
  }

  function handlePointerMove(event: PointerEvent): void {
    const pointer = activeScrollPointer;
    if (!pointer || pointer.id !== event.pointerId || pointer.moved) return;
    pointer.moved = Math.abs(event.clientY - pointer.startY) >= POINTER_SCROLL_DRAG_THRESHOLD_PX;
  }

  function finishPointerScroll(event: PointerEvent): void {
    if (activeScrollPointer?.id !== event.pointerId) return;
    resetPointerScroll();
  }

  function resetPointerScroll(): void {
    activeScrollPointer = null;
  }

  function updatePointerScrollIntent(): void {
    const pointer = activeScrollPointer;
    if (!pointer?.moved) return;

    const nextScrollTop = scroller.scrollTop;
    const movedUp = nextScrollTop < pointer.lastScrollTop;
    const movedDown = nextScrollTop > pointer.lastScrollTop;
    pointer.lastScrollTop = nextScrollTop;
    if (movedUp) requestLiveEdgeRelease();
    else if (movedDown) requestLiveEdgeReturn();
  }

  function requestLiveEdgeRelease(): void {
    clearReturnIntent();
    if (!followingLiveEdge || scroller.scrollHeight <= scroller.clientHeight) return;
    leaveLiveEdge();
  }

  function requestLiveEdgeReturn(): void {
    if (followingLiveEdge) return;

    clearReturnIntent();
    returnIntentPending = true;
    if (isNearScrollEnd(scroller) && advanceTowardLiveEdge()) {
      return;
    }

    returnIntentTimer = window.setTimeout(() => {
      returnIntentTimer = 0;
      const shouldReturn = returnIntentPending;
      if (
        shouldReturn &&
        !followingLiveEdge &&
        isNearScrollEnd(scroller) &&
        advanceTowardLiveEdge()
      ) {
        return;
      }
      returnIntentPending = false;
      scheduleScrollStateUpdate();
    }, LIVE_EDGE_SCROLL_INTENT_MS);
  }

  function clearReturnIntent(): void {
    returnIntentPending = false;
    if (!returnIntentTimer) return;
    window.clearTimeout(returnIntentTimer);
    returnIntentTimer = 0;
  }

  function scheduleScrollStateUpdate(): void {
    if (scrollFrame) return;
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      const atLiveEdge = isAtLiveEdge(scroller);
      if (
        !followingLiveEdge &&
        returnIntentPending &&
        isNearScrollEnd(scroller) &&
        advanceTowardLiveEdge()
      ) {
        return;
      } else if (atLiveEdge) {
        if (followingLiveEdge) setFollowingLiveEdge(true);
      } else if (!atLiveEdge && followingLiveEdge) {
        // Scripted rendering and browser scroll anchoring can move the list
        // without reader intent. Keep following until an input handler above
        // explicitly releases the live edge.
        pinScrollToBottom();
      }
      if (!followingLiveEdge && scroller.scrollTop <= PAGE_LOAD_THRESHOLD_PX) {
        loadEarlierRecords();
      }
    });
  }

  function loadEarlierRecords(): void {
    const records = pinnedRecords || store.getRecords();
    const firstRow = items.querySelector<HTMLElement>('.ytcq-lite-message');
    const firstId = firstRow?.dataset.messageId || '';
    const firstIndex = records.findIndex((record) => record.id === firstId);
    const endIndex = records.findIndex((record) => record.id === frozenEndId);
    if (firstIndex <= 0 || endIndex <= 0) return;

    const anchorTop = firstRow?.getBoundingClientRect().top || 0;
    const nextEndIndex = endIndex - Math.min(pageSize, firstIndex);
    frozenEndId = records[nextEndIndex]?.id || frozenEndId;
    renderRecords(null);

    const nextAnchor = rowsById.get(firstId);
    if (nextAnchor) {
      scroller.scrollTop += nextAnchor.getBoundingClientRect().top - anchorTop;
    }
  }

  function advanceTowardLiveEdge(): boolean {
    if (loadLaterRecords()) {
      clearReturnIntent();
      return true;
    }
    if (!isAtLiveEdge(scroller)) return false;
    scrollToLiveEdge();
    return true;
  }

  function loadLaterRecords(): boolean {
    const records = pinnedRecords || store.getRecords();
    const renderedRows = items.querySelectorAll<HTMLElement>('.ytcq-lite-message');
    const lastRow = renderedRows.item(renderedRows.length - 1);
    const lastId = lastRow?.dataset.messageId || '';
    const endIndex = records.findIndex((record) => record.id === frozenEndId);
    if (endIndex < 0) return false;
    if (endIndex >= records.length - 1) return bridgePinnedRecordsForward();

    const anchorTop = lastRow?.getBoundingClientRect().top || 0;
    const nextEndIndex = Math.min(records.length - 1, endIndex + pageSize);
    frozenEndId = records[nextEndIndex]?.id || frozenEndId;
    renderRecords(null);

    const nextAnchor = rowsById.get(lastId);
    if (nextAnchor) {
      scroller.scrollTop += nextAnchor.getBoundingClientRect().top - anchorTop;
    }
    return true;
  }

  function bridgePinnedRecordsForward(): boolean {
    if (!pinnedRecords?.length || !frozenEndId) return false;
    const liveRecords = store.getRecords();
    const overlapIndex = liveRecords.findIndex((record) => record.id === frozenEndId);
    if (overlapIndex < 0 || overlapIndex >= liveRecords.length - 1) return false;

    const lastRow = rowsById.get(frozenEndId);
    const anchorTop = lastRow?.getBoundingClientRect().top || 0;
    setPinnedRecords(liveRecords);
    const nextEndIndex = Math.min(liveRecords.length - 1, overlapIndex + pageSize);
    frozenEndId = liveRecords[nextEndIndex]?.id || frozenEndId;
    renderRecords(null);

    const nextAnchor = rowsById.get(liveRecords[overlapIndex]?.id || '');
    if (nextAnchor) {
      scroller.scrollTop += nextAnchor.getBoundingClientRect().top - anchorTop;
    }
    return true;
  }

  function revealMessage(id: string): HTMLElement | null {
    const records =
      !followingLiveEdge && pinnedRecords !== null ? pinnedRecords : store.getRecords();
    const targetIndex = records.findIndex((record) => record.id === id);
    if (targetIndex < 0) return null;
    if (followingLiveEdge || pinnedRecords === null) setPinnedRecords(records);

    const maxStartIndex = Math.max(0, records.length - renderLimit);
    const startIndex = Math.min(
      maxStartIndex,
      Math.max(0, targetIndex - Math.floor(renderLimit / 2))
    );
    const endIndex = Math.min(records.length - 1, startIndex + renderLimit - 1);

    clearReturnIntent();
    setFollowingLiveEdge(false);
    frozenEndId = records[endIndex]?.id || id;
    pendingMessageCount = Math.min(
      MAX_PENDING_MESSAGE_COUNT,
      Math.max(0, records.length - endIndex - 1)
    );
    renderRecords(null);
    refreshNewMessagesButton();
    return rowsById.get(id) || null;
  }

  function leaveLiveEdge(): void {
    setFollowingLiveEdge(false);
    setPinnedRecords(store.getRecords());
    const rendered = getRenderedRecords();
    frozenEndId = rendered[rendered.length - 1]?.id || '';
    pendingMessageCount = getResetPendingMessageCount(store.getRecords(), frozenEndId);
    refreshNewMessagesButton();
  }

  function scrollToLiveEdge(): void {
    clearReturnIntent();
    setFollowingLiveEdge(true);
    ensureRetainedLivePresentationRow();
    frozenEndId = '';
    pendingMessageCount = 0;
    renderRecords(null);
    refreshNewMessagesButton();
    pinScrollToBottom();
  }

  function setFollowingLiveEdge(following: boolean): void {
    followingLiveEdge = following;
    if (following) pinnedRecords = null;
    root.setAttribute('aria-live', following ? 'polite' : 'off');
    root.dataset.ytcqFollowingLiveEdge = String(following);
  }

  function pinScrollToBottom(): void {
    if (destroyed || !followingLiveEdge) return;
    scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  }

  function setConnectionState(state: LiteChatConnectionState): void {
    const connecting = state === 'connecting';
    root.dataset.ytcqConnectionState = state;
    root.setAttribute('aria-busy', String(connecting));
    loadingSpinner.hidden = !connecting;
    emptyStateLabel.textContent = connecting ? t('liteModeWaitingForChat') : t('noMessagesYet');
  }

  function setTimestampsVisible(visible: boolean): void {
    root.dataset.ytcqShowTimestamps = String(visible);
  }

  function refreshNewMessagesButton(): void {
    newMessagesButton.hidden = pendingMessageCount === 0;
    if (!pendingMessageCount) {
      newMessagesButton.textContent = '';
      newMessagesButton.removeAttribute('aria-label');
      return;
    }

    const count = Math.min(pendingMessageCount, MAX_PENDING_MESSAGE_COUNT);
    const label = t('liteModeNewMessages', { count });
    newMessagesButton.textContent = label;
    newMessagesButton.setAttribute('aria-label', `${label}. ${t('liteModeJumpToLive')}`);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    unsubscribe();
    scrollListeners.abort();
    resizeObserver?.disconnect();
    if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    clearLivePresentation();
    clearReturnIntent();
    scrollFrame = 0;
    rowsById.clear();
    renderedRecords.clear();
    dispatchedRecordIds.clear();
    pendingRowSources.clear();
    stagedActionSources.clear();
    stagedActionOrigin = null;
    pinnedRecords = null;
    pinnedRenderQueued = false;
    root.remove();
  }

  function getRenderedRecords(): YouTubeChatMessageRecord[] {
    return Array.from(items.querySelectorAll<HTMLElement>('.ytcq-lite-message'))
      .flatMap((row) => {
        const record = renderedRecords.get(row.dataset.messageId || '');
        return record ? [record] : [];
      })
      .slice(-renderLimit);
  }

  function getRecordWindow(
    records: readonly YouTubeChatMessageRecord[],
    endIndex: number
  ): YouTubeChatMessageRecord[] {
    return records.slice(Math.max(0, endIndex - renderLimit + 1), endIndex + 1);
  }

  function getPinnedEndIndex(): number {
    const records = pinnedRecords || [];
    let endIndex = records.findIndex((record) => record.id === frozenEndId);
    if (endIndex >= 0) return endIndex;

    const renderedIds = Array.from(items.querySelectorAll<HTMLElement>('.ytcq-lite-message')).map(
      (row) => row.dataset.messageId || ''
    );
    for (let index = renderedIds.length - 1; index >= 0; index -= 1) {
      endIndex = records.findIndex((record) => record.id === renderedIds[index]);
      if (endIndex < 0) continue;
      frozenEndId = records[endIndex].id;
      return endIndex;
    }

    endIndex = Math.min(records.length - 1, renderLimit - 1);
    frozenEndId = records[endIndex]?.id || frozenEndId;
    return endIndex;
  }

  function setPinnedRecords(records: readonly YouTubeChatMessageRecord[]): void {
    pinnedRecords = [...records];
  }
}

export function createLiteChatMessageRow(record: YouTubeChatMessageRecord): HTMLElement {
  const row = el<HTMLElement>(<article class="ytcq-lite-message" />);
  renderLiteChatMessageRow(row, record);
  return row;
}

export function renderLiteChatMessageRow(row: HTMLElement, record: YouTubeChatMessageRecord): void {
  row.className = `ytcq-lite-message ytcq-lite-message-${record.kind}`;
  row.dataset.messageId = record.id;
  row.dataset.ytcqLiteKind = record.kind;
  row.setAttribute('role', 'article');
  row.setAttribute('aria-label', getMessageAriaLabel(record));
  clearMessageColors(row);
  applyMessageColors(row, record.colors);

  const avatar = createAuthorAvatar(record.author);
  const content = el<HTMLDivElement>(<div id="content" class="ytcq-lite-content" />);
  const meta = el<HTMLDivElement>(<div class="ytcq-lite-meta" />);
  const timestamp = el<HTMLSpanElement>(
    <span id="timestamp" class="ytcq-lite-timestamp">
      {record.timestampText || formatMessageTimestampUsec(record.timestampUsec)}
    </span>
  );
  const authorChip = createAuthorChip(record.author);
  meta.append(timestamp, authorChip);
  const topFanBadge = createTopFanBadge(record.author);

  const messageContainer = el<HTMLSpanElement>(
    <span id="message-container" class="ytcq-lite-message-container" />
  );
  const message = el<HTMLSpanElement>(<span id="message" dir="auto" />);
  appendLiteChatRuns(message, record.runs, record.plainText);
  messageContainer.append(message);

  content.append(meta);
  if (topFanBadge) content.append(topFanBadge);
  appendKindMetadata(content, record);
  if (
    (record.kind === 'text' || record.kind === 'paid') &&
    (record.runs.length || record.plainText)
  ) {
    content.append(messageContainer);
  }

  const menu = el<HTMLSpanElement>(
    <span id="menu" class="ytcq-lite-message-menu">
      <button
        type="button"
        class="ytcq-lite-message-menu-button"
        aria-haspopup="menu"
        aria-expanded="false"
        aria-label={`${t('mention')} / ${t('quote')}`}
      >
        {createSvgIcon(MATERIAL_ICON_VIEW_BOX, MORE_VERTICAL_ICON_PATH)}
      </button>
    </span>
  );

  row.replaceChildren(avatar, content, menu);
}

function createAuthorAvatar(author: YouTubeChatAuthor | undefined): HTMLElement {
  const channelUrl = getChannelUrl(author?.channelId);
  const host = channelUrl
    ? el<HTMLAnchorElement>(
        <a
          id="author-photo"
          class="ytcq-lite-author-photo ytcq-profile-enabled"
          href={channelUrl}
          title={t('showRecentMessages')}
        />
      )
    : el<HTMLSpanElement>(
        <span
          id="author-photo"
          class="ytcq-lite-author-photo ytcq-profile-enabled"
          title={t('showRecentMessages')}
        />
      );
  const avatarUrl = getSafeHttpsUrl(author?.avatarUrl);
  if (avatarUrl) {
    const image = el<HTMLImageElement>(
      <img
        src={avatarUrl}
        alt=""
        width={24}
        height={24}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
    host.append(image);
  } else {
    host.append(
      el<HTMLSpanElement>(
        <span class="ytcq-lite-avatar-fallback" aria-hidden="true">
          {getAuthorInitial(author?.name)}
        </span>
      )
    );
  }
  return host;
}

function createAuthorChip(author: YouTubeChatAuthor | undefined): HTMLElement {
  const chip = el<HTMLSpanElement>(<span class="ytcq-lite-author-chip" />);
  const authorName = createAuthorName(author);
  const chipBadges = createAuthorBadges(author, 'chip');
  const chatBadges = createAuthorBadges(author, 'chat');
  if (chatBadges.childElementCount) {
    chip.classList.add('ytcq-lite-author-chip-has-chat-badges');
  }
  authorName.append(chipBadges);
  chip.append(authorName, chatBadges);
  return chip;
}

function createTopFanBadge(author: YouTubeChatAuthor | undefined): HTMLElement | null {
  const rank = author?.topFanRank;
  if (!rank) return null;

  const label = `#${rank}`;
  return el<HTMLSpanElement>(
    <span class="ytcq-lite-top-fan-badge" aria-label={label} data-top-fan-rank={rank}>
      <svg
        class="ytcq-lite-top-fan-badge-icon"
        xmlns="http://www.w3.org/2000/svg"
        height={16}
        viewBox="0 0 24 24"
        width={16}
        focusable="false"
        aria-hidden="true"
      >
        <path d="M12 2a1.5 1.5 0 00-1.296 2.253L7.64 9.617 3.996 7.432A1.498 1.498 0 102.19 8.967l1.833 8.25A1 1 0 005 18h14a1 1 0 00.977-.783l1.833-8.249a1.499 1.499 0 10-1.807-1.536l-3.642 2.185-3.065-5.364A1.5 1.5 0 0012 2Zm-3.132 9.496L12 6.015l3.132 5.482a1.002 1.002 0 001.383.36l3.003-1.802L18.198 16H5.801l-1.32-5.945 3.004 1.802a1 1 0 001.383-.361ZM19 20H5a1 1 0 000 2h14a1 1 0 000-2Z" />
      </svg>
      <span class="ytcq-lite-top-fan-badge-rank">{label}</span>
    </span>
  );
}

function createAuthorName(author: YouTubeChatAuthor | undefined): HTMLElement {
  const className = `ytcq-lite-author-name${author?.isOwner ? ' owner' : ''}`;
  if (!author?.name) {
    return el<HTMLSpanElement>(
      <span id="author-name" class={className} hidden aria-hidden="true" />
    );
  }
  const channelUrl = getChannelUrl(author?.channelId);
  const name = author.name;
  const element = channelUrl
    ? el<HTMLAnchorElement>(
        <a id="author-name" class={className} href={channelUrl} title={t('mentionUserTitle')}>
          {name}
        </a>
      )
    : el<HTMLButtonElement>(
        <button id="author-name" type="button" class={className} title={t('mentionUserTitle')}>
          {name}
        </button>
      );
  return element;
}

function createAuthorBadges(
  author: YouTubeChatAuthor | undefined,
  placement: 'chat' | 'chip'
): HTMLElement {
  const badges = el<HTMLSpanElement>(
    <span
      id={placement === 'chip' ? 'chip-badges' : 'chat-badges'}
      class={`ytcq-lite-author-badges ytcq-lite-author-${placement}-badges`}
    />
  );
  for (const badge of author?.badges || []) {
    if ((badge.kind === 'verified') !== (placement === 'chip')) continue;
    const badgeElement = el<HTMLSpanElement>(
      <span
        class="ytcq-lite-author-badge"
        aria-label={badge.label}
        title={badge.label}
        data-badge-label={badge.label}
      />
    );
    const iconUrl = getSafeHttpsUrl(badge.iconUrl);
    if (badge.kind === 'moderator') {
      badgeElement.append(
        el<SVGSVGElement>(
          <svg
            class="ytcq-lite-moderator-badge-icon"
            xmlns="http://www.w3.org/2000/svg"
            height={16}
            viewBox="0 0 24 24"
            width={16}
            focusable="false"
            aria-hidden="true"
          >
            <path d="M3 4.998v9.857a6 6 0 003.365 5.39L12 23l5.635-2.755A6 6 0 0021 14.855V4.998a1 1 0 00-.656-.938L12 1 3.656 4.06A1 1 0 003 4.998Z" />
          </svg>
        )
      );
    } else if (badge.kind === 'verified') {
      badgeElement.append(
        el<SVGSVGElement>(
          <svg
            class="ytcq-lite-verified-badge-icon"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={16}
            height={16}
            focusable="false"
            aria-hidden="true"
          >
            {/* Google Material Icons Round: check_circle. */}
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM9.29 16.29 5.7 12.7c-.39-.39-.39-1.02 0-1.41.39-.39 1.02-.39 1.41 0L10 14.17l6.88-6.88c.39-.39 1.02-.39 1.41 0 .39.39.39 1.02 0 1.41l-7.59 7.59c-.38.39-1.02.39-1.41 0z" />
          </svg>
        )
      );
    } else if (iconUrl) {
      badgeElement.append(
        el<HTMLImageElement>(
          <img
            src={iconUrl}
            alt={badge.label}
            width={16}
            height={16}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )
      );
    } else {
      badgeElement.textContent = badge.label;
    }
    badges.append(badgeElement);
  }
  return badges;
}

function appendKindMetadata(content: HTMLElement, record: YouTubeChatMessageRecord): void {
  if (record.kind === 'paid' && record.paid?.amountText) {
    content.append(
      el<HTMLDivElement>(<div class="ytcq-lite-paid-amount">{record.paid.amountText}</div>)
    );
  }

  if (record.kind === 'sticker' && record.sticker) {
    const imageUrl = getSafeHttpsUrl(record.sticker.imageUrl);
    const sticker = el<HTMLDivElement>(<div class="ytcq-lite-sticker" />);
    if (imageUrl) {
      sticker.append(
        el<HTMLImageElement>(
          <img
            src={imageUrl}
            alt={record.sticker.alt}
            title={record.sticker.alt}
            width={96}
            height={96}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )
      );
    }
    if (record.sticker.amountText) {
      sticker.append(
        el<HTMLSpanElement>(
          <span class="ytcq-lite-sticker-amount">{record.sticker.amountText}</span>
        )
      );
    }
    content.append(sticker);
  }

  if (record.kind === 'membership' && record.membership) {
    const membership = el<HTMLDivElement>(
      <div class="ytcq-lite-membership-header">
        <strong>{record.membership.headerText}</strong>
      </div>
    );
    if (record.plainText && record.plainText !== record.membership.headerText) {
      const memberMessage = el<HTMLSpanElement>(<span id="message" />);
      appendLiteChatRuns(memberMessage, record.runs, record.plainText);
      membership.append(memberMessage);
    }
    content.append(membership);
  }

  if (record.kind === 'gift' && record.gift) {
    const count = record.gift.count && record.gift.count > 0 ? ` ×${record.gift.count}` : '';
    const giftHeader = el<HTMLDivElement>(
      <div
        class={`ytcq-lite-gift-header ytcq-lite-gift-${record.gift.giftType}`}
        data-gift-type={record.gift.giftType}
      />
    );
    const giftImageUrl = getSafeHttpsUrl(record.gift.imageUrl);
    if (giftImageUrl) {
      giftHeader.append(
        el<HTMLImageElement>(
          <img
            class="ytcq-lite-gift-image"
            src={giftImageUrl}
            alt={record.gift.alt || ''}
            title={record.gift.alt || undefined}
            width={32}
            height={32}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )
      );
    }
    const giftMessage = el<HTMLSpanElement>(<span id="message" />);
    appendLiteChatRuns(giftMessage, record.runs, record.gift.headerText);
    giftHeader.append(giftMessage, count);
    content.append(giftHeader);
  }
}

function appendLiteChatRuns(
  container: HTMLElement,
  runs: readonly YouTubeChatRichRun[],
  fallbackText: string
): void {
  if (!runs.length) {
    container.textContent = fallbackText;
    return;
  }

  for (const run of runs) {
    if (run.type === 'emoji') {
      const imageUrl = getSafeHttpsUrl(run.imageUrl);
      if (!imageUrl) {
        container.append(run.alt);
        continue;
      }
      const title = run.shortcuts.find(Boolean) || run.alt;
      container.append(
        el<HTMLImageElement>(
          <img
            class="emoji ytcq-lite-emoji"
            src={imageUrl}
            alt={run.alt}
            title={title}
            data-emoji-id={run.emojiId || undefined}
            width={24}
            height={24}
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )
      );
      continue;
    }

    const href = getSafeHttpsUrl(run.href);
    if (href) {
      container.append(
        el<HTMLAnchorElement>(
          <a href={href} target="_blank" rel="noopener noreferrer">
            {run.text}
          </a>
        )
      );
    } else {
      container.append(run.text);
    }
  }
}

function getMessageAriaLabel(record: YouTubeChatMessageRecord): string {
  const authorName = record.author?.name || '';
  const amount = record.paid?.amountText || record.sticker?.amountText || '';
  const membershipHeader = record.membership?.headerText || '';
  const giftHeader = record.gift
    ? `${record.gift.headerText}${record.gift.count ? ` ×${record.gift.count}` : ''}`
    : '';
  const messageText = record.gift?.headerText === record.plainText ? '' : record.plainText;
  return [
    ...new Set([authorName, amount, membershipHeader, giftHeader, messageText].filter(Boolean))
  ].join(': ');
}

function getChannelUrl(channelId: string | undefined): string {
  const cleanChannelId = String(channelId || '').trim();
  return cleanChannelId
    ? `https://www.youtube.com/channel/${encodeURIComponent(cleanChannelId)}`
    : '';
}

function getAuthorInitial(name: string | undefined): string {
  return (
    String(name || '')
      .replace(/^@/, '')
      .trim()
      .slice(0, 1)
      .toUpperCase() || '?'
  );
}

function getSafeHttpsUrl(value: string | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value, 'https://www.youtube.com');
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function applyMessageColors(row: HTMLElement, colors: YouTubeChatMessageColors | undefined): void {
  setArgbColor(row, '--ytcq-lite-author-color', colors?.authorName);
  setArgbColor(row, '--ytcq-lite-background', colors?.background);
  setArgbColor(row, '--ytcq-lite-body-background', colors?.bodyBackground);
  setArgbColor(row, '--ytcq-lite-header-background', colors?.headerBackground);
  setArgbColor(row, '--ytcq-lite-header-text', colors?.headerText);
  setArgbColor(row, '--ytcq-lite-text', colors?.text);
  setArgbColor(row, '--ytcq-lite-timestamp-color', colors?.timestamp);
}

function clearMessageColors(row: HTMLElement): void {
  [
    '--ytcq-lite-author-color',
    '--ytcq-lite-background',
    '--ytcq-lite-body-background',
    '--ytcq-lite-header-background',
    '--ytcq-lite-header-text',
    '--ytcq-lite-text',
    '--ytcq-lite-timestamp-color'
  ].forEach((property) => row.style.removeProperty(property));
}

function setArgbColor(row: HTMLElement, property: string, value: number | undefined): void {
  const color = argbToCss(value);
  if (color) row.style.setProperty(property, color);
}

export function argbToCss(value: number | undefined): string {
  if (!Number.isInteger(value) || value === undefined || value < 0 || value > 0xffffffff) return '';
  const unsigned = value >>> 0;
  const alpha = ((unsigned >>> 24) & 0xff) / 255;
  const red = (unsigned >>> 16) & 0xff;
  const green = (unsigned >>> 8) & 0xff;
  const blue = unsigned & 0xff;
  return `rgba(${red}, ${green}, ${blue}, ${Number(alpha.toFixed(3))})`;
}

function isAtLiveEdge(scroller: HTMLElement): boolean {
  return (
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - LIVE_EDGE_TOLERANCE_PX
  );
}

function isNearScrollEnd(scroller: HTMLElement): boolean {
  return (
    scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - PAGE_LOAD_THRESHOLD_PX
  );
}

function normalizeRenderLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_LITE_CHAT_RENDER_LIMIT;
  return Math.max(1, Math.min(1_000, Math.trunc(value || DEFAULT_LITE_CHAT_RENDER_LIMIT)));
}
