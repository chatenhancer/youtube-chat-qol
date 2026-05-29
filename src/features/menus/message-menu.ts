/**
 * Per-message action menu integration.
 *
 * Tracks which chat message opened YouTube's native context menu, then injects
 * Quote and Mention into that existing menu. The active-message bookkeeping
 * covers both clicking the message body and clicking YouTube's three-dot menu.
 */
import { CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import { t } from '../../shared/i18n';
import {
  MATERIAL_ICON_VIEW_BOX,
  MENTION_ICON_PATH,
  QUOTE_ICON_PATH
} from '../../shared/icons';
import { replyToMessage } from '../reply';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { closeMenu, createMenuActionItem } from './common';

let activeContextMessage: HTMLElement | null = null;
let activeContextMessageAt = 0;

registerFeatureLifecycle({
  page: { init: initMessageMenuActivation },
  message: { enhance: wireMessageContext }
});

function initMessageMenuActivation(): void {
  document.addEventListener('pointerdown', handleMessageMenuActivation, true);
  document.addEventListener('click', handleMessageMenuActivation, true);
  document.addEventListener('keydown', handleMessageMenuActivation, true);
}

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
      label: t('quote'),
      iconPath: QUOTE_ICON_PATH,
      onClick: () => {
        if (activeContextMessage?.isConnected) {
          replyToMessage(activeContextMessage, { quote: true });
          closeMenu();
        }
      }
    }),
    createMenuActionItem({
      className: 'ytcq-context-item',
      label: t('mention'),
      iconPath: MENTION_ICON_PATH,
      iconViewBox: MATERIAL_ICON_VIEW_BOX,
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

export function cleanupStaleMessageMenuSurfaces(): void {
  activeContextMessage = null;
  activeContextMessageAt = 0;
  document.querySelectorAll('.ytcq-context-item').forEach((item) => item.remove());
  document.querySelectorAll('[data-ytcq-context-wired]').forEach((element) => {
    element.removeAttribute('data-ytcq-context-wired');
  });
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
