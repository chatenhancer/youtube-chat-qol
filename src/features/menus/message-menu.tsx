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
import { closeMenu, createMenuActionItem } from './common';

let activeContextMessage: HTMLElement | null = null;
let activeContextMessageAt = 0;
let messageMenuActivationListeners = new AbortController();
let contextMenuWiringListeners = new AbortController();
let liteContextMenuListeners = new AbortController();
let liteContextMenu: HTMLElement | null = null;
let liteContextAnchor: HTMLButtonElement | null = null;

const LITE_CONTEXT_MENU_ID = 'ytcq-lite-context-menu';
const LITE_CONTEXT_MENU_MARGIN_PX = 8;
const LITE_CONTEXT_MENU_GAP_PX = 4;

type ContextMessageResolver = () => HTMLElement | null;
type LiteContextMenuPoint = { x: number; y: number };

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
      toggleLiteContextMenu(message, liteButton, event.detail === 0);
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
      toggleLiteContextMenu(message, liteButton, false, {
        x: event.clientX,
        y: event.clientY
      });
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
  if (list.querySelector(':scope .ytcq-context-item')) {
    clampContextMenuVertically(menu);
    return;
  }

  appendMessageContextActions(list, () => activeContextMessage);
  clampContextMenuVertically(menu);
}

export function isRecentActiveContextMessage(): boolean {
  if (!activeContextMessage?.isConnected) return false;
  return Date.now() - activeContextMessageAt < 2500;
}

export function cleanupStaleMessageMenuSurfaces(): void {
  closeLiteContextMenu();
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

function appendMessageContextActions(
  list: Element,
  resolveMessage: ContextMessageResolver,
  dismissMenu: () => void = closeMenu
): void {
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
        dismissMenu();
      }
    }),
    createReplyActionSplitItem(resolveMessage, dismissMenu)
  );
}

function createReplyActionSplitItem(
  resolveMessage: ContextMessageResolver,
  dismissMenu: () => void
): HTMLElement {
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
      onClick: () => handleReplyAction(resolveMessage, false, dismissMenu)
    }),
    createReplyActionDivider(),
    createReplyActionButton({
      action: 'quote',
      label: t('quote'),
      iconPath: QUOTE_ICON_PATH,
      onClick: () => handleReplyAction(resolveMessage, true, dismissMenu)
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

function handleReplyAction(
  resolveMessage: ContextMessageResolver,
  quote: boolean,
  dismissMenu: () => void
): void {
  const message = resolveMessage();
  if (!message?.isConnected) return;

  replyToMessage(message, { quote });
  dismissMenu();
}

function toggleLiteContextMenu(
  message: HTMLElement,
  anchor: HTMLButtonElement,
  focusFirstAction: boolean,
  activationPoint?: LiteContextMenuPoint
): void {
  if (liteContextMenu?.isConnected && liteContextAnchor === anchor) {
    closeLiteContextMenu();
    return;
  }

  closeLiteContextMenu();
  setActiveContextMessage(message);

  const items = el<HTMLDivElement>(<div id="items" />);
  const messageSnapshot = createLiteContextMessageSnapshot(message);
  const menu = el<HTMLDivElement>(
    <div
      id={LITE_CONTEXT_MENU_ID}
      class="ytcq-lite-context-menu ytcq-context-expanded-menu"
      role="menu"
      aria-label={`${t('save')} / ${t('mention')} / ${t('quote')}`}
    >
      {items}
    </div>
  );
  appendMessageContextActions(
    items,
    () => (message.isConnected ? message : messageSnapshot),
    () => closeLiteContextMenu()
  );
  menu.append(messageSnapshot);

  liteContextMenu = menu;
  liteContextAnchor = anchor;
  anchor.setAttribute('aria-controls', LITE_CONTEXT_MENU_ID);
  anchor.setAttribute('aria-expanded', 'true');
  menu.style.visibility = 'hidden';
  document.body.append(menu);
  positionLiteContextMenu(menu, anchor, activationPoint);
  menu.style.visibility = '';

  const signal = liteContextMenuListeners.signal;
  document.addEventListener('pointerdown', handleLiteContextPointerDown, {
    capture: true,
    signal
  });
  document.addEventListener('focusin', handleLiteContextFocusIn, {
    capture: true,
    signal
  });
  document.addEventListener('keydown', handleLiteContextKeyDown, {
    capture: true,
    signal
  });
  if (focusFirstAction) {
    getLiteContextFocusableItems(menu)[0]?.focus();
  }
}

function closeLiteContextMenu(restoreFocus = false): void {
  const anchor = liteContextAnchor;
  liteContextMenuListeners.abort();
  liteContextMenuListeners = new AbortController();
  liteContextMenu?.remove();
  liteContextMenu = null;
  liteContextAnchor = null;

  if (anchor) {
    anchor.setAttribute('aria-expanded', 'false');
    anchor.removeAttribute('aria-controls');
    if (restoreFocus && anchor.isConnected) anchor.focus();
  }
}

function handleLiteContextPointerDown(event: Event): void {
  const target = event.target instanceof Node ? event.target : null;
  if (!target || liteContextMenu?.contains(target) || liteContextAnchor?.contains(target)) return;
  closeLiteContextMenu();
}

function handleLiteContextFocusIn(event: FocusEvent): void {
  const target = event.target instanceof Node ? event.target : null;
  if (!target || liteContextMenu?.contains(target) || liteContextAnchor?.contains(target)) return;
  closeLiteContextMenu();
}

function handleLiteContextKeyDown(event: KeyboardEvent): void {
  const menu = liteContextMenu;
  if (!menu) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeLiteContextMenu(true);
    return;
  }

  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const focusableItems = getLiteContextFocusableItems(menu);
  if (!focusableItems.length) return;

  event.preventDefault();
  event.stopPropagation();
  const currentIndex = focusableItems.indexOf(document.activeElement as HTMLElement);
  let nextIndex = 0;
  if (event.key === 'End') {
    nextIndex = focusableItems.length - 1;
  } else if (event.key === 'ArrowUp') {
    nextIndex = currentIndex <= 0 ? focusableItems.length - 1 : currentIndex - 1;
  } else if (event.key === 'ArrowDown') {
    nextIndex = currentIndex >= focusableItems.length - 1 ? 0 : currentIndex + 1;
  }
  focusableItems[nextIndex]?.focus();
}

function getLiteContextFocusableItems(menu: HTMLElement): HTMLElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLElement>(
      '[data-ytcq-action="save-message"] .ytcq-paper-item, .ytcq-context-split-button'
    )
  );
}

