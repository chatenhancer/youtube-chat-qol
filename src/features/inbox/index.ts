/**
 * Inbox.
 *
 * Stores chat messages that need the user's attention: direct mentions and
 * locally configured keyword/phrase matches. The UI stays compact by sharing
 * one header button, one card, and inline highlights instead of extra labels.
 */
import { createEmptyLeavesIcon, createSvgIcon } from '../../shared/icons';
import {
  getAuthorName,
  getMessageContentNodes,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText
} from '../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import {
  appendRichMessageText,
  serializeRichMessageNodes
} from '../../youtube/richText';
import {
  applyChatKeywordHighlights,
  CHAT_KEYWORD_HIGHLIGHT_CLASS,
  clearChatKeywordHighlights,
  hasNodeWithClass,
  highlightInboxMatches
} from './highlights';
import {
  findMatchingRecordIndex,
  getKeywordCheckKey,
  getMatchedMentionHandles as getMatchedMentionHandlesFromCandidates,
  getMatchingKeywords as getMatchingKeywordsFromKeywords,
  keywordsEqual,
  MAX_INBOX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  mergeStrings,
  normalizeKeyword
} from './matching';
import {
  getCurrentMentionCandidates,
  initMentionDetection,
  processPotentialMentionForConsumer,
  registerMentionProcessor
} from '../mentionDetection';
import { mentionAuthorName, quoteAuthorRichText } from '../reply';
import {
  clearInboxTabAlert,
  initInboxTabAlert,
  isCurrentTabActive,
  showInboxTabAlert
} from '../tabAlert';
import { playAlertSound } from './sound';
import {
  getInboxTimestamp,
  loadInboxStoredState,
  saveInboxKeywords as saveInboxKeywordsToStorage,
  saveInboxRecords as saveInboxRecordsToStorage,
  sortAndTrimRecords
} from './storage';
import type { InboxMatch, InboxRecord, LatestInboxRecord } from './types';
export type { LatestInboxRecord };

const MAX_PENDING_INBOX_MESSAGES = 60;
const HEADER_SELECTOR = 'yt-live-chat-header-renderer';
const INBOX_ICON_VIEW_BOX = '0 0 24 24';
const INBOX_ICON_PATH = 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 12h-4a3 3 0 0 1-6 0H5V5h14v10Z';
const INBOX_TEXT_ICON_PATH = 'M5 21a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5Zm0-6h4a3 3 0 0 0 6 0h4V5H5v10Zm3-5h8V8H8v2Zm0 3h6v-2H8v2Z';
const ADD_ICON_PATH = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z';

let records: InboxRecord[] = [];
let keywords: string[] = [];
let inboxStateLoaded = false;
let inboxStateLoadPromise: Promise<void> | null = null;
let registeredInbox = false;
let activeInboxCard: HTMLElement | null = null;
let activeInboxCardCleanup: (() => void) | null = null;
let inboxWireTimer: number | null = null;
const pendingInboxMessages = new Set<HTMLElement>();

export function initInbox(): void {
  initMentionDetection();
  initInboxTabAlert();
  if (!registeredInbox) {
    registeredInbox = true;
    registerMentionProcessor(handlePotentialInbox);
  }

  void loadInboxState().then(() => {
    scheduleInboxButtonWire();
    refreshInboxSurfaces();
    refreshVisibleChatKeywordHighlights();
    flushPendingInboxMessages();
  });
}

export function handlePotentialInbox(message: HTMLElement): void {
  if (!message.isConnected || !getMessageText(message)) return;
  if (!inboxStateLoaded) {
    trackPendingInboxMessage(message);
    void loadInboxState().then(flushPendingInboxMessages);
    return;
  }

  processPotentialMentionForConsumer(message, 'ytcqInboxMentionChecked', () => {
    const text = getMessageText(message);
    recordInboxMatch(message, {
      mention: true,
      mentionHandles: getMatchedMentionHandles(text)
    });
  });

  processPotentialKeywordInbox(message);
}

export function highlightPotentialInboxKeywords(message: HTMLElement): void {
  if (!message.isConnected) return;
  if (!inboxStateLoaded) {
    void loadInboxState().then(() => highlightPotentialInboxKeywords(message));
    return;
  }

  applyCurrentChatKeywordHighlights(message);
}

