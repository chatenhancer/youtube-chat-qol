import { t } from '../../shared/i18n';
import {
  CHAT_ENHANCER_ICON_PATH,
  CHAT_ENHANCER_ICON_VIEW_BOX,
  CHEVRON_BACKWARD_ICON_PATH,
  MATERIAL_ICON_VIEW_BOX,
  createChatEnhancerIcon,
  createChevronBackwardIcon
} from '../../shared/icons';
import { clampMenuToViewport, createMenuActionItem } from './common';

const OPEN_CLASS = 'ytcq-settings-submenu-open';
const PAGE_ANIMATION_ID = 'ytcq-settings-page';

/** Show a second page in the existing popup, keeping YouTube's own rows intact. */
export function appendSettingsSubmenu(menu: HTMLElement, items: HTMLElement[]): void {
  const list = menu.querySelector('#items');
  if (!list) return;
  const entry = createMenuActionItem({
    action: 'chat-enhancer',
    label: t('chatEnhancer'),
    iconPath: CHAT_ENHANCER_ICON_PATH,
    iconViewBox: CHAT_ENHANCER_ICON_VIEW_BOX,
    onClick: open
  });
  entry.querySelector('.ytcq-menu-icon')?.replaceChildren(createChatEnhancerIcon());
  entry.setAttribute('aria-haspopup', 'menu');
  entry.setAttribute('aria-expanded', 'false');
  const arrow = createChevronBackwardIcon();
  arrow.classList.add('ytcq-submenu-chevron');
  entry.querySelector('.ytcq-paper-item')!.append(arrow);
  const back = createMenuActionItem({
    action: 'settings-back',
    label: t('chatEnhancer'),
    title: t('back'),
    iconPath: CHEVRON_BACKWARD_ICON_PATH,
    iconViewBox: MATERIAL_ICON_VIEW_BOX,
    onClick: () => closeSettingsSubmenu(menu)
  });
  back.setAttribute('aria-label', t('back'));
  const rows = [back, ...items];
  for (const row of rows) {
    row.classList.add('ytcq-settings-submenu-item');
  }
  entry.addEventListener('keydown', (event) => {
    const rtl = getComputedStyle(menu).direction === 'rtl';
    if (event.key !== (rtl ? 'ArrowLeft' : 'ArrowRight')) return;
    event.preventDefault();
    event.stopPropagation();
    open();
  });
  list.append(entry, ...rows);

  function open(): void {
    switchSettingsPage(menu, true);
    clampMenuToViewport(menu);
    focusRow(items[0] || back);
  }
}

// Capture at the window before YouTube's document-level Escape handler closes
// the entire popup. Other keys and all native menu rows remain YouTube-owned.
export function handleSettingsSubmenuKeyDown(event: KeyboardEvent): void {
  const row = event.target instanceof Element
    ? event.target.closest<HTMLElement>('.ytcq-settings-submenu-item') : null;
  const menu = row?.closest<HTMLElement>(`.${OPEN_CLASS}`);
  if (!menu || !row) return;
  const rtl = getComputedStyle(menu).direction === 'rtl';
  if (event.key === 'Escape' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) {
    event.preventDefault();
    event.stopPropagation();
    closeSettingsSubmenu(menu);
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
    const rows = Array.from(menu.querySelectorAll<HTMLElement>('.ytcq-settings-submenu-item'));
    const index = rows.indexOf(row);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
    focusRow(rows[next]);
  }
}

function closeSettingsSubmenu(menu: HTMLElement): void {
  switchSettingsPage(menu, false);
  clampMenuToViewport(menu);
  const entry = menu.querySelector<HTMLElement>('[data-ytcq-action="chat-enhancer"]');
  if (entry) focusRow(entry);
}

/** A newly opened native menu must always start at its first page. */
export function resetSettingsSubmenus(root: ParentNode = document): void {
  const menus = root instanceof HTMLElement && root.classList.contains('ytcq-settings-expanded-menu')
    ? [root] : root.querySelectorAll<HTMLElement>('.ytcq-settings-expanded-menu');
  for (const menu of menus) {
    cancelPageAnimation(menu.querySelector('#items'));
    menu.classList.remove(OPEN_CLASS);
    menu.querySelector('[data-ytcq-action="chat-enhancer"]')?.setAttribute('aria-expanded', 'false');
  }
}

function switchSettingsPage(menu: HTMLElement, open: boolean): void {
  const list = menu.querySelector<HTMLElement>('#items');
  if (!list) return;
  const before = list.getBoundingClientRect();
  cancelPageAnimation(list);
  menu.classList.toggle(OPEN_CLASS, open);
  menu.querySelector('[data-ytcq-action="chat-enhancer"]')?.setAttribute('aria-expanded', String(open));
  if (!list.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const after = list.getBoundingClientRect();
  const direction = (getComputedStyle(menu).direction === 'rtl' ? -1 : 1) * (open ? 1 : -1);
  // New rows can exceed the interpolated height. Clip only while animating;
  // finishing or cancelling restores normal scrolling in shorter windows.
  const animation = list.animate([
    { width: `${before.width}px`, height: `${before.height}px`, transform: `translateX(${direction * 12}px)`, opacity: 0.45, overflow: 'hidden' },
    { width: `${after.width}px`, height: `${after.height}px`, transform: 'translateX(0)', opacity: 1, overflow: 'hidden' }
  ], { duration: 160, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
  animation.id = PAGE_ANIMATION_ID;
  animation.onfinish = () => {
    if (menu.isConnected) clampMenuToViewport(menu);
  };
}

function cancelPageAnimation(list: Element | null): void {
  for (const animation of list?.getAnimations?.() || []) {
    if (animation.id === PAGE_ANIMATION_ID) animation.cancel();
  }
}

function focusRow(row: HTMLElement): void {
  row.querySelector<HTMLElement>('.ytcq-paper-item')?.focus();
}
