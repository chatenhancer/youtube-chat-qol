/** Reuse the real submenu rows and navigation in the onboarding chat. */
import { createMenuActionItem, createMenuToggleItem } from '../features/menus/common';
import { appendSettingsSubmenu, handleSettingsSubmenuKeyDown, resetSettingsSubmenus } from '../features/menus/settings-submenu';
import { PIP_ICON_PATH } from '../features/picture-in-picture/ui';
import { initUiLocaleFromDocument, t, type MessageKey } from '../shared/i18n';
import { BOLT_ICON_PATH, MATERIAL_ICON_VIEW_BOX, SOUND_BELL_ICON_PATH, TRANSLATE_ICON_PATH, createSvgIcon } from '../shared/icons';
import type { Options } from '../shared/options';

export async function initMenuPreview(
  root: HTMLElement,
  controls: { liteModeEnabled: HTMLInputElement; targetLanguage: HTMLSelectElement },
  toggleTranslation: () => void
): Promise<void> {
  const trigger = root.querySelector<HTMLButtonElement>('#previewMenuButton');
  if (!trigger) return;
  await initUiLocaleFromDocument();
  if (!root.isConnected || root.querySelector('#previewSettingsMenu')) return;
  const menu = document.createElement('ytd-menu-popup-renderer');
  menu.id = 'previewSettingsMenu';
  menu.className = 'preview-settings-menu ytcq-settings-expanded-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;
  const list = document.createElement('div');
  list.id = 'items';
  menu.append(list);
  appendNativeMenuPreview(list);
  const translate = createMenuToggleItem({
    setting: 'targetLanguage', label: t('translateChat'), checked: Boolean(controls.targetLanguage.value),
    iconPath: TRANSLATE_ICON_PATH, iconViewBox: MATERIAL_ICON_VIEW_BOX, onClick: toggleTranslation
  });
  const sound = createMenuToggleItem({
    setting: 'sound', label: t('alertSounds'), checked: true,
    iconPath: SOUND_BELL_ICON_PATH, iconViewBox: MATERIAL_ICON_VIEW_BOX,
    onClick: () => {
      const enabled = sound.getAttribute('aria-checked') !== 'true';
      sound.setAttribute('aria-checked', String(enabled));
      chrome.storage.sync.set({ sound: enabled });
    }
  });
  chrome.storage.sync.get({ sound: true }, (options: Pick<Options, 'sound'>) => {
    sound.setAttribute('aria-checked', String(options.sound));
  });
  const lite = createMenuToggleItem({
    setting: 'liteModeEnabled', label: t('liteMode'), checked: controls.liteModeEnabled.checked,
    iconPath: BOLT_ICON_PATH, iconViewBox: MATERIAL_ICON_VIEW_BOX,
    onClick: () => {
      controls.liteModeEnabled.checked = !controls.liteModeEnabled.checked;
      controls.liteModeEnabled.dispatchEvent(new Event('change'));
    }
  });
  controls.liteModeEnabled.addEventListener('change', () => {
    lite.setAttribute('aria-checked', String(controls.liteModeEnabled.checked));
  });
  controls.targetLanguage.addEventListener('change', () => {
    translate.setAttribute('aria-checked', String(Boolean(controls.targetLanguage.value)));
  });
  const items = [translate, sound, lite];
  if ('documentPictureInPicture' in window) {
    const pip = createMenuActionItem({
      action: 'picture-in-picture', label: t('videoChatPip'), iconPath: PIP_ICON_PATH,
      onClick: () => root.classList.toggle('preview-pip-info-visible')
    });
    items.push(pip);
  }
  appendSettingsSubmenu(menu, items);
  // Keep the PiP explanation's link next in the keyboard order after its row.
  root.insertBefore(menu, root.querySelector('.preview-tooltip-layer'));
  const pipTooltip = root.querySelector<HTMLElement>('#previewPipTooltip');
  if (pipTooltip && 'documentPictureInPicture' in window) {
    // Follow the menu's real size, including translated labels and its slide
    // animation, so the arrow stays centered and the card clears the popup.
    const positionTooltip = (): void => {
      if (menu.hidden) return;
      const menuBounds = menu.getBoundingClientRect();
      pipTooltip.style.top = `${menuBounds.bottom - root.getBoundingClientRect().top - root.clientTop + 12}px`;
      pipTooltip.style.setProperty(
        '--preview-pip-arrow-left',
        `${menuBounds.left + menuBounds.width / 2 - pipTooltip.getBoundingClientRect().left - 4.5}px`
      );
    };
    const observer = new ResizeObserver(positionTooltip);
    observer.observe(menu);
    observer.observe(pipTooltip);
  }
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.addEventListener('click', () => {
    const opening = menu.hidden;
    close();
    menu.hidden = !opening;
    trigger.setAttribute('aria-expanded', String(opening));
    if (opening) menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"] .ytcq-paper-item')?.focus();
  });
  window.addEventListener('keydown', handleSettingsSubmenuKeyDown, { capture: true });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menu.hidden) return;
    event.preventDefault();
    close();
    trigger.focus();
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) close();
  });

  function close(): void {
    resetSettingsSubmenus(menu);
    menu.hidden = true;
    trigger!.setAttribute('aria-expanded', 'false');
    root.classList.remove('preview-pip-info-visible');
  }
}

