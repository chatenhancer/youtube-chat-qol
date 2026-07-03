/**
 * Shared menu item builders.
 *
 * These helpers create lightweight DOM that visually follows YouTube's menu
 * structure without depending on private Polymer constructors. Settings-menu
 * and per-message action modules both use this path.
 */
import { createSvgIcon } from '../../shared/icons';
import { ytcqCreateElement } from '../../shared/managed-dom';

interface MenuActionItemOptions {
  className?: string;
  action?: string;
  setting?: string;
  label: string;
  iconPath: string;
  iconViewBox?: string;
  title?: string;
  onClick: () => void;
}

interface PaperItemOptions {
  label: string;
  iconPath: string;
  iconViewBox?: string;
  title?: string;
}

export function createMenuActionItem({
  className = 'ytcq-settings-item',
  action = '',
  setting = '',
  label,
  iconPath,
  iconViewBox,
  title,
  onClick
}: MenuActionItemOptions): HTMLElement {
  const item = ytcqCreateElement('div');
  item.className = `style-scope ytd-menu-popup-renderer ${className}`;
  item.setAttribute('system-icons', '');
  item.setAttribute('role', 'menuitem');
  item.setAttribute('use-icons', '');
  item.setAttribute('tabindex', '-1');
  item.setAttribute('aria-selected', 'false');
  if (action) item.setAttribute('data-ytcq-action', action);
  if (setting) item.setAttribute('data-ytcq-setting', setting);
  if (title) item.title = title;
  item.appendChild(createPaperItem({ label, iconPath, iconViewBox, title }));
  wireMenuItemClick(item, onClick);
  return item;
}

export function createMenuToggleItem({
  setting,
  label,
  checked,
  iconPath,
  iconViewBox,
  onClick
}: {
  setting: string;
  label: string;
  checked: boolean;
  iconPath: string;
  iconViewBox?: string;
  onClick: () => void;
}): HTMLElement {
  const item = createMenuActionItem({
    className: 'ytcq-settings-item ytcq-toggle-item',
    setting,
    label,
    iconPath,
    iconViewBox,
    onClick
  });
  item.setAttribute('aria-checked', String(Boolean(checked)));
  const toggle = ytcqCreateElement('span');
  toggle.className = 'ytcq-menu-toggle';
  toggle.setAttribute('aria-hidden', 'true');
  item.querySelector('.ytcq-paper-item')?.appendChild(toggle);
  return item;
}

function createPaperItem({ label, iconPath, iconViewBox, title }: PaperItemOptions): HTMLElement {
  const paperItem = ytcqCreateElement('div');
  paperItem.className = 'ytcq-paper-item';
  paperItem.setAttribute('role', 'option');
  paperItem.setAttribute('tabindex', '0');
  paperItem.setAttribute('aria-disabled', 'false');
  if (title) paperItem.title = title;

  const icon = ytcqCreateElement('span');
  icon.className = 'ytcq-menu-icon';
  icon.appendChild(createSvgIcon(iconViewBox || '0 0 24 24', iconPath));

  const text = ytcqCreateElement('span');
  text.className = 'ytcq-menu-label';
  text.textContent = label;

  paperItem.append(icon, text);
  return paperItem;
}

export function closeMenu(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    keyCode: 27,
    bubbles: true,
    cancelable: true
  }));
}

export function clampMenuToViewport(menu: HTMLElement): void {
  window.requestAnimationFrame(() => {
    menu.style.setProperty('--ytcq-context-shift-y', '0px');

    const rect = menu.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - 8);
    const overflowLeft = 8 - rect.left;
    const overflowBottom = rect.bottom - (window.innerHeight - 8);
    const overflowTop = 8 - rect.top;

    if (overflowRight > 0) {
      menu.style.left = `${Math.max(8, rect.left - overflowRight)}px`;
      menu.style.right = 'auto';
    } else if (overflowLeft > 0) {
      menu.style.left = `${rect.left + overflowLeft}px`;
      menu.style.right = 'auto';
    }

    if (overflowBottom > 0) {
      menu.style.setProperty('--ytcq-context-shift-y', `${-Math.ceil(overflowBottom)}px`);
    } else if (overflowTop > 0) {
      menu.style.setProperty('--ytcq-context-shift-y', `${Math.ceil(overflowTop)}px`);
    }
  });
}

function wireMenuItemClick(item: HTMLElement, onClick: () => void): void {
  const handler = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };
  item.addEventListener('click', handler);
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handler(event);
    }
  });
}
