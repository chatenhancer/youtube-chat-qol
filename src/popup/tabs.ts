import { controls } from './controls';

const SCROLL_FADE_TOP_CLASS = 'popup-scroll-fade-top';
const SCROLL_FADE_BOTTOM_CLASS = 'popup-scroll-fade-bottom';
const SCROLL_EDGE_TOLERANCE_PX = 1;
let popupScrollFadeRegion: HTMLElement | null = null;
let popupScrollFadeRefreshTimer = 0;

export function initPopupTabs(): void {
  initPopupScrollFades();

  controls.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = tab.dataset.popupTabTarget;
      if (targetId) selectPopupTab(targetId);
    });
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

  controls.tabPanels.forEach((panel) => {
    panel.addEventListener('scroll', updatePopupScrollFades, { passive: true });
    panel.addEventListener('click', schedulePopupScrollFadeUpdate);
    panel.addEventListener('change', schedulePopupScrollFadeUpdate);
  });
  window.addEventListener('resize', schedulePopupScrollFadeUpdate);

  schedulePopupScrollFadeUpdate();
}

function schedulePopupScrollFadeUpdate(): void {
  updatePopupScrollFades();
  if (popupScrollFadeRefreshTimer) window.clearTimeout(popupScrollFadeRefreshTimer);
  popupScrollFadeRefreshTimer = window.setTimeout(() => {
    popupScrollFadeRefreshTimer = 0;
    updatePopupScrollFades();
  }, 0);
}

function updatePopupScrollFades(): void {
  if (!popupScrollFadeRegion) return;

  const activePanel = controls.tabPanels.find((panel) => !panel.hidden);
  const hasScrollableContent = activePanel
    ? activePanel.scrollHeight > activePanel.clientHeight + SCROLL_EDGE_TOLERANCE_PX
    : false;
  const hasContentAbove = Boolean(activePanel && activePanel.scrollTop > SCROLL_EDGE_TOLERANCE_PX);
  const hasContentBelow = Boolean(
    activePanel &&
    hasScrollableContent &&
    activePanel.scrollTop + activePanel.clientHeight < activePanel.scrollHeight - SCROLL_EDGE_TOLERANCE_PX
  );

  popupScrollFadeRegion.classList.toggle(SCROLL_FADE_TOP_CLASS, hasContentAbove);
  popupScrollFadeRegion.classList.toggle(SCROLL_FADE_BOTTOM_CLASS, hasContentBelow);
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

  schedulePopupScrollFadeUpdate();
}
