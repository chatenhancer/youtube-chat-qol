/**
 * Mentions inbox.
 *
 * Keeps a small local list of messages that mention the signed-in chat handle.
 * The primary entry point is a compact @ button in YouTube's chat header.
 */
import { cleanText } from '../shared/text';
import { createEmptyLeavesIcon, createSvgIcon } from '../shared/icons';
import { getAuthorName, getMessageContentNodes, getMessageText, getMessageTimestampText } from '../youtube/messages';
import {
  appendRichMessageText,
  normalizeRichTextSegments,
  serializeRichMessageNodes,
  type RichTextSegment
} from '../youtube/richText';
import { mentionAuthorName, quoteAuthorRichText } from './reply';
import {
  initMentionDetection,
  processPotentialMentionForConsumer,
  registerMentionProcessor
} from './mentionDetection';
import {
  clearMentionTabAlert,
  initMentionTabAlert,
  isCurrentTabActive,
  showMentionTabAlert
} from './tabAlert';

const STORAGE_KEY = 'ytcqMentionsInbox';
const MAX_MENTION_RECORDS = 100;
const HEADER_SELECTOR = 'yt-live-chat-header-renderer';
const MENTIONS_INBOX_ICON_VIEW_BOX = '0 -960 960 960';
const MENTIONS_INBOX_ICON_PATH = 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480v58q0 59-40.5 100.5T740-280q-35 0-66-15t-52-43q-29 29-65.5 43.5T480-280q-83 0-141.5-58.5T280-480q0-83 58.5-141.5T480-680q83 0 141.5 58.5T680-480v58q0 26 17 44t43 18q26 0 43-18t17-44v-58q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93h200v80H480Zm85-315q35-35 35-85t-35-85q-35-35-85-35t-85 35q-35 35-35 85t35 85q35 35 85 35t85-35Z';

interface MentionRecord {
  id: string;
  authorName: string;
  contentNodes?: Node[];
  contentParts?: RichTextSegment[];
  text: string;
  timestamp: number;
  timestampText: string;
  sourceUrl: string;
  read: boolean;
}

export interface LatestMentionRecord {
  authorName: string;
  text: string;
}

let records: MentionRecord[] = [];
let recordsLoaded = false;
let recordsLoadPromise: Promise<void> | null = null;
let registeredMentionsInbox = false;
let activeMentionsInboxCard: HTMLElement | null = null;
let activeMentionsInboxCardCleanup: (() => void) | null = null;
let mentionsInboxWireTimer: number | null = null;

export function initMentionsInbox(): void {
  initMentionDetection();
  initMentionTabAlert();
  if (!registeredMentionsInbox) {
    registeredMentionsInbox = true;
    registerMentionProcessor(handlePotentialMentionsInbox);
  }

  void loadMentionRecords().then(() => {
    scheduleMentionsInboxButtonWire();
    refreshMentionsInboxSurfaces();
  });
}

export function handlePotentialMentionsInbox(message: HTMLElement): void {
  processPotentialMentionForConsumer(message, 'ytcqMentionsInboxChecked', () => {
    recordMention(message);
  });
}

export function wireMentionsInboxButton(): void {
  const header = document.querySelector<HTMLElement>(HEADER_SELECTOR);
  if (!header) return;

  const anchor = getMentionsInboxHeaderAnchor(header);
  const existing = header.querySelector<HTMLButtonElement>('.ytcq-mentions-inbox-button');
  if (existing) {
    moveMentionsInboxButton(existing, header, anchor);
    refreshMentionsInboxButton(existing);
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-mentions-inbox-button';
  button.title = 'Mentions inbox';
  button.setAttribute('aria-label', getMentionsInboxAriaLabel());
  button.append(createMentionIcon(), createMentionBadge());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (activeMentionsInboxCard) {
      closeMentionsInboxCard();
      return;
    }

    openMentionsInboxCard(button);
  }, true);

  moveMentionsInboxButton(button, header, anchor);

  refreshMentionsInboxButton(button);
}

export function scheduleMentionsInboxButtonWire(): void {
  if (mentionsInboxWireTimer !== null) return;

  mentionsInboxWireTimer = window.setTimeout(() => {
    mentionsInboxWireTimer = null;
    wireMentionsInboxButton();
  }, 0);
}

