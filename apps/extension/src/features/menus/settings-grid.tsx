/** Shared quick controls inside the native chat menu and onboarding preview. */
import { t } from '../../shared/i18n';
import { el, jsx } from '../../shared/jsx-dom';

export function createSettingsGrid(items: HTMLElement[]): HTMLElement {
  const grid = el<HTMLElement>(
    <div class="ytcq-settings-grid" role="group" aria-label={t('chatEnhancer')} />
  );
  // YouTube's listbox focuses direct children. Forward entry into the group.
  grid.tabIndex = -1;
  grid.addEventListener('focus', () => items[0]?.focus());
  for (const item of items) {
    item.setAttribute('role', item.hasAttribute('aria-checked') ? 'menuitemcheckbox' : 'menuitem');
    item.removeAttribute('aria-selected');
    if (item.hasAttribute('aria-checked')) {
      setSettingsToggleChecked(item, item.getAttribute('aria-checked') === 'true');
    }
    item.title ||= item.querySelector('.ytcq-menu-label')?.textContent || '';
    const content = item.querySelector('.ytcq-paper-item');
    content?.setAttribute('role', 'presentation');
    content?.removeAttribute('tabindex');
    content?.removeAttribute('aria-disabled');
    item.querySelector('.ytcq-menu-toggle')?.remove();
  }
  grid.append(...items);
  grid.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
      return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rtl = getComputedStyle(grid).direction === 'rtl';
    const step =
      event.key === 'ArrowDown'
        ? 2
        : event.key === 'ArrowUp'
          ? -2
          : (event.key === 'ArrowRight' ? 1 : -1) * (rtl ? -1 : 1);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : index + step;
    if (next < 0 && event.key === 'ArrowUp') {
      focusNativeItem(grid.previousElementSibling);
    } else if (next >= items.length && event.key === 'ArrowDown') {
      focusNativeItem(grid.parentElement?.firstElementChild);
    } else {
      items[(next + items.length) % items.length]?.focus();
    }
  });
  return grid;
}

export function setSettingsToggleChecked(item: HTMLElement, checked: boolean): void {
  item.setAttribute('aria-checked', String(checked));
  const setting = item.getAttribute('data-ytcq-setting');
  if (setting === 'targetLanguage') {
    item.title = t(checked ? 'disableChatTranslation' : 'enableChatTranslation');
  } else if (setting === 'sound') {
    item.title = t(checked ? 'disableAlertSounds' : 'enableAlertSounds');
  } else if (setting === 'liteModeEnabled') {
    item.title = t(checked ? 'disableLiteMode' : 'enableLiteMode');
  }
}

/** Native listboxes can cache their original items and skip appended controls. */
export function handleSettingsGridBoundaryKeyDown(event: KeyboardEvent): void {
  if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !(event.target instanceof Element)) return;
  if (event.target.closest('.ytcq-settings-grid')) return;
  const menu = event.target.closest('ytd-menu-popup-renderer');
  const grid = menu?.querySelector<HTMLElement>('.ytcq-settings-grid');
  const nativeItems = grid?.parentElement?.children;
  if (!grid || !nativeItems) return;
  const first = nativeItems[0];
  const last = grid.previousElementSibling;
  const entering = event.key === 'ArrowDown' && last?.contains(event.target);
  const wrapping = event.key === 'ArrowUp' && first?.contains(event.target);
  if (!entering && !wrapping) return;
  event.preventDefault();
  event.stopPropagation();
  const items = grid.querySelectorAll<HTMLElement>('.ytcq-settings-item');
  items[entering ? 0 : items.length - 1]?.focus();
}

function focusNativeItem(item: Element | null | undefined): void {
  if (!(item instanceof HTMLElement)) return;
  (item.querySelector<HTMLElement>('[tabindex="0"]') || item).focus();
}