function positionLiteContextMenu(
  menu: HTMLElement,
  anchor: HTMLElement,
  activationPoint?: LiteContextMenuPoint
): void {
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const viewportRight = window.innerWidth - LITE_CONTEXT_MENU_MARGIN_PX;
  const viewportBottom = window.innerHeight - LITE_CONTEXT_MENU_MARGIN_PX;
  const maxLeft = Math.max(LITE_CONTEXT_MENU_MARGIN_PX, viewportRight - menuRect.width);
  if (activationPoint) {
    const rightOfClick = activationPoint.x + LITE_CONTEXT_MENU_GAP_PX;
    const leftOfClick = activationPoint.x - LITE_CONTEXT_MENU_GAP_PX - menuRect.width;
    const belowClick = activationPoint.y + LITE_CONTEXT_MENU_GAP_PX;
    const aboveClick = activationPoint.y - LITE_CONTEXT_MENU_GAP_PX - menuRect.height;
    const left = rightOfClick + menuRect.width <= viewportRight ? rightOfClick : leftOfClick;
    const top = belowClick + menuRect.height <= viewportBottom ? belowClick : aboveClick;

    menu.style.left = `${Math.round(Math.min(Math.max(LITE_CONTEXT_MENU_MARGIN_PX, left), maxLeft))}px`;
    menu.style.top = `${Math.round(
      Math.min(
        Math.max(LITE_CONTEXT_MENU_MARGIN_PX, top),
        Math.max(LITE_CONTEXT_MENU_MARGIN_PX, viewportBottom - menuRect.height)
      )
    )}px`;
    return;
  }

  const left = Math.min(
    Math.max(LITE_CONTEXT_MENU_MARGIN_PX, anchorRect.right - menuRect.width),
    maxLeft
  );
  const below = anchorRect.bottom + LITE_CONTEXT_MENU_GAP_PX;
  const above = anchorRect.top - LITE_CONTEXT_MENU_GAP_PX - menuRect.height;
  const top =
    below + menuRect.height <= viewportBottom
      ? below
      : Math.max(LITE_CONTEXT_MENU_MARGIN_PX, above);

  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
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
