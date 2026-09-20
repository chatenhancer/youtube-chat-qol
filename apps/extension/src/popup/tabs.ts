import { controls } from './controls';
import { initTabHighlight } from '../shared/extension-tabs';

const SCROLL_FADE_TOP_CLASS = 'popup-scroll-fade-top';
const SCROLL_FADE_BOTTOM_CLASS = 'popup-scroll-fade-bottom';
const SCROLL_EDGE_TOLERANCE_PX = 1;
const POPUP_SCROLLBAR_CLASS = 'popup-scrollbar';
const POPUP_SCROLLBAR_ACTIVE_CLASS = 'popup-scrollbar-active';
const POPUP_SCROLLBAR_DRAGGING_CLASS = 'popup-scrollbar-dragging';
const POPUP_SCROLLBAR_FADE_DELAY_MS = 800;
const POPUP_SCROLLBAR_INSET_PX = 2;
const POPUP_SCROLLBAR_MIN_THUMB_HEIGHT_PX = 20;
const NESTED_SCROLL_FADE_REGION_SELECTOR = '[data-popup-scroll-fade-region]';
const NESTED_SCROLL_TARGET_SELECTOR = '[data-popup-scroll-target]';
const POPUP_LAST_TAB_STORAGE_KEY = 'ytcqPopupLastTab';
const popupScrollbarTargets = new WeakMap<HTMLElement, HTMLElement>();
const popupTabSelectionListeners = new Set<(panelId: string) => void>();
let popupActiveScrollbar: HTMLElement | null = null;
let popupScrollbarDragState: {
  pointerId: number;
  scrollbar: HTMLElement;
  scrollTarget: HTMLElement;
  startClientY: number;
  startScrollTop: number;
} | null = null;
let popupScrollbarFadeTimer = 0;
let popupScrollFadeRegion: HTMLElement | null = null;
let popupScrollFadeRefreshTimer = 0;
let popupTabSelectedByUser = false;
let syncPopupTabHighlight = (): void => {};

export function addPopupTabSelectionListener(listener: (panelId: string) => void): void {
  popupTabSelectionListeners.add(listener);
  const activePanel = controls.tabPanels.find((panel) => !panel.hidden);
  if (activePanel) listener(activePanel.id);
}

export function initPopupTabs(): void {
  initPopupScrollFades();
  const tabList = document.querySelector<HTMLElement>('.popup-tabs');
  if (tabList) syncPopupTabHighlight = initTabHighlight(tabList);
  restoreLastPopupTab();

  controls.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.popupTabTarget;
      if (!targetId) return;
      popupTabSelectedByUser = true;
      selectPopupTab(targetId);
      chrome.storage.session?.set({ [POPUP_LAST_TAB_STORAGE_KEY]: targetId });
    });
  });
}

function restoreLastPopupTab(): void {
  chrome.storage.session?.get(POPUP_LAST_TAB_STORAGE_KEY, (stored) => {
    if (popupTabSelectedByUser) return;

    const targetId = stored?.[POPUP_LAST_TAB_STORAGE_KEY];
    if (
      typeof targetId === 'string' &&
      controls.tabs.some((tab) => tab.dataset.popupTabTarget === targetId) &&
      controls.tabPanels.some((panel) => panel.id === targetId)
    ) {
      selectPopupTab(targetId);
    }
  });
}

export function initOptionHelperLinks(): void {
  document.querySelectorAll<HTMLAnchorElement>('.option-helper-link').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.stopPropagation();
    });
  });
}

function initPopupScrollFades(): void {
  popupScrollFadeRegion = document.querySelector<HTMLElement>('.popup-tab-panels');
  if (!popupScrollFadeRegion) return;

  document
    .querySelectorAll<HTMLElement>(`.${POPUP_SCROLLBAR_CLASS}`)
    .forEach(initPopupScrollbar);
  controls.tabPanels.forEach((panel) => {
    panel.addEventListener('scroll', updatePopupScrollFades, { passive: true });
    panel.addEventListener('click', deferPopupScrollFadeUpdate);
    panel.addEventListener('change', deferPopupScrollFadeUpdate);
    panel.addEventListener('input', deferPopupScrollFadeUpdate);
  });
  document
    .querySelectorAll<HTMLElement>(NESTED_SCROLL_TARGET_SELECTOR)
    .forEach((target) =>
      target.addEventListener('scroll', updatePopupScrollFades, { passive: true })
    );
  window.addEventListener('resize', deferPopupScrollFadeUpdate);

  schedulePopupScrollFadeUpdate();
}