export function wireInboxButton(): void {
  const header = document.querySelector<HTMLElement>(HEADER_SELECTOR);
  if (!header) return;

  const anchor = getInboxHeaderAnchor(header);
  const existing = header.querySelector<HTMLButtonElement>('.ytcq-inbox-button');
  if (existing) {
    moveInboxButton(existing, header, anchor);
    refreshInboxButton(existing);
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-inbox-button';
  button.title = 'Inbox';
  button.setAttribute('aria-label', getInboxAriaLabel());
  button.append(createInboxIcon(), createInboxBadge());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (activeInboxCard) {
      closeInboxCard();
      return;
    }

    openInboxCard(button);
  }, true);

  moveInboxButton(button, header, anchor);
  refreshInboxButton(button);
}

export function scheduleInboxButtonWire(): void {
  if (inboxWireTimer !== null) return;

  inboxWireTimer = window.setTimeout(() => {
    inboxWireTimer = null;
    wireInboxButton();
  }, 0);
}

export function resetInboxState(): void {
  pendingInboxMessages.clear();
  records = [];
  keywords = [];
  inboxStateLoaded = true;
  inboxStateLoadPromise = null;
  closeInboxCard();
  clearInboxTabAlert();
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    clearChatKeywordHighlights(message);
    delete message.dataset.ytcqInboxKeywordChecked;
    delete message.dataset.ytcqInboxKeywordHighlightKey;
  });
  refreshInboxSurfaces();
}

