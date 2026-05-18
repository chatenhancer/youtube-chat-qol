/**
 * Per-message action menu integration.
 *
 * Tracks which chat message opened YouTube's native context menu, then injects
 * Quote and Mention into that existing menu. The active-message bookkeeping
 * covers both clicking the message body and clicking YouTube's three-dot menu.
 */
import { CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import { replyToMessage } from '../reply';
import { closeMenu, createMenuActionItem } from './common';

let activeContextMessage: HTMLElement | null = null;
let activeContextMessageAt = 0;

export function wireMessageContext(message: HTMLElement): void {
  const menu = message.querySelector<HTMLElement>('#menu');
  if (!menu) {
    delete message.dataset.ytcqContextWired;
    return;
  }
  if (menu.dataset.ytcqContextWired === 'true') return;

  menu.dataset.ytcqContextWired = 'true';
  message.dataset.ytcqContextWired = 'true';

  const setActive = () => {
    setActiveContextMessage(message);
  };

  menu.addEventListener('pointerdown', setActive, true);
  menu.addEventListener('click', setActive, true);
  menu.addEventListener('keydown', setActive, true);
}

export function handleMessageMenuActivation(event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const message = target.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (message) setActiveContextMessage(message);
}

export function enhanceMessageContextMenu(menu: HTMLElement): void {
  const list = menu.querySelector('#items');
  if (!list) return;

  prepareContextMenu(menu);
  if (list.querySelector(':scope .ytcq-context-item')) {
    clampContextMenuVertically(menu);
    return;
  }

  list.append(
    createMenuActionItem({
      className: 'ytcq-context-item',
      label: 'Quote',
      iconPath: 'M7.2 6C5.45 7.45 4.5 9.34 4.5 11.55V18h6.4v-6.25H7.25c.08-1.33.62-2.42 1.63-3.28L7.2 6Zm9 0c-1.75 1.45-2.7 3.34-2.7 5.55V18h6.4v-6.25h-3.65c.08-1.33.62-2.42 1.63-3.28L16.2 6Z',
      onClick: () => {
        if (activeContextMessage?.isConnected) {
          replyToMessage(activeContextMessage, { quote: true });
          closeMenu();
        }
      }
    }),
    createMenuActionItem({
      className: 'ytcq-context-item',
      label: 'Mention',
      iconPath: 'M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-.6-5-3.4-10-11-11Z',
      onClick: () => {
        if (activeContextMessage?.isConnected) {
          replyToMessage(activeContextMessage, { quote: false });
          closeMenu();
        }
      }
    })
  );
  clampContextMenuVertically(menu);
}

export function isRecentActiveContextMessage(): boolean {
  if (!activeContextMessage?.isConnected) return false;
  return Date.now() - activeContextMessageAt < 2500;
}

function setActiveContextMessage(message: HTMLElement): void {
  activeContextMessage = message;
  activeContextMessageAt = Date.now();
}

function prepareContextMenu(menu: HTMLElement): void {
  const hadLegacyExpandedClass = menu.classList.contains('ytcq-expanded-menu');
  menu.classList.add('ytcq-context-expanded-menu');
  menu.classList.remove('ytcq-settings-expanded-menu', 'ytcq-expanded-menu');
  menu.style.setProperty('--ytcq-context-shift-y', '0px');

  if (hadLegacyExpandedClass) {
    menu.style.removeProperty('width');
    menu.style.removeProperty('min-width');
    menu.style.removeProperty('max-width');
  }
}

function clampContextMenuVertically(menu: HTMLElement): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      menu.style.setProperty('--ytcq-context-shift-y', '0px');

      const rect = menu.getBoundingClientRect();
      const bounds = getContextMenuVerticalBounds(menu);
      const overflowBottom = rect.bottom - bounds.bottom;
      const overflowTop = bounds.top - rect.top;

      if (overflowBottom > 0) {
        menu.style.setProperty('--ytcq-context-shift-y', `${-Math.ceil(overflowBottom)}px`);
      } else if (overflowTop > 0) {
        menu.style.setProperty('--ytcq-context-shift-y', `${Math.ceil(overflowTop)}px`);
      }
    });
  });
}

function getContextMenuVerticalBounds(menu: HTMLElement): { top: number; bottom: number } {
  const margin = 8;
  const bounds = {
    top: margin,
    bottom: window.innerHeight - margin
  };
  const app = menu.closest('yt-live-chat-app');

  if (app) {
    const rect = app.getBoundingClientRect();
    if (rect.height > 0) {
      bounds.top = Math.max(bounds.top, rect.top + margin);
      bounds.bottom = Math.min(bounds.bottom, rect.bottom - margin);
    }
  }

  return bounds;
}