export function refreshPopupScrollFades(): void {
  schedulePopupScrollFadeUpdate();
}

function schedulePopupScrollFadeUpdate(): void {
  updatePopupScrollFades();
  deferPopupScrollFadeUpdate();
}

function deferPopupScrollFadeUpdate(): void {
  if (popupScrollFadeRefreshTimer) window.clearTimeout(popupScrollFadeRefreshTimer);
  popupScrollFadeRefreshTimer = window.setTimeout(() => {
    popupScrollFadeRefreshTimer = 0;
    updatePopupScrollFades();
  }, 0);
}

function updatePopupScrollFades(): void {
  if (!popupScrollFadeRegion) return;

  const activePanel = controls.tabPanels.find((panel) => !panel.hidden);
  const nestedScrollTarget = activePanel?.querySelector<HTMLElement>(
    NESTED_SCROLL_TARGET_SELECTOR
  );
  const scrollTarget = nestedScrollTarget || activePanel;
  const activeFadeRegion =
    nestedScrollTarget?.closest<HTMLElement>(NESTED_SCROLL_FADE_REGION_SELECTOR) ||
    popupScrollFadeRegion;

  const hasScrollableContent = scrollTarget
    ? scrollTarget.scrollHeight > scrollTarget.clientHeight + SCROLL_EDGE_TOLERANCE_PX
    : false;
  const hasContentAbove = Boolean(
    scrollTarget && scrollTarget.scrollTop > SCROLL_EDGE_TOLERANCE_PX
  );
  const hasContentBelow = Boolean(
    scrollTarget &&
    hasScrollableContent &&
    scrollTarget.scrollTop + scrollTarget.clientHeight <
      scrollTarget.scrollHeight - SCROLL_EDGE_TOLERANCE_PX
  );

  if (activeFadeRegion !== popupScrollFadeRegion) {
    popupScrollFadeRegion.classList.remove(SCROLL_FADE_TOP_CLASS, SCROLL_FADE_BOTTOM_CLASS);
    updatePopupScrollbar(popupScrollFadeRegion, null, false);
  }

  // Preserve hidden nested regions' classes so Firefox can restore their pseudo-elements.
  activeFadeRegion.classList.toggle(SCROLL_FADE_TOP_CLASS, hasContentAbove);
  activeFadeRegion.classList.toggle(SCROLL_FADE_BOTTOM_CLASS, hasContentBelow);
  updatePopupScrollbar(activeFadeRegion, scrollTarget || null, hasScrollableContent);
}