export function openInboxCard(anchor?: HTMLElement): void {
  void loadInboxState().then(() => {
    closeInboxCard();

    const card = document.createElement('section');
    card.className = 'ytcq-profile-card ytcq-inbox-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Inbox');

    const header = document.createElement('div');
    header.className = 'ytcq-profile-card-header ytcq-inbox-card-header';

    const icon = document.createElement('span');
    icon.className = 'ytcq-inbox-card-icon';
    icon.append(createInboxIcon(records.length > 0));

    const titleWrap = document.createElement('div');
    titleWrap.className = 'ytcq-profile-card-title-wrap';

    const title = document.createElement('div');
    title.className = 'ytcq-profile-card-title';
    title.textContent = 'Inbox';

    const subtitle = document.createElement('div');
    subtitle.className = 'ytcq-profile-card-subtitle';
    subtitle.textContent = getInboxSubtitle();

    titleWrap.append(title, subtitle);

    const keywordButton = document.createElement('button');
    keywordButton.type = 'button';
    keywordButton.className = 'ytcq-profile-card-close ytcq-inbox-keyword-toggle';
    keywordButton.title = 'Add keywords';
    keywordButton.setAttribute('aria-label', 'Add keywords');
    keywordButton.setAttribute('aria-expanded', 'false');
    keywordButton.append(createAddIcon(), createKeywordCountBadge());
    refreshKeywordToggle(keywordButton);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ytcq-profile-card-close';
    closeButton.setAttribute('aria-label', 'Close');
    closeButton.append(createCloseIcon());
    closeButton.addEventListener('click', closeInboxCard);

    header.append(icon, titleWrap, keywordButton, closeButton);

    const keywordPanel = createKeywordPanel();
    keywordButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isHidden = keywordPanel.hidden;
      keywordPanel.hidden = !isHidden;
      keywordButton.setAttribute('aria-expanded', String(isHidden));
      if (isHidden) {
        keywordPanel.querySelector<HTMLInputElement>('.ytcq-inbox-keyword-input')?.focus();
      }
    });

    const list = document.createElement('div');
    list.className = 'ytcq-profile-card-messages ytcq-inbox-messages';
    renderInboxList(list);

    const actions = document.createElement('div');
    actions.className = 'ytcq-profile-card-actions';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'ytcq-profile-card-open ytcq-inbox-clear';
    clearButton.textContent = 'Clear';
    clearButton.disabled = records.length === 0;
    clearButton.addEventListener('click', () => {
      records = [];
      void saveInboxRecords();
      clearInboxTabAlert();
      refreshOpenInboxCard();
      refreshInboxSurfaces();
    });
    actions.append(clearButton);

    card.append(header, keywordPanel, list, actions);
    document.body.append(card);
    activeInboxCard = card;
    positionInboxCard(card, anchor);
    scrollInboxToBottom(list);
    clearInboxTabAlert();
    markInboxRead();

    const handleOutsideClick = (event: MouseEvent): void => {
      if (activeInboxCard?.contains(event.target as Node)) return;
      if ((event.target as Element | null)?.closest?.('.ytcq-inbox-button')) return;
      closeInboxCard();
    };
    const handleKeydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeInboxCard();
    };
    const handleResize = (): void => {
      if (!activeInboxCard) return;
      positionInboxCard(activeInboxCard, anchor);
    };

    activeInboxCardCleanup = () => {
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

export async function getLatestInboxRecord(): Promise<LatestInboxRecord | null> {
  await loadInboxState();
  const record = records[records.length - 1];
  return record ? {
    authorName: record.authorName,
    text: record.text
  } : null;
}

function processPotentialKeywordInbox(message: HTMLElement): void {
  if (!keywords.length) {
    clearChatKeywordHighlights(message);
    return;
  }

  const text = getMessageText(message);
  if (!text) return;

  const keywordKey = getKeywordCheckKey(keywords, text);
  if (message.dataset.ytcqInboxKeywordChecked === keywordKey) return;
  message.dataset.ytcqInboxKeywordChecked = keywordKey;

  const matchedKeywords = getMatchingKeywords(text);
  if (!matchedKeywords.length) {
    applyChatKeywordHighlights(message, [], '');
    return;
  }

  recordInboxMatch(message, {
    keywords: matchedKeywords
  });
  applyChatKeywordHighlights(message, matchedKeywords, keywordKey);
}

function recordInboxMatch(message: HTMLElement, match: InboxMatch): void {
  const record = createInboxRecord(message, match);
  if (!record) return;

  void loadInboxState().then(() => {
    const isReadNow = Boolean(activeInboxCard && isCurrentTabActive());
    const incoming = {
      ...record,
      read: isReadNow
    };
    const existingIndex = findMatchingRecordIndex(records, incoming);
    let changed = false;

    if (existingIndex >= 0) {
      const existing = records[existingIndex];
      const merged = mergeInboxRecords(existing, incoming, isReadNow);
      changed = !recordsEqual(existing, merged);
      if (changed) {
        records[existingIndex] = merged;
      }
    } else {
      records.push(incoming);
      changed = true;
    }

    if (!changed) return;

    records = sortAndTrimRecords(records);
    void saveInboxRecords();
    refreshOpenInboxCard();

    if (isReadNow) {
      clearInboxTabAlert();
      markInboxRead();
    } else {
      playAlertSound();
      refreshInboxSurfaces();
      showInboxTabAlert(getUnreadInboxCount());
    }
  });
}

function createInboxRecord(message: HTMLElement, match: InboxMatch): InboxRecord | null {
  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!authorName || !text) return null;

  const contentNodes = getMessageContentNodes(message);
  const now = Date.now();
  const timestampText = getMessageTimestampText(message, now);
  const timestamp = getInboxTimestamp(message, timestampText, now);
  const matchedKeywords = mergeStrings([], match.keywords || []);
  const mentionHandles = match.mention
    ? mergeStrings([], match.mentionHandles?.length ? match.mentionHandles : getMatchedMentionHandles(text))
    : [];

  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    authorName,
    contentNodes,
    contentParts: serializeRichMessageNodes(contentNodes),
    matchedKeywords,
    mention: match.mention === true,
    mentionHandles,
    messageId: getMessageStableId(message),
    read: false,
    sourceUrl: getCurrentSourceUrl(),
    text,
    timestamp,
    timestampText
  };
}

