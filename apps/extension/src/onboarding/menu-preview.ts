/** Show the same compact quick controls below YouTube’s native menu examples. */
import { createMenuActionItem, createMenuToggleItem } from '../features/menus/common';
import { createSettingsGrid, handleSettingsGridBoundaryKeyDown, setSettingsToggleChecked } from '../features/menus/settings-grid';
import { PIP_ICON_PATH } from '../features/picture-in-picture/ui';
import { initUiLocaleFromDocument, t, type MessageKey } from '../shared/i18n';
import { getExtensionMessage } from '../shared/extension-page-i18n';
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
  trigger.setAttribute('aria-label', getExtensionMessage('onboardingChatMenuTooltip'));
  const translate = createMenuToggleItem({
    setting: 'targetLanguage', label: t('translateChat'), checked: Boolean(controls.targetLanguage.value),
    iconPath: TRANSLATE_ICON_PATH, iconViewBox: MATERIAL_ICON_VIEW_BOX, onClick: toggleTranslation
  });
  const sound = createMenuToggleItem({
    setting: 'sound', label: t('alertSounds'), checked: true,
    iconPath: SOUND_BELL_ICON_PATH, iconViewBox: MATERIAL_ICON_VIEW_BOX,
    onClick: () => {
      const enabled = sound.getAttribute('aria-checked') !== 'true';
      setSettingsToggleChecked(sound, enabled);
      chrome.storage.sync.set({ sound: enabled });
    }
  });
  chrome.storage.sync.get({ sound: true }, (options: Pick<Options, 'sound'>) => {
    setSettingsToggleChecked(sound, options.sound);
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
    setSettingsToggleChecked(lite, controls.liteModeEnabled.checked);
  });
  controls.targetLanguage.addEventListener('change', () => {
    setSettingsToggleChecked(translate, Boolean(controls.targetLanguage.value));
  });
  const items = [translate, sound, lite];
  if ('documentPictureInPicture' in window) {
    const pip = createMenuActionItem({
      action: 'picture-in-picture', label: t('videoChatPip'), iconPath: PIP_ICON_PATH,
      title: t('videoChatPipTooltip'),
      onClick: () => root.classList.toggle('preview-pip-info-visible')
    });
    items.push(pip);
  }
  const menu = document.createElement('ytd-menu-popup-renderer');
  menu.id = 'previewSettingsMenu';
  menu.className = 'preview-settings-menu ytcq-live-chat-menu-size-repaired';
  menu.setAttribute('role', 'menu');
  const list = document.createElement('div');
  list.id = 'items';
  appendNativeMenuPreview(list);
  list.append(createSettingsGrid(items));
  menu.append(list);
  menu.addEventListener('keydown', handleSettingsGridBoundaryKeyDown, { capture: true });
  menu.hidden = true;
  // Keep the PiP explanation's link next in the keyboard order after its row.
  root.insertBefore(menu, root.querySelector('.preview-tooltip-layer'));
  const pipTooltip = root.querySelector<HTMLElement>('#previewPipTooltip');
  if (pipTooltip && 'documentPictureInPicture' in window) {
    // Follow the menu's real size so translated labels keep the explanation
    // below the popup with its arrow centered.
    const positionTooltip = (): void => {
      if (menu.hidden) return;
      positionMenu();
      const menuBounds = menu.getBoundingClientRect();
      pipTooltip.style.top = `${menuBounds.bottom - root.getBoundingClientRect().top - root.clientTop + 12}px`;
      const itemBounds = menu.querySelector('[data-ytcq-action="picture-in-picture"]')!.getBoundingClientRect();
      pipTooltip.style.setProperty(
        '--preview-pip-arrow-left',
        `${itemBounds.left + itemBounds.width / 2 - pipTooltip.getBoundingClientRect().left - 4.5}px`
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
    if (opening) {
      positionMenu();
      list.querySelector<HTMLElement>('.preview-native-menu-item')?.focus();
    }
  });
  menu.addEventListener('keydown', event => {
    // Grid arrow keys are handled inside the shared control group.
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const rows = Array.from(list.children) as HTMLElement[];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    rows[next]?.focus();
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || menu.hidden) return;
    event.preventDefault();
    close();
    trigger.focus();
  });
  document.addEventListener('click', (event) => {
    if (event.target instanceof Node && !menu.contains(event.target) && !trigger.contains(event.target)) close();
  });

  const header = root.querySelector('.preview-header-actions');
  const positionHeaderTips = (): void => {
    for (const [buttonId, tipId] of [
      ['previewMenuButton', 'previewChatMenuTooltip'],
      ['previewGamesIcon', 'previewGamesTooltip'],
      ['previewInboxIcon', 'previewInboxTooltip']
    ]) {
      const button = root.querySelector<HTMLElement>(`#${buttonId}`);
      const tip = root.querySelector<HTMLElement>(`#${tipId}`);
      if (!button || !tip) continue;
      const bounds = button.getBoundingClientRect();
      tip.style.setProperty('--preview-header-arrow-left', `${bounds.left + bounds.width / 2 - tip.getBoundingClientRect().left - 4.5}px`);
    }
    if (!menu.hidden) positionMenu();
  };
  if (header) new ResizeObserver(positionHeaderTips).observe(header);
  positionHeaderTips();

  function positionMenu(): void {
    const bounds = root.getBoundingClientRect();
    const anchor = trigger!.getBoundingClientRect();
    const width = menu.getBoundingClientRect().width;
    const preferred = getComputedStyle(root).direction === 'rtl' ? anchor.left : anchor.right - width;
    menu.style.left = `${Math.max(8, Math.min(preferred - bounds.left - root.clientLeft, root.clientWidth - width - 8))}px`;
    menu.style.top = `${anchor.bottom - bounds.top - root.clientTop + 4}px`;
  }

  function close(): void {
    menu.hidden = true;
    trigger!.setAttribute('aria-expanded', 'false');
    root.classList.remove('preview-pip-info-visible');
  }
}

/** Static native examples participate in navigation without changing settings. */
function appendNativeMenuPreview(list: HTMLElement): void {
  const rows: { label: MessageKey; iconPath: string }[] = [
    {
      label: 'onboardingMenuParticipants',
      iconPath: 'M12 2a5 5 0 100 10 5 5 0 000-10Zm0 2a3 3 0 110 6 3 3 0 010-6Zm0 9a8 8 0 00-8 8 1 1 0 102 0 6 6 0 1112 0 1 1 0 002 0 8 8 0 00-8-8Z'
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
  for (const { label, iconPath } of rows) {
    const row = document.createElement('div');
    row.className = 'preview-native-menu-item ytcq-settings-item';
    row.setAttribute('role', 'menuitem');
    row.setAttribute('aria-disabled', 'true');
    row.tabIndex = -1;
    const content = document.createElement('div');
    content.className = 'ytcq-paper-item';
    const icon = document.createElement('span');
    icon.className = 'ytcq-menu-icon';
    icon.append(createSvgIcon('0 0 24 24', iconPath));
    const text = document.createElement('span');
    text.className = 'ytcq-menu-label';
    text.textContent = t(label);
    content.append(icon, text);
    row.append(content);
    list.append(row);
  }
}
