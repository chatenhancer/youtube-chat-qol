import { controls } from './controls';

export function initPopupTabs(): void {
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

function selectPopupTab(targetId: string): void {
  controls.tabs.forEach((tab) => {
    const active = tab.dataset.popupTabTarget === targetId;
    tab.classList.toggle('popup-tab-active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  controls.tabPanels.forEach((panel) => {
    panel.hidden = panel.id !== targetId;
  });
}
