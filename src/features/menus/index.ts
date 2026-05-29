/**
 * Menu router.
 *
 * YouTube renders chat settings and message context actions with the same popup
 * renderer. This module classifies each popup after Polymer stamps its children
 * and routes it to the correct enhancer.
 */
import { registerFeatureLifecycle } from '../../content/lifecycle';
import {
  cleanupStaleMessageMenuSurfaces,
  enhanceMessageContextMenu,
  isRecentActiveContextMessage
} from './message-menu';
import { cleanupStaleSettingsMenuSurfaces, enhanceSettingsMenu, refreshSettingsMenus } from './settings-menu';

registerFeatureLifecycle({
  page: {
    boot: initMenus,
    cleanupStale: cleanupStaleMenuSurfaces,
    reset: refreshSettingsMenus
  },
  mutation: { enhance: handleMenuMutations }
});

function initMenus(): void {
  document.querySelectorAll('ytd-menu-popup-renderer').forEach(enhanceMenu);
}

export function enhanceMenu(menu: Element): void {
  if (!(menu instanceof HTMLElement)) return;
  window.setTimeout(() => {
    if (isChatSettingsMenu(menu)) {
      enhanceSettingsMenu(menu);
    } else if (isMessageContextMenu(menu)) {
      enhanceMessageContextMenu(menu);
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
