/**
 * Quick settings in YouTube's native chat menu.
 * Detailed settings remain in the browser extension popup.
 */
import { getTargetLanguageUpdate, getTranslationToggleTarget, type Options } from '../../shared/options';
import { getOptions } from '../../shared/state';
import { t } from '../../shared/i18n';
import {
  LITE_MODE_ICON_PATH,
  SOUND_BELL_ICON_PATH,
  TRANSLATE_ICON_PATH,
  createLiteModeIcon,
  createSoundBellIcon,
  createSplitTranslateIcon
} from '../../shared/icons';
import { isSupportedLiteModePage } from '../lite-mode/bootstrap';
import { playAlertSoundPreview } from '../../shared/sounds/alert-sounds';
import { animateSettingIcon, SETTING_ICON_ANIMATIONS } from '../../shared/setting-icon-animations';
import { registerFeature } from '../../content/dispatcher';
import { clampMenuToViewport, closeMenu, createMenuActionItem, createMenuToggleItem } from './common';
import { createSettingsGrid, setSettingsToggleChecked } from './settings-grid';
import {
  canTogglePictureInPicture,
  isPictureInPictureChat,
  togglePictureInPicture
} from '../picture-in-picture/bridge';
import { PIP_ICON_PATH } from '../picture-in-picture/ui';

type SaveOptions = (values: Partial<Options>) => void;

let saveOptions: SaveOptions = () => {};

registerFeature({
  page: {
    init: ({ saveOptions }) => configureSettingsMenu(saveOptions),
    optionsChanged: refreshSettingsMenus,
    reset: refreshSettingsMenus
  }
});

export function configureSettingsMenu(callback: SaveOptions): void {
  saveOptions = callback;
}

export function enhanceSettingsMenu(menu: HTMLElement): void {
  const list = menu.querySelector('#items');
  if (!list || list.querySelector('.ytcq-settings-grid')) return;
  menu.classList.add('ytcq-settings-grid-menu');
  menu.classList.remove('ytcq-context-expanded-menu');
  list.append(createSettingsGrid(createSettingsMenuItems()));
  clampMenuToViewport(menu);
}

function createSettingsMenuItems(): HTMLElement[] {
  const options = getOptions();
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
    label: t('alertSounds'),
    checked: options.sound,
    iconPath: SOUND_BELL_ICON_PATH,
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
    const liteModeIcon = createLiteModeIcon();
    liteModeIcon.classList.add('lite-mode-icon');
    const liteModeItem = createMenuToggleItem({
      setting: 'liteModeEnabled',
      label: t('liteMode'),
      checked: options.liteModeEnabled,
      iconPath: LITE_MODE_ICON_PATH,
      onClick: () => {
        const enabled = !getOptions().liteModeEnabled;
        if (enabled) animateSettingIcon(liteModeIcon, SETTING_ICON_ANIMATIONS.liteMode);
        saveOptions({ liteModeEnabled: enabled });
      }
    });
    liteModeItem.querySelector('.ytcq-menu-icon')?.replaceChildren(liteModeIcon);
    items.push(liteModeItem);
  }
  const pipAvailable = canTogglePictureInPicture();
  items.push(createMenuActionItem({
    action: 'picture-in-picture',
    label: t(isPictureInPictureChat() ? 'returnVideoChat' : 'videoChatPip'),
    title: t(!pipAvailable ? 'videoChatPipUnavailable'
      : isPictureInPictureChat() ? 'returnVideoChat' : 'videoChatPipTooltip'),
    iconPath: PIP_ICON_PATH,
    disabled: !pipAvailable,
    onClick: () => {
      closeMenu();
      togglePictureInPicture();
    }
  }));
  return items;
}

export function refreshSettingsMenus(): void {
  const options = getOptions();
  document.querySelectorAll<HTMLElement>('.ytcq-settings-item').forEach((item) => {
    const setting = item.getAttribute('data-ytcq-setting');
    const label = item.querySelector<HTMLElement>('.ytcq-menu-label');
    if (!setting || !label) return;

    if (setting === 'targetLanguage') {
      label.textContent = t('translateChat');
      setSettingsToggleChecked(item, Boolean(options.targetLanguage));
    } else if (setting === 'sound') {
      label.textContent = t('alertSounds');
      setSettingsToggleChecked(item, options.sound);
      renderSoundMenuIcon(item, options.sound);
    } else if (setting === 'liteModeEnabled') {
      label.textContent = t('liteMode');
      setSettingsToggleChecked(item, options.liteModeEnabled);
    }
  });
}

export function cleanupStaleSettingsMenuSurfaces(): void {
  // Firefox can keep the previous extension's injected submenu after reload.
  document.querySelectorAll('.ytcq-settings-expanded-menu, .ytcq-settings-grid-menu').forEach((menu) => {
    menu.classList.remove('ytcq-settings-expanded-menu', 'ytcq-settings-submenu-open', 'ytcq-settings-grid-menu');
    for (const animation of menu.querySelector('#items')?.getAnimations?.() || []) {
      if (animation.id === 'ytcq-settings-page') animation.cancel();
    }
  });
  document.querySelectorAll('.ytcq-settings-item, .ytcq-settings-grid, .ytcq-settings-button, .ytcq-settings-menu')
    .forEach((item) => item.remove());
}

function animateSoundMenuIcon(item: HTMLElement): void {
  const icon = item.querySelector<HTMLElement>('.ytcq-menu-icon');
  if (!icon) return;

  renderSoundMenuIcon(item, true);
  setSettingsToggleChecked(item, true);
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
