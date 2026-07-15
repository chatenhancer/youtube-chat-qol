/**
 * Menu router.
 *
 * YouTube renders chat settings and message context actions with the same popup
 * renderer. This module classifies each popup after Polymer stamps its children
 * and routes it to the correct enhancer.
 */
import { registerFeature } from '../../content/feature-runtime';
import {
  cleanupStaleMessageMenuSurfaces,
  enhanceMessageContextMenu,
  isRecentActiveContextMessage
} from './message-menu';
import { cleanupStaleSettingsMenuSurfaces, enhanceSettingsMenu, refreshSettingsMenus } from './settings-menu';

const LIVE_CHAT_MENU_MARKER_SELECTOR = [
  'yt-live-chat-toggle-renderer',
  'ytd-menu-service-item-renderer',
  'ytd-menu-navigation-item-renderer',
  '.ytcq-settings-item',
  '.ytcq-context-item'
].join(',');
const LIVE_CHAT_MENU_SIZE_REPAIRED_CLASS = 'ytcq-live-chat-menu-size-repaired';

registerFeature({
  page: {
    boot: initMenus,
    cleanup: cleanupStaleMenuSurfaces,
    reset: refreshSettingsMenus
  },
  mutation: handleMenuMutations
});

function initMenus(): void {
  document.querySelectorAll('ytd-menu-popup-renderer').forEach(enhanceMenu);
}

export function enhanceMenu(menu: Element): void {
  if (!(menu instanceof HTMLElement)) return;
  window.setTimeout(() => {
    const repairedLiveChatMenu = repairLiveChatMenuSize(menu);
    if (isChatSettingsMenu(menu)) {
      enhanceSettingsMenu(menu);
    } else if (isMessageContextMenu(menu)) {
      enhanceMessageContextMenu(menu);
    }
    if (repairedLiveChatMenu) {
      clampLiveChatMenuHorizontallyAfterLayout(menu);
    }
  }, 0);
}

export function cleanupStaleMenuSurfaces(): void {
  cleanupStaleMessageMenuSurfaces();
  cleanupStaleSettingsMenuSurfaces();
}

function handleMenuMutations({ addedElements, mutations }: {
  addedElements: Element[];
  mutations: MutationRecord[];
}): void {
  mutations.forEach((mutation) => {
    const targetMenu = mutation.type === 'childList' && mutation.target instanceof Element
      ? mutation.target.closest('ytd-menu-popup-renderer')
      : null;
    if (targetMenu) enhanceMenu(targetMenu);
  });

  addedElements.forEach((element) => {
    if (element.matches('ytd-menu-popup-renderer')) {
      enhanceMenu(element);
    }

    const containingMenu = element.closest('ytd-menu-popup-renderer');
    if (containingMenu) {
      enhanceMenu(containingMenu);
    }

    element.querySelectorAll('ytd-menu-popup-renderer').forEach(enhanceMenu);
  });
}

function isChatSettingsMenu(menu: HTMLElement): boolean {
  return Boolean(
    menu.querySelector('#items') &&
    menu.querySelector('yt-live-chat-toggle-renderer')
  );
}

function isMessageContextMenu(menu: HTMLElement): boolean {
  return Boolean(
    isRecentActiveContextMessage() &&
    menu.querySelector('#items') &&
    !isChatSettingsMenu(menu) &&
    menu.querySelector('ytd-menu-service-item-renderer, ytd-menu-navigation-item-renderer')
  );
}

function repairLiveChatMenuSize(menu: HTMLElement): boolean {
  if (!menu.classList.contains('yt-live-chat-app') && !menu.closest('yt-live-chat-app')) return false;
  if (!menu.querySelector('#items')) return false;
  if (!menu.querySelector(LIVE_CHAT_MENU_MARKER_SELECTOR)) return false;

  menu.classList.add(LIVE_CHAT_MENU_SIZE_REPAIRED_CLASS);
  menu.style.removeProperty('width');
  menu.style.removeProperty('min-width');
  menu.style.removeProperty('max-width');
  return true;
}

function clampLiveChatMenuHorizontallyAfterLayout(menu: HTMLElement): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      clampLiveChatMenuHorizontally(menu);
    });
  });
}

function clampLiveChatMenuHorizontally(menu: HTMLElement): void {
  if (!menu.isConnected) return;
  if (!menu.classList.contains(LIVE_CHAT_MENU_SIZE_REPAIRED_CLASS)) return;

  const dropdown = getPositionedLiveChatMenuDropdown(menu);
  if (!dropdown) return;

  const rect = menu.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const bounds = getLiveChatMenuHorizontalBounds(menu);
  const overflowRight = rect.right - bounds.right;
  const overflowLeft = bounds.left - rect.left;

  let shift = 0;
  if (overflowRight > 0) {
    shift = -Math.ceil(overflowRight);
  } else if (overflowLeft > 0) {
    shift = Math.ceil(overflowLeft);
  }
  if (shift === 0) return;

  const dropdownRect = dropdown.getBoundingClientRect();
  if (dropdownRect.width <= 0 && dropdownRect.height <= 0) return;

  dropdown.style.left = `${dropdownRect.left + shift}px`;
  dropdown.style.right = 'auto';
}

function getPositionedLiveChatMenuDropdown(menu: HTMLElement): HTMLElement | null {
  const dropdown = menu.closest<HTMLElement>('tp-yt-iron-dropdown');
  if (!dropdown) return null;

  const position = dropdown.style.position || window.getComputedStyle(dropdown).position;
  return position === 'fixed' || position === 'absolute' ? dropdown : null;
}

function getLiveChatMenuHorizontalBounds(menu: HTMLElement): { left: number; right: number } {
  const margin = 8;
  const app = menu.closest<HTMLElement>('yt-live-chat-app');
  const appRect = app?.getBoundingClientRect();

  if (appRect && appRect.width > 0) {
    return {
      left: appRect.left + margin,
      right: appRect.right - margin
    };
  }

  return {
    left: margin,
    right: window.innerWidth - margin
  };
}
