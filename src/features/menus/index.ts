/**
 * Menu router.
 *
 * YouTube renders chat settings and message context actions with the same popup
 * renderer. This module classifies each popup after Polymer stamps its children
 * and routes it to the correct enhancer.
 */
import { enhanceMessageContextMenu, isRecentActiveContextMessage } from './message-menu';
import { enhanceSettingsMenu } from './settings-menu';

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