export function openMentionsInboxCard(anchor?: HTMLElement): void {
  void loadMentionRecords().then(() => {
    closeMentionsInboxCard();

    const card = document.createElement('section');
    card.className = 'ytcq-profile-card ytcq-mentions-inbox-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Mentions inbox');

    const header = document.createElement('div');
    header.className = 'ytcq-profile-card-header ytcq-mentions-inbox-card-header';

    const icon = document.createElement('span');
    icon.className = 'ytcq-mentions-inbox-card-icon';
    icon.append(createMentionIcon());

    const titleWrap = document.createElement('div');
    titleWrap.className = 'ytcq-profile-card-title-wrap';

    const title = document.createElement('div');
    title.className = 'ytcq-profile-card-title';
    title.textContent = 'Mentions';

    const subtitle = document.createElement('div');
    subtitle.className = 'ytcq-profile-card-subtitle';
    subtitle.textContent = getMentionsInboxSubtitle();

    titleWrap.append(title, subtitle);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ytcq-profile-card-close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.append(createCloseIcon());
    closeButton.addEventListener('click', closeMentionsInboxCard);

    header.append(icon, titleWrap, closeButton);

    const list = document.createElement('div');
    list.className = 'ytcq-profile-card-messages ytcq-mentions-inbox-messages';
    renderMentionsInboxList(list);

    const actions = document.createElement('div');
    actions.className = 'ytcq-profile-card-actions';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'ytcq-profile-card-open';
    clearButton.textContent = 'Clear';
    clearButton.disabled = records.length === 0;
    clearButton.addEventListener('click', () => {
      records = [];
      void saveMentionRecords();
      renderMentionsInboxList(list);
      subtitle.textContent = getMentionsInboxSubtitle();
      clearButton.disabled = true;
      refreshMentionsInboxSurfaces();
    });
    actions.append(clearButton);

    card.append(header, list, actions);
    document.body.append(card);
    activeMentionsInboxCard = card;
    positionMentionsInboxCard(card, anchor);
    scrollMentionsInboxToBottom(list);
    clearMentionTabAlert();
    markMentionsRead();

    const handleOutsideClick = (event: MouseEvent): void => {
      if (activeMentionsInboxCard?.contains(event.target as Node)) return;
      if ((event.target as Element | null)?.closest?.('.ytcq-mentions-inbox-button')) return;
      closeMentionsInboxCard();
    };
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeMentionsInboxCard();
    };
    const handleResize = (): void => {
      if (!activeMentionsInboxCard) return;
      positionMentionsInboxCard(activeMentionsInboxCard, anchor);
    };

    activeMentionsInboxCardCleanup = () => {
      document.removeEventListener('click', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeydown, true);
      window.removeEventListener('resize', handleResize, true);
    };

    window.setTimeout(() => {
      document.addEventListener('click', handleOutsideClick, true);
      document.addEventListener('keydown', handleKeydown, true);
      window.addEventListener('resize', handleResize, true);
    }, 0);
  });
}

function refreshMentionsInboxSurfaces(): void {
  document.querySelectorAll<HTMLButtonElement>('.ytcq-mentions-inbox-button')
    .forEach(refreshMentionsInboxButton);
}

export async function getLatestMentionRecord(): Promise<LatestMentionRecord | null> {
  await loadMentionRecords();
  const record = records[records.length - 1];
  return record ? {
    authorName: record.authorName,
    text: record.text
  } : null;
}

function recordMention(message: HTMLElement): void {
  const record = createMentionRecord(message);
  if (!record) return;

  void loadMentionRecords().then(() => {
    if (records.some((existing) => getRecordSignature(existing) === getRecordSignature(record))) {
      return;
    }

    const read = Boolean(activeMentionsInboxCard && isCurrentTabActive());
    records.push({
      ...record,
      read
    });
    records = records.slice(-MAX_MENTION_RECORDS);
    void saveMentionRecords();

    if (activeMentionsInboxCard) {
      const list = activeMentionsInboxCard.querySelector<HTMLElement>('.ytcq-mentions-inbox-messages');
      const subtitle = activeMentionsInboxCard.querySelector<HTMLElement>('.ytcq-profile-card-subtitle');
      if (list) renderMentionsInboxList(list);
      if (list) scrollMentionsInboxToBottom(list);
      if (subtitle) subtitle.textContent = getMentionsInboxSubtitle();
      if (isCurrentTabActive()) {
        clearMentionTabAlert();
        markMentionsRead();
      } else {
        refreshMentionsInboxSurfaces();
        showMentionTabAlert(getUnreadMentionCount());
      }
    } else {
      refreshMentionsInboxSurfaces();
      showMentionTabAlert(getUnreadMentionCount());
    }
  });
}

