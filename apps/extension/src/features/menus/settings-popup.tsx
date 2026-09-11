/** The same compact menu surface and keyboard navigation in chat and onboarding. */
import { t } from '../../shared/i18n';
import { el, jsx } from '../../shared/jsx-dom';

export function createSettingsPopup(items: HTMLElement[]): HTMLDivElement {
  const menu = el<HTMLDivElement>(
    <div
      class="ytcq-settings-menu ytcq-live-chat-menu-size-repaired"
      role="menu"
      aria-label={t('chatEnhancer')}
    />
  );
  for (const item of items) {
    item.setAttribute('role', item.hasAttribute('aria-checked') ? 'menuitemcheckbox' : 'menuitem');
    item.removeAttribute('aria-selected');
    const content = item.querySelector('.ytcq-paper-item');
    content?.setAttribute('role', 'presentation');
    content?.removeAttribute('tabindex');
    content?.removeAttribute('aria-disabled');
  }
  menu.append(...items);
  return menu;
}

export function handleSettingsMenuKeyDown(
  event: KeyboardEvent,
  menu: HTMLElement,
  close: () => void
): void {
  if (!(event.target instanceof Node) || !menu.contains(event.target)) return;
  if (event.key === 'Escape' || event.key === 'Tab') {
    // Focus the trigger before Tab's default action moves to the next control.
    if (event.key === 'Escape') event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const rows = Array.from(menu.querySelectorAll<HTMLElement>('.ytcq-settings-item'));
  const index = rows.indexOf(document.activeElement as HTMLElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? rows.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
  rows[next]?.focus();
}
