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
import { jsx, el } from '../../shared/jsx-dom';
import { getChatBookmarkTitle, isChatBookmarked, toggleChatBookmark } from '../bookmarks';
import { replyToMessage } from '../reply';
import { registerFeature } from '../../content/dispatcher';
import {
  requestYouTubeChatContextMenu,
  type YouTubeChatContextMenuStatus
} from '../../youtube/chat-feed/context-menu';
import { closeMenu, createMenuActionItem } from './common';

let activeContextMessage: HTMLElement | null = null;
let activeContextMessageSnapshot: HTMLElement | null = null;
let activeContextMessageAt = 0;
let messageMenuActivationListeners = new AbortController();
let contextMenuWiringListeners = new AbortController();
let nativeLiteContextMenuCleanup: (() => void) | null = null;
let nativeLiteContextAnchor: HTMLButtonElement | null = null;

type ContextMessageResolver = () => HTMLElement | null;

registerFeature({
  page: { init: initMessageMenuActivation },
  message: wireMessageContext
});

function initMessageMenuActivation(): void {
  const options = { capture: true, signal: messageMenuActivationListeners.signal };
  document.addEventListener('pointerdown', handleMessageMenuActivation, options);
  document.addEventListener('click', handleMessageMenuActivation, options);
  document.addEventListener('keydown', handleMessageMenuActivation, options);
}

export function wireMessageContext(message: HTMLElement): void {
  // Chat renderers repeat this YouTube-owned ID, so avoid an ID-selector
  // optimization that can escape the renderer scope in some DOM engines.
  const menu = message.querySelector<HTMLElement>('[id="menu"]');
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

  const liteButton = menu.querySelector<HTMLButtonElement>('.ytcq-lite-message-menu-button');
  if (!liteButton) return;

  liteButton.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      setActive();
      openLiteContextMenu(message, liteButton);
    },
    { signal: contextMenuWiringListeners.signal }
  );
  message.addEventListener(
    'click',
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        !target ||
        isInteractiveLiteMessageTarget(target) ||
        hasSelectedLiteMessageText(message)
      ) {
        return;
      }

      setActive();
      openLiteContextMenu(message, liteButton);
    },
    { signal: contextMenuWiringListeners.signal }
  );
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
  if (activeContextMessageSnapshot) menu.append(activeContextMessageSnapshot);
  if (list.querySelector(':scope .ytcq-context-item')) {
    clampContextMenuVertically(menu);
    return;
  }

  appendMessageContextActions(list, resolveActiveContextMessage);
  clampContextMenuVertically(menu);
}

export function isRecentActiveContextMessage(): boolean {
  if (!activeContextMessage?.isConnected && !activeContextMessageSnapshot) return false;
  return Date.now() - activeContextMessageAt < 2500;
}

export function cleanupStaleMessageMenuSurfaces(): void {
  closeNativeLiteContextMenuState();
  messageMenuActivationListeners.abort();
  messageMenuActivationListeners = new AbortController();
  contextMenuWiringListeners.abort();
  contextMenuWiringListeners = new AbortController();
  activeContextMessage = null;
  activeContextMessageSnapshot?.remove();
  activeContextMessageSnapshot = null;
  activeContextMessageAt = 0;
  document.querySelectorAll('.ytcq-context-item').forEach((item) => item.remove());
  document.querySelectorAll('[data-ytcq-context-wired]').forEach((element) => {
    element.removeAttribute('data-ytcq-context-wired');
  });
}

function setActiveContextMessage(message: HTMLElement, keepSnapshot = false): void {
  activeContextMessageSnapshot?.remove();
  activeContextMessageSnapshot = keepSnapshot ? createLiteContextMessageSnapshot(message) : null;
  activeContextMessage = message;
  activeContextMessageAt = Date.now();
}

function resolveActiveContextMessage(): HTMLElement | null {
  return activeContextMessage?.isConnected
    ? activeContextMessage
    : activeContextMessageSnapshot?.isConnected
      ? activeContextMessageSnapshot
      : null;
}

function appendMessageContextActions(list: Element, resolveMessage: ContextMessageResolver): void {
  const message = resolveMessage();
  const saved = Boolean(message && isChatBookmarked(message));
  const saveLabel = saved ? t('remove') : t('save');
  const saveTitle = message ? getChatBookmarkTitle(message) : t('saveMessage');

  list.append(
    createMenuActionItem({
      className: 'ytcq-context-item',
      action: 'save-message',
      label: saveLabel,
      title: saveTitle,
      iconPath: saved ? BOOKMARK_FILLED_ICON_PATH : BOOKMARK_ICON_PATH,
      iconViewBox: MATERIAL_ICON_VIEW_BOX,
      onClick: () => {
        const target = resolveMessage();
        if (!target?.isConnected) return;

        void toggleChatBookmark(target);
        closeMenu();
      }
    }),
    createReplyActionSplitItem(resolveMessage)
  );
}

