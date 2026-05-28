/**
 * Extension action popup.
 *
 * Mirrors the most important chat settings outside YouTube's iframe. The popup
 * writes to chrome.storage.sync, and the content script reacts to those same
 * option updates as the injected chat settings menu.
 */
import { LANGUAGE_OPTIONS } from '../shared/languages';
import { playSoftChime } from '../shared/sounds/soft-chime';
import { getFreshKnownChatTabIds, KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';
import { DEFAULT_OPTIONS, getTargetLanguageUpdate, normalizeOptions, type Options } from '../shared/options';

const LANDING_PAGE_URL = 'https://chatenhancer.com';
const SOURCE_CODE_URL = 'https://www.chatenhancer.com/source';
const SUPPORT_URL = 'https://www.chatenhancer.com/support';
const BELL_RING_CLASS = 'ytcq-bell-ringing';

type ExtensionStatus = 'checking' | 'active' | 'inactive';

const controls = {
  landingLink: document.querySelector<HTMLAnchorElement>('#landingLink'),
  sourceCodeLink: document.querySelector<HTMLAnchorElement>('#sourceCodeLink'),
  supportLink: document.querySelector<HTMLAnchorElement>('#supportLink'),
  resetExtension: document.querySelector<HTMLButtonElement>('#resetExtension'),
  extensionStatus: document.querySelector<HTMLElement>('[data-extension-status]'),
  extensionStatusText: document.querySelector<HTMLElement>('[data-extension-status-text]'),
  extensionStatusHelper: document.querySelector<HTMLElement>('[data-extension-status-helper]'),
  targetLanguage: document.querySelector<HTMLSelectElement>('#targetLanguage'),
  translationDisplay: document.querySelector<HTMLSelectElement>('#translationDisplay'),
  sound: document.querySelector<HTMLInputElement>('#sound'),
  version: document.querySelector<HTMLElement>('#version')
};

let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;

init();

function init(): void {
  const popupLocale = localizePopup();
  refreshExtensionStatus();

  if (!controls.targetLanguage || !controls.translationDisplay || !controls.sound) {
    return;
  }

  if (controls.version) {
    controls.version.textContent = getExtensionMessage('versionLabel', chrome.runtime.getManifest().version);
  }

  controls.landingLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: LANDING_PAGE_URL });
  });
  controls.sourceCodeLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: SOURCE_CODE_URL });
  });
  controls.supportLink?.addEventListener('click', (event) => {
    event.preventDefault();
    const confirmed = window.confirm(getExtensionMessage('supportIssueTrackerPrompt'));
    if (!confirmed) return;
    chrome.tabs.create({ url: SUPPORT_URL });
  });

  controls.resetExtension?.addEventListener('click', resetExtensionState);

  controls.targetLanguage.appendChild(createLanguageOption('', getExtensionMessage('off')));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    controls.targetLanguage.appendChild(createLanguageOption(value, getLocalizedLanguageLabel(value, popupLocale) || label));
  }

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions: Partial<Options>) => {
    if (!controls.targetLanguage || !controls.translationDisplay || !controls.sound) return;
    applyOptionsToControls(storedOptions);
  });

  controls.targetLanguage.addEventListener('change', () => {
    const targetLanguage = controls.targetLanguage?.value || '';
    if (targetLanguage) lastKnownTranslationTarget = targetLanguage;
    save(getTargetLanguageUpdate(targetLanguage, lastKnownTranslationTarget));
  });

  controls.translationDisplay.addEventListener('change', () => {
    save({ translationDisplay: controls.translationDisplay?.value as Options['translationDisplay'] });
  });

  controls.sound.addEventListener('change', () => {
    const enabled = Boolean(controls.sound?.checked);
    if (enabled) {
      animatePopupSoundIcon();
      playSoftChime();
    }
    save({ sound: enabled });
  });
}

function save(values: Partial<Options>): void {
  chrome.storage.sync.set(values);
}

function animatePopupSoundIcon(): void {
  const icon = document.querySelector<SVGSVGElement>('.sound-icon');
  if (!icon) return;

  icon.classList.remove(BELL_RING_CLASS);
  void icon.getBoundingClientRect();
  icon.classList.add(BELL_RING_CLASS);
  window.setTimeout(() => {
    icon.classList.remove(BELL_RING_CLASS);
  }, 700);
}

function refreshExtensionStatus(): void {
  setExtensionStatus('checking', getExtensionMessage('extensionStatusChecking'), getExtensionMessage('extensionStatusCheckingHelper'));

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTabId = tabs[0]?.id;
    refreshGlobalExtensionStatus(typeof currentTabId === 'number' ? currentTabId : null);
  });
}

function refreshGlobalExtensionStatus(currentTabId: number | null): void {
  chrome.tabs.query({}, (tabs) => {
    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number');

    if (!tabIds.length) {
      updateExtensionStatusSummary(new Set(), currentTabId, 0);
      return;
    }

    const activeTabIds = new Set<number>();
    const openTabIds = new Set(tabIds);
    let pending = tabIds.length;

    tabIds.forEach((tabId) => {
      chrome.tabs.sendMessage(tabId, { type: 'ytcq:status-ping' }, (response?: { active?: boolean }) => {
        if (!chrome.runtime.lastError && response?.active === true) {
          activeTabIds.add(tabId);
        }
        pending -= 1;
        if (!pending) {
          updateExtensionStatusSummaryWithKnownTabs(activeTabIds, openTabIds, currentTabId);
        }
      });
    });
  });
}