function updatePopupScrollbar(
  region: HTMLElement,
  scrollTarget: HTMLElement | null,
  hasScrollableContent: boolean
): void {
  const scrollbar = findDirectPopupScrollbar(region);
  const thumb = scrollbar?.querySelector<HTMLElement>('.popup-scrollbar-thumb');
  if (!scrollbar || !thumb) return;

  scrollbar.hidden = !scrollTarget || !hasScrollableContent;
  if (!scrollTarget || !hasScrollableContent) {
    popupScrollbarTargets.delete(scrollbar);
    hidePopupScrollbar(scrollbar);
    thumb.style.removeProperty('height');
    thumb.style.removeProperty('transform');
    return;
  }

  const trackHeight = Math.max(
    0,
    scrollTarget.clientHeight - POPUP_SCROLLBAR_INSET_PX * 2
  );
  const thumbHeight = Math.min(
    trackHeight,
    Math.max(
      POPUP_SCROLLBAR_MIN_THUMB_HEIGHT_PX,
      Math.round((trackHeight * scrollTarget.clientHeight) / scrollTarget.scrollHeight)
    )
  );
  const maxScrollTop = Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight);
  const scrollProgress = maxScrollTop
    ? Math.min(1, Math.max(0, scrollTarget.scrollTop / maxScrollTop))
    : 0;
  const thumbOffset =
    POPUP_SCROLLBAR_INSET_PX + Math.round((trackHeight - thumbHeight) * scrollProgress);

  popupScrollbarTargets.set(scrollbar, scrollTarget);
  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translate3d(0, ${thumbOffset}px, 0)`;
  showPopupScrollbar(scrollbar);
}

function findDirectPopupScrollbar(region: HTMLElement): HTMLElement | null {
  for (const child of region.children) {
    if (child instanceof HTMLElement && child.classList.contains(POPUP_SCROLLBAR_CLASS)) {
      return child;
    }
  }
  return null;
}

function initPopupScrollbar(scrollbar: HTMLElement): void {
  scrollbar.addEventListener('pointerenter', () => {
    if (!scrollbar.hidden) showPopupScrollbar(scrollbar, false);
  });
  scrollbar.addEventListener('pointerleave', () => {
    if (popupScrollbarDragState?.scrollbar !== scrollbar) {
      schedulePopupScrollbarFade(scrollbar);
    }
  });
  scrollbar.addEventListener('wheel', scrollPopupFromScrollbar, { passive: false });
  scrollbar.addEventListener('pointerdown', startPopupScrollbarDrag);
  scrollbar.addEventListener('pointermove', dragPopupScrollbar);
  scrollbar.addEventListener('pointerup', finishPopupScrollbarDrag);
  scrollbar.addEventListener('pointercancel', finishPopupScrollbarDrag);
  scrollbar.addEventListener('lostpointercapture', finishPopupScrollbarDrag);
}

function scrollPopupFromScrollbar(event: WheelEvent): void {
  if (!(event.currentTarget instanceof HTMLElement)) return;

  const scrollTarget = popupScrollbarTargets.get(event.currentTarget);
  if (!scrollTarget) return;

  event.preventDefault();
  let deltaMultiplier = 1;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) deltaMultiplier = 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    deltaMultiplier = scrollTarget.clientHeight;
  }
  scrollTarget.scrollTop += event.deltaY * deltaMultiplier;
  updatePopupScrollFades();
}

function startPopupScrollbarDrag(event: PointerEvent): void {
  if (event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return;

  const scrollbar = event.currentTarget;
  const scrollTarget = popupScrollbarTargets.get(scrollbar);
  const thumb = scrollbar.querySelector<HTMLElement>('.popup-scrollbar-thumb');
  if (!scrollTarget || !thumb) return;

  event.preventDefault();
  showPopupScrollbar(scrollbar, false);

  if (event.target !== thumb) {
    const trackRect = scrollbar.getBoundingClientRect();
    const thumbHeight = thumb.getBoundingClientRect().height;
    const requestedThumbOffset = event.clientY - trackRect.top - thumbHeight / 2;
    scrollTarget.scrollTop = getScrollTopForThumbOffset(
      scrollTarget,
      thumb,
      requestedThumbOffset
    );
    updatePopupScrollFades();
  }

  popupScrollbarDragState = {
    pointerId: event.pointerId,
    scrollbar,
    scrollTarget,
    startClientY: event.clientY,
    startScrollTop: scrollTarget.scrollTop
  };
  scrollbar.classList.add(POPUP_SCROLLBAR_DRAGGING_CLASS);
  showPopupScrollbar(scrollbar, false);
  scrollbar.setPointerCapture(event.pointerId);
}

function dragPopupScrollbar(event: PointerEvent): void {
  const dragState = popupScrollbarDragState;
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const thumb = dragState.scrollbar.querySelector<HTMLElement>('.popup-scrollbar-thumb');
  if (!thumb) return;

  event.preventDefault();
  const { maxScrollTop, maxThumbOffset } = getPopupScrollbarRanges(
    dragState.scrollTarget,
    thumb
  );
  if (!maxThumbOffset) return;

  const scrollDelta =
    ((event.clientY - dragState.startClientY) * maxScrollTop) / maxThumbOffset;
  dragState.scrollTarget.scrollTop = Math.min(
    maxScrollTop,
    Math.max(0, dragState.startScrollTop + scrollDelta)
  );
  updatePopupScrollFades();
}

function finishPopupScrollbarDrag(event: PointerEvent): void {
  const dragState = popupScrollbarDragState;
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  popupScrollbarDragState = null;
  dragState.scrollbar.classList.remove(POPUP_SCROLLBAR_DRAGGING_CLASS);
  if (dragState.scrollbar.hasPointerCapture(event.pointerId)) {
    dragState.scrollbar.releasePointerCapture(event.pointerId);
  }
  showPopupScrollbar(dragState.scrollbar);
}

function getScrollTopForThumbOffset(
  scrollTarget: HTMLElement,
  thumb: HTMLElement,
  requestedThumbOffset: number
): number {
  const { maxScrollTop, maxThumbOffset } = getPopupScrollbarRanges(scrollTarget, thumb);
  if (!maxThumbOffset) return 0;

  const thumbOffset = Math.min(
    maxThumbOffset,
    Math.max(0, requestedThumbOffset - POPUP_SCROLLBAR_INSET_PX)
  );
  return (thumbOffset / maxThumbOffset) * maxScrollTop;
}

function getPopupScrollbarRanges(
  scrollTarget: HTMLElement,
  thumb: HTMLElement
): { maxScrollTop: number; maxThumbOffset: number } {
  const trackHeight = Math.max(
    0,
    scrollTarget.clientHeight - POPUP_SCROLLBAR_INSET_PX * 2
  );
  const thumbHeight = Number.parseFloat(thumb.style.height) || 0;
  return {
    maxScrollTop: Math.max(0, scrollTarget.scrollHeight - scrollTarget.clientHeight),
    maxThumbOffset: Math.max(0, trackHeight - thumbHeight)
  };
}

function showPopupScrollbar(scrollbar: HTMLElement, autoFade = true): void {
  if (popupActiveScrollbar && popupActiveScrollbar !== scrollbar) {
    popupActiveScrollbar.classList.remove(POPUP_SCROLLBAR_ACTIVE_CLASS);
  }
  popupActiveScrollbar = scrollbar;
  scrollbar.classList.add(POPUP_SCROLLBAR_ACTIVE_CLASS);
  clearPopupScrollbarFadeTimer();

  if (autoFade && popupScrollbarDragState?.scrollbar !== scrollbar) {
    schedulePopupScrollbarFade(scrollbar);
  }
}

function schedulePopupScrollbarFade(scrollbar: HTMLElement): void {
  clearPopupScrollbarFadeTimer();
  popupActiveScrollbar = scrollbar;
  scrollbar.classList.add(POPUP_SCROLLBAR_ACTIVE_CLASS);
  popupScrollbarFadeTimer = window.setTimeout(() => {
    popupScrollbarFadeTimer = 0;
    scrollbar.classList.remove(POPUP_SCROLLBAR_ACTIVE_CLASS);
    if (popupActiveScrollbar === scrollbar) popupActiveScrollbar = null;
  }, POPUP_SCROLLBAR_FADE_DELAY_MS);
}

function hidePopupScrollbar(scrollbar: HTMLElement): void {
  scrollbar.classList.remove(
    POPUP_SCROLLBAR_ACTIVE_CLASS,
    POPUP_SCROLLBAR_DRAGGING_CLASS
  );
  if (popupActiveScrollbar !== scrollbar) return;

  popupActiveScrollbar = null;
  clearPopupScrollbarFadeTimer();
}

function clearPopupScrollbarFadeTimer(): void {
  if (!popupScrollbarFadeTimer) return;
  window.clearTimeout(popupScrollbarFadeTimer);
  popupScrollbarFadeTimer = 0;
}

function selectPopupTab(targetId: string): void {
  controls.tabs.forEach((tab) => {
    const active = tab.dataset.popupTabTarget === targetId;
    tab.classList.toggle('popup-tab-active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  controls.tabPanels.forEach((panel) => {
    panel.hidden = panel.id !== targetId;
  });

  popupTabSelectionListeners.forEach((listener) => listener(targetId));
  syncPopupTabHighlight();
  schedulePopupScrollFadeUpdate();
}
