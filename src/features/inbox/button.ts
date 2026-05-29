/**
 * Inbox header button.
 *
 * Wires the compact Inbox entry point into YouTube's live chat header and keeps
 * its unread icon, badge, and aria label in sync.
 */
import { t } from '../../shared/i18n';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { createInboxIcon, formatBadgeCount, setInboxIcon } from './icons';

const HEADER_SELECTOR = 'yt-live-chat-header-renderer';
const INBOX_BUTTON_OWNER_ID = `${Date.now()}-${Math.random()}`;

export interface InboxButtonOptions {
  getUnreadCount: () => number;
  onToggle: (anchor: HTMLElement) => void;
}

let inboxWireTimer: number | null = null;

export function scheduleInboxButtonWire(options: InboxButtonOptions): void {
  if (inboxWireTimer !== null) return;

  inboxWireTimer = window.setTimeout(() => {
    inboxWireTimer = null;
    wireInboxButton(options);
  }, 0);
}

export function wireInboxButton(options: InboxButtonOptions): void {
  const header = document.querySelector<HTMLElement>(HEADER_SELECTOR);
  if (!header) return;

  const anchor = getInboxHeaderAnchor(header);
  const existing = header.querySelector<HTMLButtonElement>('.ytcq-inbox-button');
  if (existing?.dataset.ytcqInboxOwner === INBOX_BUTTON_OWNER_ID) {
    moveInboxButton(existing, header, anchor);
    refreshInboxButton(existing, options.getUnreadCount());
    return;
  }

  existing?.remove();
  const button = createInboxButton(options);
  moveInboxButton(button, header, anchor);
  refreshInboxButton(button, options.getUnreadCount());
}

function createInboxButton(options: InboxButtonOptions): HTMLButtonElement {
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-inbox-button';
  button.dataset.ytcqInboxOwner = INBOX_BUTTON_OWNER_ID;
  button.title = t('inbox');
  button.setAttribute('aria-label', getInboxAriaLabel(options.getUnreadCount()));
  button.append(createInboxIcon(), createInboxBadge());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onToggle(button);
  }, true);
  return button;
}

export function refreshInboxSurfaces(getUnreadCount: () => number): void {
  document.querySelectorAll<HTMLButtonElement>('.ytcq-inbox-button')
    .forEach((button) => refreshInboxButton(button, getUnreadCount()));
}

export function cleanupStaleInboxButtons(): void {
  document.querySelectorAll<HTMLButtonElement>('.ytcq-inbox-button').forEach((button) => button.remove());
}

function refreshInboxButton(button: HTMLButtonElement, unread: number): void {
  const badge = button.querySelector<HTMLElement>('.ytcq-inbox-badge');
  const ariaLabel = getInboxAriaLabel(unread);
  const hasUnread = unread > 0;

  if (button.getAttribute('aria-label') !== ariaLabel) {
    button.setAttribute('aria-label', ariaLabel);
  }
  if (button.classList.contains('ytcq-inbox-button-has-unread') !== hasUnread) {
    button.classList.toggle('ytcq-inbox-button-has-unread', hasUnread);
  }
  setInboxIcon(button, hasUnread);

  if (!badge) return;
  const nextBadgeText = formatBadgeCount(unread);
  if (badge.textContent !== nextBadgeText) {
    badge.textContent = nextBadgeText;
  }
  if (badge.hidden === hasUnread) {
    badge.hidden = !hasUnread;
  }
}

function getInboxAriaLabel(unread: number): string {
  return unread ? t('inboxAriaUnread', { count: unread }) : t('inbox');
}

function createInboxBadge(): HTMLSpanElement {
  const badge = ytcqCreateElement('span');
  badge.className = 'ytcq-inbox-badge';
  badge.hidden = true;
  return badge;
}

function getInboxHeaderAnchor(header: HTMLElement): HTMLElement | null {
  return header.querySelector<HTMLElement>('#live-chat-header-context-menu') ||
    getDirectHeaderChild(header, header.querySelector<HTMLElement>('button[aria-label="More options"]')) ||
    getDirectHeaderChild(header, header.querySelector<HTMLElement>('button[title="More options"]')) ||
    header.querySelector<HTMLElement>('#close-button');
}

function getDirectHeaderChild(header: HTMLElement, element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;

  let current: HTMLElement | null = element;
  while (current && current.parentElement !== header) {
    current = current.parentElement;
  }

  return current;
}

function moveInboxButton(button: HTMLButtonElement, header: HTMLElement, anchor: HTMLElement | null): void {
  if (anchor && anchor !== button && button.nextElementSibling !== anchor) {
    anchor.before(button);
  } else if (!anchor && button.parentElement !== header) {
    header.append(button);
  }
}