/** Static examples: no activation handlers, focus targets, or settings writes. */
function appendNativeMenuPreview(list: HTMLElement): void {
  const rows: { label: MessageKey; iconPath: string; checked?: boolean }[] = [
    {
      label: 'onboardingMenuParticipants',
      iconPath: 'M12 2a5 5 0 100 10 5 5 0 000-10Zm0 2a3 3 0 110 6 3 3 0 010-6Zm0 9a8 8 0 00-8 8 1 1 0 102 0 6 6 0 1112 0 1 1 0 002 0 8 8 0 00-8-8Z'
    },
    {
      label: 'onboardingMenuTimestamps', checked: false,
      iconPath: 'M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1Zm0 2a9 9 0 110 18.001A9 9 0 0112 3Zm0 3a1 1 0 00-1 1v5.565l.485.292 3.33 2a1 1 0 001.03-1.714L13 11.435V7a1 1 0 00-1-1Z'
    },
    {
      label: 'onboardingMenuReactions', checked: true,
      iconPath: 'M12 1C5.925 1 1 5.925 1 12s4.925 11 11 11 11-4.925 11-11S18.075 1 12 1Zm0 2a9 9 0 110 18.001A9 9 0 0112 3Zm2.004 3.5c-.72 0-1.401.17-2.004.47A4.498 4.498 0 005.5 11c0 2.516 1.72 4.403 2.936 5.458a14.703 14.703 0 002.561 1.777l.055.03.017.008.007.005h.003v.002c.001 0 .002 0 .914-1.78l.915 1.778.008-.004.066-.034.164-.09c.775-.439 1.51-.945 2.195-1.513 1.141-.95 2.737-2.592 3.08-4.795A4.5 4.5 0 0014.004 6.5Zm0 2a2.498 2.498 0 012.446 3.001c-.427 2.933-4.457 4.999-4.457 4.999-.02-.01-4.493-2.312-4.493-5.5a2.5 2.5 0 012.496-2.5A2.5 2.5 0 0112 9.509 2.49 2.49 0 0114.004 8.5Zm-1.098 9.78-.913-1.78-.912 1.779.912.469.913-.468Z'
    },
    {
      label: 'onboardingMenuPopout',
      iconPath: 'M19 5H8a1 1 0 000 2h7.586L5.293 17.293a1 1 0 101.414 1.414L17 8.414V16a1 1 0 002 0V5Z'
    },
    {
      label: 'onboardingMenuFeedback',
      iconPath: 'M19 2H5a4 4 0 00-4 4v10a4 4 0 004 4h2v1.604a1.41 1.41 0 002.095 1.232L14.2 20H19a4 4 0 004-4V6a4 4 0 00-4-4ZM5 4h14a2 2 0 012 2v10a2 2 0 01-2 2h-5.318l-.453.252L9 20.6V18H5a2 2 0 01-2-2V6a2 2 0 012-2Zm7 2a1 1 0 00-1 1v4.5a1 1 0 002 0V7a1 1 0 00-1-1Zm0 7.75a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5Z'
    }
  ];
  for (const { label, iconPath, checked } of rows) {
    const row = document.createElement('div');
    row.className = 'preview-native-menu-item ytcq-settings-item';
    row.setAttribute('role', checked === undefined ? 'menuitem' : 'menuitemcheckbox');
    row.setAttribute('aria-disabled', 'true');
    const content = document.createElement('div');
    content.className = 'ytcq-paper-item';
    const icon = document.createElement('span');
    icon.className = 'ytcq-menu-icon';
    icon.append(createSvgIcon('0 0 24 24', iconPath));
    const text = document.createElement('span');
    text.className = 'ytcq-menu-label';
    text.textContent = t(label);
    content.append(icon, text);
    if (checked !== undefined) {
      row.classList.add('ytcq-toggle-item');
      row.setAttribute('aria-checked', String(checked));
      const toggle = document.createElement('span');
      toggle.className = 'ytcq-menu-toggle';
      toggle.setAttribute('aria-hidden', 'true');
      content.append(toggle);
    }
    row.append(content);
    list.append(row);
  }
}
