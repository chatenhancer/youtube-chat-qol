/**
 * Live chat settings menu integration.
 *
 * Adds extension controls into YouTube's existing chat settings popup instead
 * of building a separate in-chat settings surface. Keep this menu to quick
 * stream-time toggles; detailed settings belong in the extension popup.
 */
import { getTargetLanguageUpdate, getTranslationToggleTarget, type Options } from '../../shared/options';
import { getOptions } from '../../shared/state';
import { t } from '../../shared/i18n';
import { clampMenuToViewport, createMenuToggleItem } from './common';

type SaveOptions = (values: Partial<Options>) => void;

let saveOptions: SaveOptions = () => {};

const SOUND_BELL_ICON_PATH = 'M12 3a4 4 0 00-4 4v3.2c0 1.15-.37 2.27-1.05 3.2L5.2 15.8A1.4 1.4 0 006.33 18h11.34a1.4 1.4 0 001.13-2.2l-1.75-2.4A5.43 5.43 0 0116 10.2V7a4 4 0 00-4-4Zm0 19a3 3 0 002.83-2h-5.66A3 3 0 0012 22Z';
const SOUND_RINGING_BELL_ICON_PATH = `${SOUND_BELL_ICON_PATH}M19.7 4.3a1 1 0 00-1.4 1.4A8.92 8.92 0 0121 12a1 1 0 102 0 10.9 10.9 0 00-3.3-7.7ZM5.7 5.7a1 1 0 00-1.4-1.4A10.9 10.9 0 001 12a1 1 0 102 0 8.92 8.92 0 012.7-6.3Z`;
const TRANSLATE_ICON_PATH = 'M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17a15.7 15.7 0 01-2.86 4.63A15.07 15.07 0 017.22 7H5.2a17.2 17.2 0 002.77 5.03l-5.09 5.02L4.3 18.47l5.01-5.01 3.11 3.11.45-1.5ZM18.5 10h-2L12 22h2l1.13-3h4.74L21 22h2l-4.5-12Zm-2.62 7l1.62-4.33L19.12 17h-3.24Z';
const BELL_RING_CLASS = 'ytcq-bell-ringing';

export function configureSettingsMenu(callback: SaveOptions): void {
  saveOptions = callback;
}

export function enhanceSettingsMenu(menu: HTMLElement): void {
  const list = menu.querySelector('#items');
  if (!list || list.querySelector(':scope .ytcq-settings-item')) return;

  const options = getOptions();
  prepareSettingsMenu(menu);
  const translateItem = createMenuToggleItem({
    setting: 'targetLanguage',
    label: t('translateChat'),
    checked: Boolean(options.targetLanguage),
    iconPath: TRANSLATE_ICON_PATH,
    onClick: () => {
      const currentOptions = getOptions();
      const nextTargetLanguage = currentOptions.targetLanguage
        ? ''
        : getTranslationToggleTarget(currentOptions);
      saveOptions(getTargetLanguageUpdate(nextTargetLanguage));
    }
  });
  let soundItem: HTMLElement | null = null;
  soundItem = createMenuToggleItem({
    setting: 'sound',
    label: t('inboxSound'),
    checked: options.sound,
    iconPath: getSoundIconPath(options.sound),
    onClick: () => {
      const enabled = !getOptions().sound;
      if (enabled && soundItem) animateSoundMenuIcon(soundItem);
      saveOptions({ sound: enabled });
    }
  });
  list.append(translateItem, soundItem);
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
      label.textContent = t('translateChat');
      item.setAttribute('aria-checked', String(Boolean(options.targetLanguage)));
    } else if (setting === 'sound') {
      label.textContent = t('inboxSound');
      item.setAttribute('aria-checked', String(options.sound));
      item.querySelector<SVGPathElement>('.ytcq-menu-icon path')?.setAttribute('d', getSoundIconPath(options.sound));
    }
  });
}

function getSoundIconPath(enabled: boolean): string {
  return enabled ? SOUND_RINGING_BELL_ICON_PATH : SOUND_BELL_ICON_PATH;
}

function animateSoundMenuIcon(item: HTMLElement): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-menu-icon');
  const path = icon?.querySelector<SVGPathElement>('path');
  if (!icon || !path) return;

  path.setAttribute('d', SOUND_RINGING_BELL_ICON_PATH);
  item.setAttribute('aria-checked', 'true');
  icon.classList.remove(BELL_RING_CLASS);
  void icon.getBoundingClientRect();
  icon.classList.add(BELL_RING_CLASS);
  window.setTimeout(() => {
    icon.classList.remove(BELL_RING_CLASS);
  }, 700);
}

function prepareSettingsMenu(menu: HTMLElement): void {
  menu.classList.add('ytcq-settings-expanded-menu');
  menu.classList.remove('ytcq-context-expanded-menu', 'ytcq-expanded-menu');
  menu.style.removeProperty('width');
  menu.style.removeProperty('min-width');
  menu.style.removeProperty('max-width');
}