function mergeInboxRecords(existing: InboxRecord, incoming: InboxRecord, isReadNow: boolean): InboxRecord {
  const nextMention = existing.mention || incoming.mention;
  const nextKeywords = mergeStrings(existing.matchedKeywords, incoming.matchedKeywords);
  const nextMentionHandles = mergeStrings(existing.mentionHandles, incoming.mentionHandles);
  const hasNewMatch = (
    nextMention !== existing.mention ||
    nextKeywords.length !== existing.matchedKeywords.length ||
    nextMentionHandles.length !== existing.mentionHandles.length
  );

  const useIncomingContentNodes = shouldUseIncomingContentNodes(existing, incoming);

  return {
    ...existing,
    contentNodes: useIncomingContentNodes ? incoming.contentNodes : existing.contentNodes || incoming.contentNodes,
    contentParts: useIncomingContentNodes
      ? incoming.contentParts
      : existing.contentParts?.length ? existing.contentParts : incoming.contentParts,
    matchedKeywords: nextKeywords,
    mention: nextMention,
    mentionHandles: nextMentionHandles,
    messageId: existing.messageId || incoming.messageId,
    read: hasNewMatch && !isReadNow ? false : existing.read
  };
}

function recordsEqual(first: InboxRecord, second: InboxRecord): boolean {
  return first.read === second.read &&
    first.messageId === second.messageId &&
    first.mention === second.mention &&
    first.matchedKeywords.join('\n') === second.matchedKeywords.join('\n') &&
    first.mentionHandles.join('\n') === second.mentionHandles.join('\n');
}

function shouldUseIncomingContentNodes(existing: InboxRecord, incoming: InboxRecord): boolean {
  if (!incoming.contentNodes?.length) return false;
  if (!existing.contentNodes?.length) return true;

  return hasNodeWithClass(incoming.contentNodes, CHAT_KEYWORD_HIGHLIGHT_CLASS) &&
    !hasNodeWithClass(existing.contentNodes, CHAT_KEYWORD_HIGHLIGHT_CLASS);
}

function renderInboxList(list: HTMLElement): void {
  list.replaceChildren();

  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'ytcq-profile-card-empty ytcq-inbox-empty';

    const icon = document.createElement('span');
    icon.className = 'ytcq-inbox-empty-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.appendChild(createEmptyInboxIcon());

    const text = document.createElement('span');
    text.textContent = 'Nothing here yet';

    empty.setAttribute('aria-label', 'Inbox empty');
    empty.append(icon, text);
    list.append(empty);
    return;
  }

  records.forEach((record) => {
    const item = document.createElement('div');
    item.className = 'ytcq-profile-card-message ytcq-inbox-message';
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
    body.className = 'ytcq-profile-card-message-text ytcq-inbox-message-body';

    const author = document.createElement('button');
    author.type = 'button';
    author.className = 'ytcq-inbox-author';
    author.textContent = record.authorName;
    author.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      mentionAuthorName(record.authorName);
      closeInboxCard();
    });

    const spacer = document.createTextNode(' ');
    const text = document.createElement('span');
    const contentNodes = record.contentNodes || [];
    appendRichMessageText(text, record.text, contentNodes, record.contentParts);
    if (!hasNodeWithClass(contentNodes, CHAT_KEYWORD_HIGHLIGHT_CLASS)) {
      highlightInboxMatches(text, record);
    }

    body.append(author, spacer, text);
    item.append(timestamp, body);
    list.append(item);
  });
}

function createKeywordPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.className = 'ytcq-inbox-keyword-panel';
  panel.hidden = true;

  const form = document.createElement('form');
  form.className = 'ytcq-inbox-keyword-form';

  const input = document.createElement('input');
  input.className = 'ytcq-inbox-keyword-input';
  input.type = 'text';
  input.maxLength = MAX_KEYWORD_LENGTH;
  input.placeholder = 'Keyword or phrase';
  input.setAttribute('aria-label', 'Keyword or phrase');

  const addButton = document.createElement('button');
  addButton.type = 'submit';
  addButton.className = 'ytcq-inbox-keyword-add';
  addButton.textContent = 'Add';

  form.append(input, addButton);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const keyword = normalizeKeyword(input.value);
    if (!keyword || keywords.some((existing) => keywordsEqual(existing, keyword))) {
      input.value = '';
      return;
    }

    keywords = [...keywords, keyword].slice(-MAX_INBOX_KEYWORDS);
    input.value = '';
    void saveInboxKeywords();
    renderKeywordChips(chips);
    refreshVisibleChatKeywordHighlights();
    refreshOpenInboxCard();
  });

  const chips = document.createElement('div');
  chips.className = 'ytcq-inbox-keyword-chips';
  renderKeywordChips(chips);

  panel.append(form, chips);
  return panel;
}

