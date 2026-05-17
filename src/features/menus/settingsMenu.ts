/**
 * Live chat settings menu integration.
 *
 * Adds extension controls into YouTube's existing chat settings popup instead
 * of building a separate in-chat settings surface. Native selects are used for
 * language/display choices because they stay compact across themes.
 */
import { LANGUAGE_OPTIONS } from '../../shared/languages';
import {
  getNextQuoteLength,
  TRANSLATION_DISPLAY_OPTIONS,
  type Options
} from '../../shared/options';
import { getOptions } from '../../shared/state';
import {
  getMentionsInboxLabel,
  MENTIONS_INBOX_ICON_PATH,
  MENTIONS_INBOX_ICON_VIEW_BOX,
  openMentionsInboxCard
} from '../mentionsInbox';
import { clampMenuToViewport, closeMenu, createMenuActionItem, createMenuToggleItem, createPaperItem } from './common';

type SaveOptions = (values: Partial<Options>) => void;

let saveOptions: SaveOptions = () => {};

export function configureSettingsMenu(callback: SaveOptions): void {
  saveOptions = callback;
}

export function enhanceSettingsMenu(menu: HTMLElement): void {
  const list = menu.querySelector('#items');
  if (!list || list.querySelector(':scope .ytcq-settings-item')) return;

  const options = getOptions();
  prepareSettingsMenu(menu);
  list.append(
    createLanguageSelectItem(),
    createTranslationDisplaySelectItem(),
    createMenuActionItem({
      setting: 'quoteMaxLength',
      label: `Quote length: ${options.quoteMaxLength}`,
      iconPath: 'M7.2 6C5.45 7.45 4.5 9.34 4.5 11.55V18h6.4v-6.25H7.25c.08-1.33.62-2.42 1.63-3.28L7.2 6Zm9 0c-1.75 1.45-2.7 3.34-2.7 5.55V18h6.4v-6.25h-3.65c.08-1.33.62-2.42 1.63-3.28L16.2 6Z',
      onClick: () => {
        saveOptions({ quoteMaxLength: getNextQuoteLength(getOptions().quoteMaxLength) });
      }
    }),
    createMenuToggleItem({
      setting: 'openProfilesInPopup',
      label: 'Avatar popups',
      checked: options.openProfilesInPopup,
      iconPath: 'M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2Z',
      onClick: () => {
        saveOptions({ openProfilesInPopup: !getOptions().openProfilesInPopup });
      }
    }),
    createMenuToggleItem({
      setting: 'mentionSound',
      label: 'Mention sound',
      checked: options.mentionSound,
      iconPath: 'M12 3a4 4 0 00-4 4v3.2c0 1.15-.37 2.27-1.05 3.2L5.2 15.8A1.4 1.4 0 006.33 18h11.34a1.4 1.4 0 001.13-2.2l-1.75-2.4A5.43 5.43 0 0116 10.2V7a4 4 0 00-4-4Zm0 19a3 3 0 002.83-2h-5.66A3 3 0 0012 22ZM19.7 4.3a1 1 0 00-1.4 1.4A8.92 8.92 0 0121 12a1 1 0 102 0 10.9 10.9 0 00-3.3-7.7ZM5.7 5.7a1 1 0 00-1.4-1.4A10.9 10.9 0 001 12a1 1 0 102 0 8.92 8.92 0 012.7-6.3Z',
      onClick: () => {
        saveOptions({ mentionSound: !getOptions().mentionSound });
      }
    }),
    createMenuActionItem({
      setting: 'mentionsInbox',
      label: getMentionsInboxLabel(),
      iconPath: MENTIONS_INBOX_ICON_PATH,
      iconViewBox: MENTIONS_INBOX_ICON_VIEW_BOX,
      onClick: () => {
        openMentionsInboxCard(menu);
        closeMenu();
      }
    })
  );
  refreshSettingsMenus();
  clampMenuToViewport(menu);
}

