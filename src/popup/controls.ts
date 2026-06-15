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
  playgroundProfile: document.querySelector<HTMLElement>('#playgroundProfile'),
  playgroundProfileAvatar: document.querySelector<HTMLElement>('#playgroundProfileAvatar'),
  playgroundProfileDetails: document.querySelector<HTMLElement>('#playgroundProfileDetails'),
  playgroundProfileName: document.querySelector<HTMLElement>('#playgroundProfileName'),
  playgroundProfileToggle: document.querySelector<HTMLButtonElement>('#playgroundProfileToggle'),
  playgroundProfileWins: document.querySelector<HTMLElement>('#playgroundProfileWins'),
  playgroundProfileWinsCount: document.querySelector<HTMLElement>('#playgroundProfileWinsCount'),
  version: document.querySelector<HTMLElement>('#version')
};

export interface PopupSettingsControls {
  playgroundEnabled: HTMLInputElement;
  playgroundGamesAvailable: HTMLInputElement;
  playgroundGamesSection: HTMLElement;
  playgroundProfile: HTMLElement;
  playgroundProfileAvatar: HTMLElement;
  playgroundProfileDetails: HTMLElement;
  playgroundProfileName: HTMLElement;
  playgroundProfileToggle: HTMLButtonElement;
  playgroundProfileWins: HTMLElement;
  playgroundProfileWinsCount: HTMLElement;
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
    playgroundGamesAvailable,
    playgroundProfile,
    playgroundProfileAvatar,
    playgroundProfileDetails,
    playgroundProfileName,
    playgroundProfileToggle,
    playgroundProfileWins,
    playgroundProfileWinsCount
  } = controls;

  if (
    !targetLanguage ||
    !translationDisplay ||
    !sound ||
    !startupEffect ||
    !playgroundEnabled ||
    !playgroundGamesSection ||
    !playgroundGamesAvailable ||
    !playgroundProfile ||
    !playgroundProfileAvatar ||
    !playgroundProfileDetails ||
    !playgroundProfileName ||
    !playgroundProfileToggle ||
    !playgroundProfileWins ||
    !playgroundProfileWinsCount
  ) {
    return null;
  }

  return {
    playgroundEnabled,
    playgroundGamesAvailable,
    playgroundGamesSection,
    playgroundProfile,
    playgroundProfileAvatar,
    playgroundProfileDetails,
    playgroundProfileName,
    playgroundProfileToggle,
    playgroundProfileWins,
    playgroundProfileWinsCount,
    sound,
    startupEffect,
    targetLanguage,
    translationDisplay
  };
}