function renderKeywordChips(container: HTMLElement): void {
  container.replaceChildren();

  if (!keywords.length) {
    const empty = document.createElement('span');
    empty.className = 'ytcq-inbox-keyword-empty';
    empty.textContent = 'No keywords';
    container.append(empty);
    return;
  }

  keywords.forEach((keyword) => {
    const chip = document.createElement('span');
    chip.className = 'ytcq-inbox-keyword-chip';

    const label = document.createElement('span');
    label.textContent = keyword;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'ytcq-inbox-keyword-remove';
    removeButton.setAttribute('aria-label', `Remove ${keyword}`);
    removeButton.append(createCloseIcon());
    removeButton.addEventListener('click', () => {
      keywords = keywords.filter((existing) => existing !== keyword);
      void saveInboxKeywords();
      renderKeywordChips(container);
      refreshVisibleChatKeywordHighlights();
      refreshOpenInboxCard();
    });

    chip.append(label, removeButton);
    container.append(chip);
  });
}

function wireQuoteCardItem(item: HTMLElement, record: InboxRecord): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    quoteAuthorRichText(record.authorName, record.text, {
      nodes: record.contentNodes,
      segments: record.contentParts
    });
    closeInboxCard();
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

function refreshVisibleChatKeywordHighlights(): void {
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)
    .forEach(applyCurrentChatKeywordHighlights);
}

function applyCurrentChatKeywordHighlights(message: HTMLElement): string[] {
  const text = getMessageText(message);
  const matchedKeywords = keywords.length ? getMatchingKeywords(text) : [];
  applyChatKeywordHighlights(message, matchedKeywords, matchedKeywords.length ? getKeywordCheckKey(keywords, text) : '');
  return matchedKeywords;
}

function refreshOpenInboxCard(): void {
  if (!activeInboxCard) return;

  const list = activeInboxCard.querySelector<HTMLElement>('.ytcq-inbox-messages');
  const subtitle = activeInboxCard.querySelector<HTMLElement>('.ytcq-profile-card-subtitle');
  const clearButton = activeInboxCard.querySelector<HTMLButtonElement>('.ytcq-inbox-clear');
  const icon = activeInboxCard.querySelector<HTMLElement>('.ytcq-inbox-card-icon');
  const keywordButton = activeInboxCard.querySelector<HTMLButtonElement>('.ytcq-inbox-keyword-toggle');
  if (list) {
    renderInboxList(list);
    scrollInboxToBottom(list);
  }
  if (subtitle) subtitle.textContent = getInboxSubtitle();
  if (clearButton) clearButton.disabled = records.length === 0;
  if (icon) setInboxIcon(icon, records.length > 0);
  if (keywordButton) refreshKeywordToggle(keywordButton);
}

function scrollInboxToBottom(list: HTMLElement): void {
  window.requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function closeInboxCard(): void {
  activeInboxCardCleanup?.();
  activeInboxCardCleanup = null;
  activeInboxCard?.remove();
  activeInboxCard = null;
}

function markInboxRead(): void {
  if (!records.some((record) => !record.read)) {
    refreshInboxSurfaces();
    return;
  }

  records = sortAndTrimRecords(records.map((record) => ({ ...record, read: true })));
  void saveInboxRecords();
  clearInboxTabAlert();
  refreshInboxSurfaces();
}

function getUnreadInboxCount(): number {
  return records.reduce((count, record) => count + (record.read ? 0 : 1), 0);
}

function getInboxSubtitle(): string {
  if (!records.length) return keywords.length ? 'Watching mentions and keywords' : 'Watching mentions';
  const unread = getUnreadInboxCount();
  if (unread) return `${unread} new message${unread === 1 ? '' : 's'}`;
  return `${records.length} saved message${records.length === 1 ? '' : 's'}`;
}

function refreshInboxSurfaces(): void {
  document.querySelectorAll<HTMLButtonElement>('.ytcq-inbox-button')
    .forEach(refreshInboxButton);
}

function refreshInboxButton(button: HTMLButtonElement): void {
  const unread = getUnreadInboxCount();
  const badge = button.querySelector<HTMLElement>('.ytcq-inbox-badge');
  const ariaLabel = getInboxAriaLabel();
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

function getInboxAriaLabel(): string {
  const unread = getUnreadInboxCount();
  return unread ? `Inbox, ${unread} unread` : 'Inbox';
}

function createInboxBadge(): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = 'ytcq-inbox-badge';
  badge.hidden = true;
  return badge;
}

function createKeywordCountBadge(): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = 'ytcq-inbox-keyword-count';
  return badge;
}

