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
  BOLT_ICON_PATH,
  MATERIAL_ICON_VIEW_BOX,
  SOUND_BELL_ICON_PATH,
  TRANSLATE_ICON_PATH,
  createSoundBellIcon,
  createSplitTranslateIcon
} from '../../shared/icons';
import { isSupportedLiteModePage } from '../lite-mode/bootstrap';
import { playAlertSoundPreview } from '../../shared/sounds/alert-sounds';
import { animateSettingIcon, SETTING_ICON_ANIMATIONS } from '../../shared/setting-icon-animations';
import { registerFeature } from '../../content/dispatcher';
import { clampMenuToViewport, closeMenu, createMenuActionItem, createMenuToggleItem } from './common';
import {
  canTogglePictureInPicture,
  isPictureInPictureChat,
  togglePictureInPicture
} from '../picture-in-picture/bridge';
import { PIP_ICON_PATH } from '../picture-in-picture/ui';
import { appendSettingsSubmenu, resetSettingsSubmenus } from './settings-submenu';

type SaveOptions = (values: Partial<Options>) => void;

let saveOptions: SaveOptions = () => {};

registerFeature({
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
    iconViewBox: MATERIAL_ICON_VIEW_BOX,
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
    label: t('alertSounds'),
    checked: options.sound,
    iconPath: SOUND_BELL_ICON_PATH,
    iconViewBox: MATERIAL_ICON_VIEW_BOX,
    onClick: () => {
      const enabled = !getOptions().sound;
      if (enabled && soundItem) {
        animateSoundMenuIcon(soundItem);
        playAlertSoundPreview();
      }
      saveOptions({ sound: enabled });
    }
  });
  renderSoundMenuIcon(soundItem, options.sound);
  const items = [translateItem, soundItem];
  if (isSupportedLiteModePage()) {
    items.push(createMenuToggleItem({
      setting: 'liteModeEnabled',
      label: t('liteMode'),
      checked: options.liteModeEnabled,
      iconPath: BOLT_ICON_PATH,
      iconViewBox: MATERIAL_ICON_VIEW_BOX,
      onClick: () => saveOptions({ liteModeEnabled: !getOptions().liteModeEnabled })
    }));
  }
  if (canTogglePictureInPicture()) {
    items.push(createMenuActionItem({
      action: 'picture-in-picture',
      label: t(isPictureInPictureChat() ? 'returnVideoChat' : 'videoChatPip'),
      iconPath: PIP_ICON_PATH,
      onClick: () => {
        closeMenu();
        togglePictureInPicture();
      }
    }));
  }
  appendSettingsSubmenu(menu, items);
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
      label.textContent = t('alertSounds');
      item.setAttribute('aria-checked', String(options.sound));
      renderSoundMenuIcon(item, options.sound);
    } else if (setting === 'liteModeEnabled') {
      label.textContent = t('liteMode');
      item.setAttribute('aria-checked', String(options.liteModeEnabled));
    }
  });
}

export function cleanupStaleSettingsMenuSurfaces(): void {
  resetSettingsSubmenus();
  document.querySelectorAll('.ytcq-settings-item').forEach((item) => item.remove());
}

function animateSoundMenuIcon(item: HTMLElement): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-menu-icon');
  if (!icon) return;

  renderSoundMenuIcon(item, true);
  item.setAttribute('aria-checked', 'true');
  animateSettingIcon(icon, SETTING_ICON_ANIMATIONS.bell);
}

function renderSoundMenuIcon(item: HTMLElement, ringing: boolean): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-menu-icon');
  const bell = icon?.querySelector<SVGSVGElement>('svg');
  if (!icon) return;

  const isPrepared =
    Boolean(bell?.querySelector('.ytcq-bell-body')) &&
    Boolean(bell?.querySelector('.ytcq-bell-clapper'));
  const hasRing = Boolean(bell?.querySelector('.ytcq-bell-ring'));
  if (isPrepared && hasRing === ringing) return;

  icon.replaceChildren(createSoundBellIcon(ringing));
}

function prepareTranslateMenuIcon(item: HTMLElement): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-menu-icon');
  if (!icon) return;

  icon.classList.add('ytcq-translate-menu-icon');
  icon.replaceChildren(createSplitTranslateIcon({
    sourceClassName: 'ytcq-translate-source-mark',
    targetClassName: 'ytcq-translate-target-mark'
  }));
}

function animateTranslateMenuIcon(item: HTMLElement): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-translate-menu-icon');
  animateSettingIcon(icon, SETTING_ICON_ANIMATIONS.translation);
}

function prepareSettingsMenu(menu: HTMLElement): void {
  menu.classList.add('ytcq-settings-expanded-menu');
  menu.classList.remove('ytcq-context-expanded-menu');
  menu.style.setProperty('--ytcq-context-shift-y', '0px');
  menu.style.removeProperty('width');
  menu.style.removeProperty('min-width');
  menu.style.removeProperty('max-width');
}
