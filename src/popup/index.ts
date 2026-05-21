/**
 * Extension action popup.
 *
 * Mirrors the most important chat settings outside YouTube's iframe. The popup
 * writes to chrome.storage.sync, and the content script reacts to those same
 * option updates as the injected chat settings menu.
 */
import { LANGUAGE_OPTIONS } from '../shared/languages';
import { DEFAULT_OPTIONS, getTargetLanguageUpdate, normalizeOptions, type Options } from '../shared/options';
import { clampNumber } from '../shared/text';

const LANDING_PAGE_URL = 'https://chatenhancer.com';
const GITHUB_URL = 'https://github.com/chat-enhancer-yt/youtube-chat-qol';
const SUPPORT_URL = 'https://github.com/chat-enhancer-yt/youtube-chat-qol/issues';

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
  keepChatLive: document.querySelector<HTMLInputElement>('#keepChatLive'),
  version: document.querySelector<HTMLElement>('#version')
};

let lastKnownTranslationTarget = DEFAULT_OPTIONS.lastTranslationTarget;

init();

function init(): void {
  if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.sound || !controls.keepChatLive) {
    return;
  }

  if (controls.version) {
    controls.version.textContent = `Version ${chrome.runtime.getManifest().version}`;
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
    chrome.tabs.create({ url: SUPPORT_URL });
  });

  controls.resetExtension?.addEventListener('click', resetExtensionState);

  controls.targetLanguage.appendChild(createLanguageOption('', 'Off'));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    controls.targetLanguage.appendChild(createLanguageOption(value, label));
  }

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions: Partial<Options>) => {
    if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.sound || !controls.keepChatLive) return;
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
    save({ sound: Boolean(controls.sound?.checked) });
  });

  controls.keepChatLive.addEventListener('change', () => {
    save({ keepChatLive: Boolean(controls.keepChatLive?.checked) });
  });
}

function save(values: Partial<Options>): void {
  chrome.storage.sync.set(values);
}

function resetExtensionState(): void {
  const confirmed = window.confirm('Reset Chat Enhancer settings and clear local inbox, keyword, and emoji data?');
  if (!confirmed) return;

  chrome.storage.local.clear(() => {
    chrome.storage.sync.clear(() => {
      chrome.storage.sync.set(DEFAULT_OPTIONS, () => {
        applyOptionsToControls(DEFAULT_OPTIONS);
        broadcastPageReset(() => {
          window.alert('Chat Enhancer has been reset.');
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
  if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.sound || !controls.keepChatLive) return;

  const normalized = normalizeOptions(options);
  lastKnownTranslationTarget = normalized.lastTranslationTarget;
  controls.targetLanguage.value = normalized.targetLanguage;
  controls.translationDisplay.value = normalized.translationDisplay;
  controls.quoteMaxLength.value = String(normalized.quoteMaxLength);
  controls.openProfilesInPopup.checked = normalized.openProfilesInPopup;
  controls.sound.checked = normalized.sound;
  controls.keepChatLive.checked = normalized.keepChatLive;
}

function createLanguageOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}