function createMentionRecord(message: HTMLElement): MentionRecord | null {
  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!authorName || !text) return null;

  const contentNodes = getMessageContentNodes(message);
  const timestamp = Date.now();
  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    authorName,
    contentNodes,
    contentParts: serializeRichMessageNodes(contentNodes),
    text,
    timestamp,
    timestampText: getMessageTimestampText(message, timestamp),
    sourceUrl: getCurrentSourceUrl(),
    read: false
  };
}

function renderMentionsInboxList(list: HTMLElement): void {
  list.replaceChildren();

  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'ytcq-profile-card-empty ytcq-mentions-inbox-empty';

    const icon = document.createElement('span');
    icon.className = 'ytcq-mentions-inbox-empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(createEmptyInboxIcon());

    const text = document.createElement('span');
    text.textContent = 'Nothing here yet';

    empty.setAttribute('aria-label', 'No mentions yet');
    empty.append(icon, text);
    list.append(empty);
    return;
  }

  records.forEach((record) => {
    const item = document.createElement('div');
    item.className = 'ytcq-profile-card-message ytcq-mentions-inbox-message';
    item.title = 'Quote message';
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    wireQuoteCardItem(item, record);

    const timestamp = document.createElement('time');
    timestamp.className = 'ytcq-profile-card-message-time';
    timestamp.textContent = record.timestampText;
    timestamp.dateTime = new Date(record.timestamp).toISOString();
    timestamp.title = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(record.timestamp);

    const body = document.createElement('span');
    body.className = 'ytcq-profile-card-message-text ytcq-mentions-inbox-message-body';

    const author = document.createElement('button');
    author.type = 'button';
    author.className = 'ytcq-mentions-inbox-author';
    author.textContent = record.authorName;
    author.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      mentionAuthorName(record.authorName);
      closeMentionsInboxCard();
    });

    const spacer = document.createTextNode(' ');
    const text = document.createElement('span');
    appendRichMessageText(text, record.text, record.contentNodes, record.contentParts);

    body.append(author, spacer, text);
    item.append(timestamp, body);
    list.append(item);
  });
}

function wireQuoteCardItem(item: HTMLElement, record: MentionRecord): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    quoteAuthorRichText(record.authorName, record.text, {
      nodes: record.contentNodes,
      segments: record.contentParts
    });
    closeMentionsInboxCard();
  };

  item.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    quote(event);
  });
  item.addEventListener('keydown', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    if (event.key === 'Enter' || event.key === ' ') {
      quote(event);
    }
  });
}

function scrollMentionsInboxToBottom(list: HTMLElement): void {
  window.requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function closeMentionsInboxCard(): void {
  activeMentionsInboxCardCleanup?.();
  activeMentionsInboxCardCleanup = null;
  activeMentionsInboxCard?.remove();
  activeMentionsInboxCard = null;
}

function markMentionsRead(): void {
  if (!records.some((record) => !record.read)) {
    refreshMentionsInboxSurfaces();
    return;
  }

  records = records.map((record) => ({ ...record, read: true }));
  void saveMentionRecords();
  clearMentionTabAlert();
  refreshMentionsInboxSurfaces();
}

function getUnreadMentionCount(): number {
  return records.reduce((count, record) => count + (record.read ? 0 : 1), 0);
}

function getMentionsInboxSubtitle(): string {
  if (!records.length) return 'No mentions yet';
  const unread = getUnreadMentionCount();
  if (unread) return `${unread} new mention${unread === 1 ? '' : 's'}`;
  return `${records.length} saved mention${records.length === 1 ? '' : 's'}`;
}

function refreshMentionsInboxButton(button: HTMLButtonElement): void {
  const unread = getUnreadMentionCount();
  const badge = button.querySelector<HTMLElement>('.ytcq-mentions-inbox-badge');
  const ariaLabel = getMentionsInboxAriaLabel();
  const hasUnread = unread > 0;

  if (button.getAttribute('aria-label') !== ariaLabel) {
    button.setAttribute('aria-label', ariaLabel);
  }
  if (button.classList.contains('ytcq-mentions-inbox-button-has-unread') !== hasUnread) {
    button.classList.toggle('ytcq-mentions-inbox-button-has-unread', hasUnread);
  }

  if (!badge) return;
  const nextBadgeText = formatBadgeCount(unread);
  if (badge.textContent !== nextBadgeText) {
    badge.textContent = nextBadgeText;
  }
  if (badge.hidden === hasUnread) {
    badge.hidden = !hasUnread;
  }
}

function getMentionsInboxAriaLabel(): string {
  const unread = getUnreadMentionCount();
  return unread ? `Mentions inbox, ${unread} unread` : 'Mentions inbox';
}

function createMentionBadge(): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = 'ytcq-mentions-inbox-badge';
  badge.hidden = true;
  return badge;
}

