/**
 * Extension action popup.
 *
 * Mirrors the most important chat settings outside YouTube's iframe. The popup
 * writes to chrome.storage.sync, and the content script reacts to those same
 * option updates as the injected chat settings menu.
 */
import { LANGUAGE_OPTIONS } from '../shared/languages';
import { playSoftChime } from '../shared/sounds/soft-chime';
import { DEFAULT_OPTIONS, getTargetLanguageUpdate, normalizeOptions, type Options } from '../shared/options';
import { clampNumber } from '../shared/text';

const LANDING_PAGE_URL = 'https://chatenhancer.com';
const GITHUB_URL = 'https://github.com/chat-enhancer-yt/youtube-chat-qol';
const SUPPORT_URL = 'https://github.com/chat-enhancer-yt/youtube-chat-qol/issues';
const BELL_RING_CLASS = 'ytcq-bell-ringing';

const controls = {
  landingLink: document.querySelector<HTMLAnchorElement>('#landingLink'),
  githubLink: document.querySelector<HTMLAnchorElement>('#githubLink'),
  supportLink: document.querySelector<HTMLAnchorElement>('#supportLink'),
  resetExtension: document.querySelector<HTMLButtonElement>('#resetExtension'),
  targetLanguage: document.querySelector<HTMLSelectElement>('#targetLanguage'),
  translationDisplay: document.querySelector<HTMLSelectElement>('#translationDisplay'),
  quoteMaxLength: document.querySelector<HTMLInputElement>('#quoteMaxLength'),
  openProfilesInPopup: document.querySelector<HTMLInputElement>('#openProfilesInPopup'),
  sound: document.querySelector<HTMLInputElement>('#sound'),
  version: document.querySelector<HTMLElement>('#version')
};

let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;

init();

function init(): void {
  const popupLocale = localizePopup();

  if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.sound) {
    return;
  }

  if (controls.version) {
    controls.version.textContent = getExtensionMessage('versionLabel', chrome.runtime.getManifest().version);
  }

  controls.landingLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: LANDING_PAGE_URL });
  });
  controls.githubLink?.addEventListener('click', (event) => {
    event.preventDefault();
    chrome.tabs.create({ url: GITHUB_URL });
  });
  controls.supportLink?.addEventListener('click', (event) => {
    event.preventDefault();
    const confirmed = window.confirm(getExtensionMessage('supportGithubIssuesPrompt'));
    if (!confirmed) return;
    chrome.tabs.create({ url: SUPPORT_URL });
  });

  controls.resetExtension?.addEventListener('click', resetExtensionState);

  controls.targetLanguage.appendChild(createLanguageOption('', getExtensionMessage('off')));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    controls.targetLanguage.appendChild(createLanguageOption(value, getLocalizedLanguageLabel(value, popupLocale) || label));
  }

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions: Partial<Options>) => {
    if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.sound) return;
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

  controls.quoteMaxLength.addEventListener('change', () => {
    if (!controls.quoteMaxLength) return;
    const value = clampNumber(controls.quoteMaxLength.value, 40, 240, DEFAULT_OPTIONS.quoteMaxLength);
    controls.quoteMaxLength.value = String(value);
    save({ quoteMaxLength: value });
  });

  controls.openProfilesInPopup.addEventListener('change', () => {
    save({ openProfilesInPopup: Boolean(controls.openProfilesInPopup?.checked) });
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
  if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.sound) return;

  const normalized = normalizeOptions(options);
  lastKnownTranslationTarget = normalized.lastTranslationTarget;
  controls.targetLanguage.value = normalized.targetLanguage;
  controls.translationDisplay.value = normalized.translationDisplay;
  controls.quoteMaxLength.value = String(normalized.quoteMaxLength);
  controls.openProfilesInPopup.checked = normalized.openProfilesInPopup;
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