function updateExtensionStatusSummaryWithKnownTabs(activeTabIds: Set<number>, openTabIds: Set<number>, currentTabId: number | null): void {
  chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY, (stored) => {
    const knownTabIds = getFreshKnownChatTabIds(stored[KNOWN_CHAT_TABS_STORAGE_KEY]);
    const disconnectedKnownChatCount = [...knownTabIds].filter((tabId) => openTabIds.has(tabId) && !activeTabIds.has(tabId)).length;
    updateExtensionStatusSummary(activeTabIds, currentTabId, disconnectedKnownChatCount);
  });
}

function updateExtensionStatusSummary(activeTabIds: Set<number>, currentTabId: number | null, disconnectedKnownChatCount: number): void {
  const currentActive = typeof currentTabId === 'number' && activeTabIds.has(currentTabId);
  const otherCount = activeTabIds.size - (currentActive ? 1 : 0);

  if (currentActive && otherCount === 0) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrent'), getExtensionMessage('extensionStatusActiveHelper'));
    return;
  }

  if (currentActive && otherCount === 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrentAndOne'), getExtensionMessage('extensionStatusActiveHelper'));
    return;
  }

  if (currentActive && otherCount > 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrentAndMany', String(otherCount)), getExtensionMessage('extensionStatusActiveHelper'));
    return;
  }

  if (otherCount === 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveOneOther'), getExtensionMessage('extensionStatusActiveHelper'));
    return;
  }

  if (otherCount > 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveManyOther', String(otherCount)), getExtensionMessage('extensionStatusActiveHelper'));
    return;
  }

  const inactiveHelper = disconnectedKnownChatCount === 1
    ? getExtensionMessage('extensionStatusInactiveDisconnectedHelperOne')
    : disconnectedKnownChatCount > 1
      ? getExtensionMessage('extensionStatusInactiveDisconnectedHelperMany')
      : getExtensionMessage('extensionStatusInactiveHelper');
  setExtensionStatus('inactive', getExtensionMessage('extensionStatusInactiveAll'), inactiveHelper);
}

function setExtensionStatus(status: ExtensionStatus, text: string, helper: string): void {
  if (controls.extensionStatus) {
    controls.extensionStatus.dataset.extensionStatus = status;
  }
  if (controls.extensionStatusText) {
    controls.extensionStatusText.textContent = text;
  }
  if (controls.extensionStatusHelper) {
    controls.extensionStatusHelper.textContent = helper;
  }
}

function resetExtensionState(): void {
  const confirmed = window.confirm(getExtensionMessage('popupResetConfirm'));
  if (!confirmed) return;

  chrome.storage.local.clear(() => {
    chrome.storage.sync.clear(() => {
      chrome.storage.sync.set(DEFAULT_OPTIONS, () => {
        applyOptionsToControls(DEFAULT_OPTIONS);
        broadcastPageReset(() => {
          window.alert(getExtensionMessage('popupResetComplete'));
        });
      });
    });
  });
}

function broadcastPageReset(callback: () => void): void {
  chrome.tabs.query({}, (tabs) => {
    let pending = tabs.filter((tab) => typeof tab.id === 'number').length;
    if (!pending) {
      callback();
      return;
    }

    tabs.forEach((tab) => {
      if (typeof tab.id !== 'number') return;
      chrome.tabs.sendMessage(tab.id, { type: 'ytcq:reset-page' }, () => {
        void chrome.runtime.lastError;
        pending -= 1;
        if (!pending) callback();
      });
    });
  });
}

function applyOptionsToControls(options: Partial<Options>): void {
  if (!controls.targetLanguage || !controls.translationDisplay || !controls.sound) return;

  const normalized = normalizeOptions(options);
  lastKnownTranslationTarget = normalized.lastTranslationTarget;
  controls.targetLanguage.value = normalized.targetLanguage;
  controls.translationDisplay.value = normalized.translationDisplay;
  controls.sound.checked = normalized.sound;
}

function createLanguageOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function localizePopup(): string {
  const popupLocale = getBrowserUiLocale();
  document.documentElement.lang = popupLocale;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (key) element.textContent = getExtensionMessage(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((element) => {
    const key = element.dataset.i18nTitle;
    if (key) element.title = getExtensionMessage(key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((element) => {
    const key = element.dataset.i18nAriaLabel;
    if (key) element.setAttribute('aria-label', getExtensionMessage(key));
  });

  return popupLocale;
}

function getBrowserUiLocale(): string {
  return chrome.i18n?.getUILanguage?.() || navigator.language || 'en';
}

function getExtensionMessage(key: string, substitutions?: string | string[]): string {
  return chrome.i18n?.getMessage?.(key, substitutions) || key;
}

function getLocalizedLanguageLabel(languageCode: string, locale: string): string {
  try {
    const displayName = new Intl.DisplayNames([locale], { type: 'language' }).of(languageCode);
    if (displayName) return displayName;
  } catch {
    // Fall back to the static English catalog from LANGUAGE_OPTIONS.
  }

  return '';
}