export function refreshSettingsMenus(): void {
  const options = getOptions();
  document.querySelectorAll<HTMLElement>('.ytcq-settings-item').forEach((item) => {
    const setting = item.getAttribute('data-ytcq-setting');
    const label = item.querySelector<HTMLElement>('.ytcq-menu-label');
    if (!setting || !label) return;

    if (setting === 'targetLanguage') {
      label.textContent = 'Translate to';
      const select = item.querySelector<HTMLSelectElement>('.ytcq-menu-select');
      if (select) select.value = options.targetLanguage;
    } else if (setting === 'translationDisplay') {
      label.textContent = 'Translation display';
      const select = item.querySelector<HTMLSelectElement>('.ytcq-menu-select');
      if (select) select.value = options.translationDisplay;
    } else if (setting === 'quoteMaxLength') {
      label.textContent = `Quote length: ${options.quoteMaxLength}`;
    } else if (setting === 'openProfilesInPopup') {
      label.textContent = 'Avatar popups';
      item.setAttribute('aria-checked', String(options.openProfilesInPopup));
    } else if (setting === 'mentionSound') {
      label.textContent = 'Mention sound';
      item.setAttribute('aria-checked', String(options.mentionSound));
    } else if (setting === 'mentionsInbox') {
      label.textContent = getMentionsInboxLabel();
    }
  });
}

function prepareSettingsMenu(menu: HTMLElement): void {
  menu.classList.add('ytcq-settings-expanded-menu');
  menu.classList.remove('ytcq-context-expanded-menu', 'ytcq-expanded-menu');
  menu.style.removeProperty('width');
  menu.style.removeProperty('min-width');
  menu.style.removeProperty('max-width');
}

function createLanguageSelectItem(): HTMLElement {
  const options = getOptions();
  const item = document.createElement('div');
  item.className = 'style-scope ytd-menu-popup-renderer ytcq-settings-item ytcq-select-item';
  item.setAttribute('system-icons', '');
  item.setAttribute('role', 'menuitem');
  item.setAttribute('use-icons', '');
  item.setAttribute('tabindex', '-1');
  item.setAttribute('aria-selected', 'false');
  item.setAttribute('data-ytcq-setting', 'targetLanguage');
  item.appendChild(createPaperItem({
    label: 'Translate to',
    iconPath: 'M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17a15.7 15.7 0 01-2.86 4.63A15.07 15.07 0 017.22 7H5.2a17.2 17.2 0 002.77 5.03l-5.09 5.02L4.3 18.47l5.01-5.01 3.11 3.11.45-1.5ZM18.5 10h-2L12 22h2l1.13-3h4.74L21 22h2l-4.5-12Zm-2.62 7l1.62-4.33L19.12 17h-3.24Z'
  }));

  const select = document.createElement('select');
  select.className = 'ytcq-menu-select';
  select.setAttribute('aria-label', 'Target language');
  select.appendChild(createSelectOption('', 'Off'));
  for (const [value, label] of LANGUAGE_OPTIONS) {
    select.appendChild(createSelectOption(value, label));
  }
  select.value = options.targetLanguage;
  select.addEventListener('change', (event) => {
    event.stopPropagation();
    saveOptions({ targetLanguage: select.value });
  });

  stopMenuPropagation(select);
  item.querySelector('.ytcq-paper-item')?.appendChild(select);
  return item;
}

function createTranslationDisplaySelectItem(): HTMLElement {
  const options = getOptions();
  const item = document.createElement('div');
  item.className = 'style-scope ytd-menu-popup-renderer ytcq-settings-item ytcq-select-item';
  item.setAttribute('system-icons', '');
  item.setAttribute('role', 'menuitem');
  item.setAttribute('use-icons', '');
  item.setAttribute('tabindex', '-1');
  item.setAttribute('aria-selected', 'false');
  item.setAttribute('data-ytcq-setting', 'translationDisplay');
  item.appendChild(createPaperItem({
    label: 'Translation display',
    iconPath: 'M4 4h16a2 2 0 012 2v9a2 2 0 01-2 2h-5.2l-4.1 3.3A1 1 0 019 19.5V17H4a2 2 0 01-2-2V6a2 2 0 012-2Zm0 2v9h7v2.42L14.1 15H20V6H4Zm2 2h12v2H6V8Zm0 4h8v2H6v-2Z'
  }));

  const select = document.createElement('select');
  select.className = 'ytcq-menu-select';
  select.setAttribute('aria-label', 'Translation display');
  for (const [value, label] of TRANSLATION_DISPLAY_OPTIONS) {
    select.appendChild(createSelectOption(value, label));
  }
  select.value = options.translationDisplay;
  select.addEventListener('change', (event) => {
    event.stopPropagation();
    saveOptions({ translationDisplay: select.value as Options['translationDisplay'] });
  });

  stopMenuPropagation(select);
  item.querySelector('.ytcq-paper-item')?.appendChild(select);
  return item;
}

function createSelectOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function stopMenuPropagation(select: HTMLSelectElement): void {
  ['pointerdown', 'mousedown', 'click', 'keydown', 'keyup'].forEach((eventName) => {
    select.addEventListener(eventName, (event) => {
      event.stopPropagation();
    });
  });
}
