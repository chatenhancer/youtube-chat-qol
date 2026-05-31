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
import {
  ICON_VIEW_BOX,
  SOUND_BELL_ICON_PATH,
  SOUND_RINGING_BELL_ICON_PATH,
  TRANSLATE_ICON_PATH,
  TRANSLATE_SOURCE_ICON_PATH,
  TRANSLATE_TARGET_ICON_PATH
} from '../../shared/icons';
import { playSoftChime } from '../../shared/sounds/soft-chime';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { clampMenuToViewport, createMenuToggleItem } from './common';

type SaveOptions = (values: Partial<Options>) => void;

let saveOptions: SaveOptions = () => {};

const BELL_RING_CLASS = 'ytcq-bell-ringing';
const TRANSLATION_PULSE_CLASS = 'ytcq-translation-pulse';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

registerFeatureLifecycle({
  page: {
    init: ({ saveOptions }) => configureSettingsMenu(saveOptions),
    optionsChanged: refreshSettingsMenus
  }
});

export function configureSettingsMenu(callback: SaveOptions): void {
  saveOptions = callback;
}

export function enhanceSettingsMenu(menu: HTMLElement): void {
  const list = menu.querySelector('#items');
  if (!list || list.querySelector(':scope .ytcq-settings-item')) return;

  const options = getOptions();
  prepareSettingsMenu(menu);
  let translateItem: HTMLElement | null = null;
  translateItem = createMenuToggleItem({
    setting: 'targetLanguage',
    label: t('translateChat'),
    checked: Boolean(options.targetLanguage),
    iconPath: TRANSLATE_ICON_PATH,
    onClick: () => {
      const currentOptions = getOptions();
      const nextTargetLanguage = currentOptions.targetLanguage
        ? ''
        : getTranslationToggleTarget(currentOptions);
      if (nextTargetLanguage && translateItem) {
        animateTranslateMenuIcon(translateItem);
      }
      saveOptions(getTargetLanguageUpdate(nextTargetLanguage));
    }
  });
  prepareTranslateMenuIcon(translateItem);
  let soundItem: HTMLElement | null = null;
  soundItem = createMenuToggleItem({
    setting: 'sound',
    label: t('inboxSound'),
    checked: options.sound,
    iconPath: getSoundIconPath(options.sound),
    onClick: () => {
      const enabled = !getOptions().sound;
      if (enabled && soundItem) {
        animateSoundMenuIcon(soundItem);
        playSoftChime();
      }
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

export function cleanupStaleSettingsMenuSurfaces(): void {
  document.querySelectorAll('.ytcq-settings-item').forEach((item) => item.remove());
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

function prepareTranslateMenuIcon(item: HTMLElement): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-menu-icon');
  if (!icon) return;

  icon.classList.add('ytcq-translate-menu-icon');
  icon.replaceChildren(createSplitTranslateIcon());
}

function createSplitTranslateIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('viewBox', ICON_VIEW_BOX);
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(
    createTranslateIconPath(TRANSLATE_SOURCE_ICON_PATH, 'ytcq-translate-source-mark'),
    createTranslateIconPath(TRANSLATE_TARGET_ICON_PATH, 'ytcq-translate-target-mark')
  );
  return svg;
}

function createTranslateIconPath(pathData: string, className: string): SVGPathElement {
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('class', className);
  path.setAttribute('d', pathData);
  return path;
}

function animateTranslateMenuIcon(item: HTMLElement): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-translate-menu-icon');
  if (!icon) return;

  icon.classList.remove(TRANSLATION_PULSE_CLASS);
  void icon.getBoundingClientRect();
  icon.classList.add(TRANSLATION_PULSE_CLASS);
  window.setTimeout(() => {
    icon.classList.remove(TRANSLATION_PULSE_CLASS);
  }, 900);
}

function prepareSettingsMenu(menu: HTMLElement): void {
  menu.classList.add('ytcq-settings-expanded-menu');
  menu.classList.remove('ytcq-context-expanded-menu', 'ytcq-expanded-menu');
  menu.style.setProperty('--ytcq-context-shift-y', '0px');
  menu.style.removeProperty('width');
  menu.style.removeProperty('min-width');
  menu.style.removeProperty('max-width');
}