function refreshKeywordToggle(button: HTMLButtonElement): void {
  const count = keywords.length;
  const label = count === 1 ? 'Add keywords, 1 keyword watching' : `Add keywords, ${count} keywords watching`;
  const badge = button.querySelector<HTMLElement>('.ytcq-inbox-keyword-count');

  button.title = label;
  button.setAttribute('aria-label', label);
  button.classList.toggle('ytcq-inbox-keyword-toggle-has-count', count > 0);

  if (badge) {
    badge.textContent = formatBadgeCount(count);
    badge.hidden = count === 0;
  }
}

function createInboxIcon(inboxText = false): SVGSVGElement {
  return createSvgIcon(INBOX_ICON_VIEW_BOX, inboxText ? INBOX_TEXT_ICON_PATH : INBOX_ICON_PATH);
}

function setInboxIcon(container: HTMLElement, inboxText: boolean): void {
  const icon = container.querySelector<SVGSVGElement>('svg');
  const path = icon?.querySelector<SVGPathElement>('path');
  const nextPath = inboxText ? INBOX_TEXT_ICON_PATH : INBOX_ICON_PATH;
  if (path && path.getAttribute('d') !== nextPath) {
    path.setAttribute('d', nextPath);
  }
}

function createAddIcon(): SVGSVGElement {
  return createSvgIcon(INBOX_ICON_VIEW_BOX, ADD_ICON_PATH);
}

function createEmptyInboxIcon(): SVGSVGElement {
  return createEmptyLeavesIcon();
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

function positionInboxCard(card: HTMLElement, anchor?: HTMLElement): void {
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

function loadInboxState(): Promise<void> {
  if (inboxStateLoaded) return Promise.resolve();
  if (inboxStateLoadPromise) return inboxStateLoadPromise;

  inboxStateLoadPromise = loadInboxStoredState(getCurrentMentionCandidates).then((stored) => {
    records = stored.records;
    keywords = stored.keywords;
    inboxStateLoaded = true;
  });

  return inboxStateLoadPromise;
}

function saveInboxRecords(): Promise<void> {
  records = sortAndTrimRecords(records);
  return saveInboxRecordsToStorage(records);
}

function saveInboxKeywords(): Promise<void> {
  return saveInboxKeywordsToStorage(keywords);
}

function getMatchedMentionHandles(text: string): string[] {
  return getMatchedMentionHandlesFromCandidates(text, getCurrentMentionCandidates());
}

function getMatchingKeywords(text: string): string[] {
  return getMatchingKeywordsFromKeywords(text, keywords);
}

function getCurrentSourceUrl(): string {
  const url = new URL(window.location.href);
  const videoId = url.searchParams.get('v');
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : window.location.href;
}

function trackPendingInboxMessage(message: HTMLElement): void {
  pendingInboxMessages.add(message);
  if (pendingInboxMessages.size <= MAX_PENDING_INBOX_MESSAGES) return;

  const oldestMessage = pendingInboxMessages.values().next().value;
  if (oldestMessage) {
    pendingInboxMessages.delete(oldestMessage);
  }
}

function flushPendingInboxMessages(): void {
  const messages = Array.from(pendingInboxMessages);
  pendingInboxMessages.clear();
  messages.forEach((message) => {
    if (message.isConnected) handlePotentialInbox(message);
  });
}

function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
