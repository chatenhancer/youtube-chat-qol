export const controls = {
  landingLink: document.querySelector<HTMLAnchorElement>('#landingLink'),
  sourceCodeLink: document.querySelector<HTMLAnchorElement>('#sourceCodeLink'),
  supportLink: document.querySelector<HTMLAnchorElement>('#supportLink'),
  resetExtension: document.querySelector<HTMLButtonElement>('#resetExtension'),
  tabs: Array.from(document.querySelectorAll<HTMLButtonElement>('[data-popup-tab-target]')),
  tabPanels: Array.from(document.querySelectorAll<HTMLElement>('[data-popup-tab-panel]')),
  extensionStatus: document.querySelector<HTMLElement>('[data-extension-status]'),
  extensionStatusText: document.querySelector<HTMLElement>('[data-extension-status-text]'),
  bookmarksCount: document.querySelector<HTMLElement>('#bookmarksCount'),
  bookmarksList: document.querySelector<HTMLElement>('#bookmarksList'),
  targetLanguage: document.querySelector<HTMLSelectElement>('#targetLanguage'),
  translationDisplay: document.querySelector<HTMLSelectElement>('#translationDisplay'),
  sound: document.querySelector<HTMLInputElement>('#sound'),
  startupEffect: document.querySelector<HTMLInputElement>('#startupEffect'),
  playgroundEnabled: document.querySelector<HTMLInputElement>('#playgroundEnabled'),
  playgroundGamesSection: document.querySelector<HTMLElement>('#playgroundGamesSection'),
  playgroundGamesAvailable: document.querySelector<HTMLInputElement>('#playgroundGamesAvailable'),
  version: document.querySelector<HTMLElement>('#version')
};

export interface PopupSettingsControls {
  playgroundEnabled: HTMLInputElement;
  playgroundGamesAvailable: HTMLInputElement;
  playgroundGamesSection: HTMLElement;
  sound: HTMLInputElement;
  startupEffect: HTMLInputElement;
  targetLanguage: HTMLSelectElement;
  translationDisplay: HTMLSelectElement;
}

export function getSettingsControls(): PopupSettingsControls | null {
  const {
    targetLanguage,
    translationDisplay,
    sound,
    startupEffect,
    playgroundEnabled,
    playgroundGamesSection,
    playgroundGamesAvailable
  } = controls;

  if (
    !targetLanguage ||
    !translationDisplay ||
    !sound ||
    !startupEffect ||
    !playgroundEnabled ||
    !playgroundGamesSection ||
    !playgroundGamesAvailable
  ) {
    return null;
  }

  return {
    playgroundEnabled,
    playgroundGamesAvailable,
    playgroundGamesSection,
    sound,
    startupEffect,
    targetLanguage,
    translationDisplay
  };
}
