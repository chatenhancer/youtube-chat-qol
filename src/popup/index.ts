/**
 * Extension action popup.
 *
 * Mirrors the most important chat settings outside YouTube's iframe. The popup
 * writes to chrome.storage.sync, and the content script reacts to those same
 * option updates as the injected chat settings menu.
 */
import { LANGUAGE_OPTIONS } from '../shared/languages';
import { DEFAULT_OPTIONS, type Options } from '../shared/options';
import { clampNumber } from '../shared/text';

const controls = {
  targetLanguage: document.querySelector<HTMLSelectElement>('#targetLanguage'),
  translationDisplay: document.querySelector<HTMLSelectElement>('#translationDisplay'),
  quoteMaxLength: document.querySelector<HTMLInputElement>('#quoteMaxLength'),
  openProfilesInPopup: document.querySelector<HTMLInputElement>('#openProfilesInPopup'),
  mentionSound: document.querySelector<HTMLInputElement>('#mentionSound'),
  version: document.querySelector<HTMLElement>('#version')
};

init();

function init(): void {
  if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.mentionSound) {
    return;
  }

  if (controls.version) {
    controls.version.textContent = `Version ${chrome.runtime.getManifest().version}`;
  }

  controls.targetLanguage.appendChild(createLanguageOption('', 'Off'));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    controls.targetLanguage.appendChild(createLanguageOption(value, label));
  }

  chrome.storage.sync.get(DEFAULT_OPTIONS, (storedOptions: Partial<Options>) => {
    if (!controls.targetLanguage || !controls.translationDisplay || !controls.quoteMaxLength || !controls.openProfilesInPopup || !controls.mentionSound) return;
    controls.targetLanguage.value = storedOptions.targetLanguage || '';
    controls.translationDisplay.value = storedOptions.translationDisplay || DEFAULT_OPTIONS.translationDisplay;
    controls.quoteMaxLength.value = String(storedOptions.quoteMaxLength || DEFAULT_OPTIONS.quoteMaxLength);
    controls.openProfilesInPopup.checked = storedOptions.openProfilesInPopup !== false;
    controls.mentionSound.checked = storedOptions.mentionSound !== false;
  });

  controls.targetLanguage.addEventListener('change', () => {
    save({ targetLanguage: controls.targetLanguage?.value || '' });
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

  controls.mentionSound.addEventListener('change', () => {
    save({ mentionSound: Boolean(controls.mentionSound?.checked) });
  });
}

function save(values: Partial<Options>): void {
  chrome.storage.sync.set(values);
}

function createLanguageOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}