function createMentionIcon(): SVGSVGElement {
  return createSvgIcon(MENTIONS_INBOX_ICON_VIEW_BOX, MENTIONS_INBOX_ICON_PATH);
}

function createEmptyInboxIcon(): SVGSVGElement {
  return createEmptyLeavesIcon();
}

function getMentionsInboxHeaderAnchor(header: HTMLElement): HTMLElement | null {
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

function moveMentionsInboxButton(button: HTMLButtonElement, header: HTMLElement, anchor: HTMLElement | null): void {
  if (anchor && anchor !== button && button.nextElementSibling !== anchor) {
    anchor.before(button);
  } else if (!anchor && button.parentElement !== header) {
    header.append(button);
  }
}

function createCloseIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M18.3 5.71a1 1 0 0 0-1.41 0L12 10.59 7.11 5.7A1 1 0 0 0 5.7 7.11L10.59 12 5.7 16.89a1 1 0 1 0 1.41 1.41L12 13.41l4.89 4.89a1 1 0 0 0 1.41-1.41L13.41 12l4.89-4.89a1 1 0 0 0 0-1.4Z');
  icon.append(path);

  return icon;
}

function positionMentionsInboxCard(card: HTMLElement, anchor?: HTMLElement): void {
  const margin = 8;
  const cardRect = card.getBoundingClientRect();
  const width = cardRect.width;
  const height = cardRect.height;
  const anchorRect = anchor?.isConnected
    ? anchor.getBoundingClientRect()
    : {
        left: window.innerWidth - margin,
        right: window.innerWidth - margin,
        top: margin,
        bottom: margin
      };

  let left = anchorRect.right - width;
  if (left < margin) {
    left = anchorRect.left;
  }
  if (left + width + margin > window.innerWidth) {
    left = window.innerWidth - width - margin;
  }

  let top = anchorRect.bottom + margin;
  if (top + height + margin > window.innerHeight) {
    top = anchorRect.top - height - margin;
  }

  card.style.left = `${Math.max(margin, Math.round(left))}px`;
  card.style.top = `${Math.max(margin, Math.round(top))}px`;
}

function loadMentionRecords(): Promise<void> {
  if (recordsLoaded) return Promise.resolve();
  if (recordsLoadPromise) return recordsLoadPromise;

  recordsLoadPromise = new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (stored) => {
      records = normalizeStoredRecords(stored[STORAGE_KEY]);
      recordsLoaded = true;
      resolve();
    });
  });

  return recordsLoadPromise;
}

function saveMentionRecords(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STORAGE_KEY]: records.map(serializeMentionRecord) }, resolve);
  });
}

function serializeMentionRecord(record: MentionRecord): Omit<MentionRecord, 'contentNodes'> {
  return {
    id: record.id,
    authorName: record.authorName,
    contentParts: record.contentParts || [],
    text: record.text,
    timestamp: record.timestamp,
    timestampText: record.timestampText,
    sourceUrl: record.sourceUrl,
    read: record.read
  };
}

function normalizeStoredRecords(value: unknown): MentionRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(normalizeStoredRecord)
    .filter((record): record is MentionRecord => Boolean(record))
    .slice(-MAX_MENTION_RECORDS);
}

function normalizeStoredRecord(value: unknown): MentionRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<MentionRecord>;
  const authorName = cleanText(candidate.authorName);
  const text = cleanText(candidate.text);
  const timestamp = Number(candidate.timestamp);
  if (!authorName || !text || !Number.isFinite(timestamp)) return null;

  return {
    id: cleanText(candidate.id) || `${timestamp}`,
    authorName,
    contentParts: normalizeRichTextSegments(candidate.contentParts),
    text,
    timestamp,
    timestampText: cleanText(candidate.timestampText) || new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    }).format(timestamp),
    sourceUrl: cleanText(candidate.sourceUrl),
    read: candidate.read === true
  };
}

function getRecordSignature(record: MentionRecord): string {
  return [
    record.authorName,
    record.text,
    record.timestampText,
    record.sourceUrl
  ].join('\n');
}

function getCurrentSourceUrl(): string {
  const url = new URL(window.location.href);
  const videoId = url.searchParams.get('v');
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : window.location.href;
}

function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
