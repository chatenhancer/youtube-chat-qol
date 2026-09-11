/** Reuse the dedicated quick-settings surface in the onboarding chat. */
import { createMenuActionItem, createMenuToggleItem } from '../features/menus/common';
import { createSettingsPopup, handleSettingsMenuKeyDown } from '../features/menus/settings-popup';
import { PIP_ICON_PATH } from '../features/picture-in-picture/ui';
import { initUiLocaleFromDocument, t } from '../shared/i18n';
import { BOLT_ICON_PATH, MATERIAL_ICON_VIEW_BOX, SOUND_BELL_ICON_PATH, TRANSLATE_ICON_PATH, createChatEnhancerIcon } from '../shared/icons';
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
  trigger.replaceChildren(createChatEnhancerIcon());
  trigger.setAttribute('aria-label', t('chatEnhancer'));
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
  const menu = createSettingsPopup(items);
  menu.id = 'previewSettingsMenu';
  menu.classList.add('preview-settings-menu');
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
    if (opening) {
      positionMenu();
      items[0]?.focus();
    }
  });
  window.addEventListener('keydown', event => {
    // Tab from the PiP row continues to its explanatory link in this preview.
    if (!menu.hidden && event.key !== 'Tab') handleSettingsMenuKeyDown(event, menu, () => {
      close();
      trigger.focus();
    });
  }, { capture: true });
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