function createReplyActionSplitItem(resolveMessage: ContextMessageResolver): HTMLElement {
  const row = el<HTMLDivElement>(
    <div
      class="ytcq-paper-item ytcq-context-split-row"
      role="group"
      aria-label={`${t('mention')} / ${t('quote')}`}
    />
  );

  row.append(
    createReplyActionButton({
      action: 'mention',
      label: t('mention'),
      iconPath: MENTION_ICON_PATH,
      iconViewBox: MATERIAL_ICON_VIEW_BOX,
      onClick: () => handleReplyAction(resolveMessage, false)
    }),
    createReplyActionDivider(),
    createReplyActionButton({
      action: 'quote',
      label: t('quote'),
      iconPath: QUOTE_ICON_PATH,
      onClick: () => handleReplyAction(resolveMessage, true)
    })
  );

  return el<HTMLDivElement>(
    <div
      class="style-scope ytd-menu-popup-renderer ytcq-context-item ytcq-context-split-item"
      system-icons
      role="menuitem"
      use-icons
      tabIndex={-1}
      aria-selected="false"
      data-ytcq-action="reply-actions"
    >
      {row}
    </div>
  );
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
  const handleActivation = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };
  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-context-split-button"
      data-ytcq-action={action}
      aria-label={label}
      title={label}
      onClick={handleActivation}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        handleActivation(event);
      }}
    >
      <span class="ytcq-menu-icon">{createSvgIcon(iconViewBox || '0 0 24 24', iconPath)}</span>
    </button>
  );
  return button;
}

function createReplyActionDivider(): HTMLElement {
  return el<HTMLSpanElement>(<span class="ytcq-context-split-divider" aria-hidden="true" />);
}

function handleReplyAction(resolveMessage: ContextMessageResolver, quote: boolean): void {
  const message = resolveMessage();
  if (!message?.isConnected) return;

  replyToMessage(message, { quote });
  closeMenu();
}

function openLiteContextMenu(message: HTMLElement, anchor: HTMLButtonElement): void {
  closeNativeLiteContextMenuState();
  const messageId = message.dataset.messageId;
  if (!messageId) return;

  const point = getLiteContextMenuAnchorPoint(anchor);
  const stopListening = requestYouTubeChatContextMenu(messageId, point, (status) => {
    if (status === 'opening') setActiveContextMessage(message, true);
    handleNativeLiteContextMenuStatus(status, anchor);
  });

  if (stopListening) {
    nativeLiteContextMenuCleanup = stopListening;
    nativeLiteContextAnchor = anchor;
  }
}

function handleNativeLiteContextMenuStatus(
  status: YouTubeChatContextMenuStatus,
  anchor: HTMLButtonElement
): void {
  if (status === 'opening' || status === 'opened') {
    activeContextMessageAt = Date.now();
    anchor.setAttribute('aria-expanded', 'true');
    return;
  }

  anchor.setAttribute('aria-expanded', 'false');
  activeContextMessageSnapshot?.remove();
  activeContextMessageSnapshot = null;
  if (nativeLiteContextAnchor === anchor) {
    nativeLiteContextMenuCleanup = null;
    nativeLiteContextAnchor = null;
  }
}

function closeNativeLiteContextMenuState(): void {
  nativeLiteContextMenuCleanup?.();
  nativeLiteContextMenuCleanup = null;
  if (nativeLiteContextAnchor) {
    nativeLiteContextAnchor.setAttribute('aria-expanded', 'false');
  }
  nativeLiteContextAnchor = null;
}

function getLiteContextMenuAnchorPoint(anchor: HTMLElement): { x: number; y: number } {
  const rect = anchor.getBoundingClientRect();
  return {
    x: rect.right || rect.left,
    y: rect.bottom || rect.top
  };
}

function createLiteContextMessageSnapshot(message: HTMLElement): HTMLElement {
  const snapshot = message.cloneNode(true) as HTMLElement;
  snapshot.className = 'ytcq-lite-context-message-snapshot';
  snapshot.hidden = true;
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.removeAttribute('data-ytcq-context-wired');
  snapshot.querySelector('[id="menu"]')?.remove();
  snapshot.querySelectorAll('[data-ytcq-context-wired]').forEach((element) => {
    element.removeAttribute('data-ytcq-context-wired');
  });
  return snapshot;
}

function isInteractiveLiteMessageTarget(target: Element): boolean {
  return Boolean(
    target.closest('a, button, input, select, textarea, [contenteditable="true"], [role="button"]')
  );
}

function hasSelectedLiteMessageText(message: HTMLElement): boolean {
  const selection = window.getSelection();
  return Boolean(
    selection &&
    !selection.isCollapsed &&
    selection.anchorNode &&
    message.contains(selection.anchorNode)
  );
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
