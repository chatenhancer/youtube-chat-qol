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
  BOOKMARK_FILLED_ICON_PATH,
  BOOKMARK_ICON_PATH,
  createSvgIcon,
  MATERIAL_ICON_VIEW_BOX,
  MENTION_ICON_PATH,
  QUOTE_ICON_PATH
} from '../../shared/icons';
import { ytcqCreateElement } from '../../shared/managed-dom';
import {
  getMessageAuthorMarkTitle,
  isMessageAuthorMarked,
  toggleMessageAuthorMark
} from '../marked-users';
import { replyToMessage } from '../reply';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { closeMenu, createMenuActionItem } from './common';

let activeContextMessage: HTMLElement | null = null;
let activeContextMessageAt = 0;
let messageMenuActivationListeners = new AbortController();
let contextMenuWiringListeners = new AbortController();

registerFeatureLifecycle({
  page: { init: initMessageMenuActivation },
  message: { enhance: wireMessageContext }
});

function initMessageMenuActivation(): void {
  const options = { capture: true, signal: messageMenuActivationListeners.signal };
  document.addEventListener('pointerdown', handleMessageMenuActivation, options);
  document.addEventListener('click', handleMessageMenuActivation, options);
  document.addEventListener('keydown', handleMessageMenuActivation, options);
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

  const options = { capture: true, signal: contextMenuWiringListeners.signal };
  menu.addEventListener('pointerdown', setActive, options);
  menu.addEventListener('click', setActive, options);
  menu.addEventListener('keydown', setActive, options);
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

  const markedUser = Boolean(activeContextMessage && isMessageAuthorMarked(activeContextMessage));
  const markUserLabel = markedUser ? t('unmarkUser') : t('markUser');
  const markUserTitle = activeContextMessage ? getMessageAuthorMarkTitle(activeContextMessage) : markUserLabel;

  list.append(
    createMenuActionItem({
      className: 'ytcq-context-item',
      action: 'mark-user',
      label: markUserLabel,
      title: markUserTitle,
      iconPath: markedUser ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH,
      iconViewBox: MATERIAL_ICON_VIEW_BOX,
      onClick: () => {
        if (activeContextMessage?.isConnected) {
          void toggleMessageAuthorMark(activeContextMessage);
          closeMenu();
        }
      }
    }),
    createReplyActionSplitItem()
  );
  clampContextMenuVertically(menu);
}

export function isRecentActiveContextMessage(): boolean {
  if (!activeContextMessage?.isConnected) return false;
  return Date.now() - activeContextMessageAt < 2500;
}

export function cleanupStaleMessageMenuSurfaces(): void {
  messageMenuActivationListeners.abort();
  messageMenuActivationListeners = new AbortController();
  contextMenuWiringListeners.abort();
  contextMenuWiringListeners = new AbortController();
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

function createReplyActionSplitItem(): HTMLElement {
  const item = ytcqCreateElement('div');
  item.className = 'style-scope ytd-menu-popup-renderer ytcq-context-item ytcq-context-split-item';
  item.setAttribute('system-icons', '');
  item.setAttribute('role', 'menuitem');
  item.setAttribute('use-icons', '');
  item.setAttribute('tabindex', '-1');
  item.setAttribute('aria-selected', 'false');
  item.setAttribute('data-ytcq-action', 'reply-actions');

  const row = ytcqCreateElement('div');
  row.className = 'ytcq-paper-item ytcq-context-split-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', `${t('mention')} / ${t('quote')}`);

  row.append(
    createReplyActionButton({
      action: 'mention',
      label: t('mention'),
      iconPath: MENTION_ICON_PATH,
      iconViewBox: MATERIAL_ICON_VIEW_BOX,
      onClick: () => handleReplyAction(false)
    }),
    createReplyActionDivider(),
    createReplyActionButton({
      action: 'quote',
      label: t('quote'),
      iconPath: QUOTE_ICON_PATH,
      onClick: () => handleReplyAction(true)
    })
  );

  item.append(row);
  return item;
}

function createReplyActionButton({
  action,
  label,
  iconPath,
  iconViewBox,
  onClick
}: {
  action: string;
  label: string;
  iconPath: string;
  iconViewBox?: string;
  onClick: () => void;
}): HTMLButtonElement {
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-context-split-button';
  button.setAttribute('data-ytcq-action', action);
  button.setAttribute('aria-label', label);
  button.title = label;

  const icon = ytcqCreateElement('span');
  icon.className = 'ytcq-menu-icon';
  icon.append(createSvgIcon(iconViewBox || '0 0 24 24', iconPath));

  button.append(icon);
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function createReplyActionDivider(): HTMLElement {
  const divider = ytcqCreateElement('span');
  divider.className = 'ytcq-context-split-divider';
  divider.setAttribute('aria-hidden', 'true');
  return divider;
}

function handleReplyAction(quote: boolean): void {
  if (!activeContextMessage?.isConnected) return;

  replyToMessage(activeContextMessage, { quote });
  closeMenu();
}

function prepareContextMenu(menu: HTMLElement): void {
  menu.classList.add('ytcq-context-expanded-menu');
  menu.classList.remove('ytcq-settings-expanded-menu');
  menu.style.setProperty('--ytcq-context-shift-y', '0px');
  menu.style.removeProperty('width');
  menu.style.removeProperty('min-width');
  menu.style.removeProperty('max-width');
}

function clampContextMenuVertically(menu: HTMLElement): void {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      menu.style.setProperty('--ytcq-context-shift-y', '0px');

      const rect = getContextMenuContentRect(menu);
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

function getContextMenuContentRect(menu: HTMLElement): Pick<DOMRect, 'top' | 'bottom'> {
  const menuRect = menu.getBoundingClientRect();
  const list = menu.querySelector<HTMLElement>('#items');
  if (!list) return menuRect;

  const childRects = Array.from(list.children)
    .map((child) => child.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (!childRects.length) return menuRect;

  return {
    top: Math.min(menuRect.top, ...childRects.map((rect) => rect.top)),
    bottom: Math.max(menuRect.bottom, ...childRects.map((rect) => rect.bottom))
  };
}
