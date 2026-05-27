/**
 * Conversation focus mode.
 *
 * Offers a temporary input-adjacent panel for continuing a conversation with a
 * selected chatter. It is intentionally local and current-page only.
 */
import { t } from '../shared/i18n';
import { cleanText, normalizeComparableText } from '../shared/text';
import { findChatInput, getChatInputText, replaceChatInput } from '../youtube/chat-input';
import {
  getAuthorName,
  getMessageContentSourceNodes,
  getMessageAvatarSrc,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText,
  getRendererData
} from '../youtube/messages';
import { appendRichMessageText, serializeRichMessageNodes, type RichTextSegment } from '../youtube/rich-text';
import { CHAT_MESSAGE_SELECTOR } from '../youtube/selectors';
import { getChannelUrl, openChannelWindow } from './channel-popup';
import { isCurrentUserAuthorName } from './mention-detection';
import { getAvatarSrcForIdentity } from './user-message-history';

interface FocusSource {
  authorName: string;
  avatarSrc?: string;
  channelId?: string;
}

interface FocusRecord {
  authorName: string;
  contentParts: RichTextSegment[];
  id: number;
  key: string;
  side: 'them' | 'us';
  text: string;
  timestampText: string;
}

const SEND_BUTTON_SELECTOR = [
  '#send-button',
  '#send-button button',
  'yt-button-renderer#send-button',
  'yt-icon-button#send-button'
].join(',');
const PANEL_PAGES_SELECTOR = 'tp-yt-iron-pages#panel-pages';
const FOCUS_ANCHOR_CLASS = 'ytcq-focus-anchor';

let activeSource: FocusSource | null = null;
let activeCard: HTMLElement | null = null;
let activeList: HTMLElement | null = null;
let activeExpanded = false;
let mentionRestoreTimer = 0;
let nextRecordId = 1;
let initialized = false;
const focusRecords: FocusRecord[] = [];
const seenFocusRecordKeys = new Set<string>();
const seenFocusRecordContentKeys = new Set<string>();
let seenFocusRecordMessages = new WeakSet<HTMLElement>();

export function initFocusMode(): void {
  if (initialized) return;
  initialized = true;
  document.addEventListener('keydown', handleDocumentKeydown, true);
  document.addEventListener('click', handleDocumentClick, true);
}

export function resetFocusMode(): void {
  closeFocusMode();
}

export function showFocusPromptForMessage(message: HTMLElement): void {
  const source = getFocusSourceFromMessage(message);
  if (source) showFocusPromptForAuthor(source);
}

export function showFocusPromptForAuthor(source: FocusSource): void {
  const normalizedSource = normalizeFocusSource(source);
  if (!normalizedSource || isCurrentUserAuthorName(normalizedSource.authorName)) return;

  if (
    activeExpanded &&
    activeSource &&
    isSameFocusSource(activeSource, normalizedSource)
  ) {
    return;
  }

  activeSource = normalizedSource;
  clearFocusRecords();
  renderCollapsedFocusPrompt();
}

export function handlePotentialFocusMessage(message: HTMLElement): void {
  if (!activeExpanded || !activeSource || !activeList || !message.isConnected) return;

  const record = createFocusRecord(message);
  if (!record) return;

  focusRecords.push(record);
  renderFocusMessages();
  scrollFocusListToBottom();
}

function renderCollapsedFocusPrompt(): void {
  if (!activeSource) return;

  activeExpanded = false;
  activeCard?.remove();

  const card = document.createElement('section');
  card.className = 'ytcq-focus-card ytcq-focus-card-collapsed';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.setAttribute('aria-label', t('focusMode'));
  card.addEventListener('click', openCollapsedFocusPanel);
  card.addEventListener('keydown', (event) => {
    if (event.target !== card) return;
    if (event.key === 'Enter' || event.key === ' ') {
      openCollapsedFocusPanel(event);
    }
  });

  const summary = document.createElement('div');
  summary.className = 'ytcq-focus-summary';

  const label = document.createElement('span');
  label.className = 'ytcq-focus-label';
  label.textContent = t('focusOn');

  const author = createFocusAuthor(activeSource, { openChannel: false });
  summary.append(label, author);

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'ytcq-focus-open';
  openButton.textContent = t('open');
  openButton.addEventListener('click', openCollapsedFocusPanel);

  const closeButton = createFocusCloseButton(closeFocusMode);

  card.append(summary, openButton, closeButton);
  mountFocusCard(card);
  activeList = null;
}

function openCollapsedFocusPanel(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  openFocusPanel();
}

function openFocusPanel(): void {
  if (!activeSource) return;

  activeExpanded = true;
  activeCard?.remove();
  clearFocusRecords();

  const card = document.createElement('section');
  card.className = 'ytcq-focus-card ytcq-focus-card-expanded';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t('focusMode'));

  const header = document.createElement('div');
  header.className = 'ytcq-focus-header';

  const title = document.createElement('div');
  title.className = 'ytcq-focus-title';

  const label = document.createElement('span');
  label.className = 'ytcq-focus-label';
  label.textContent = t('focusingOn');
  title.append(label, createFocusAuthor(activeSource, { openChannel: true }));

  header.append(title, createFocusCloseButton(closeFocusMode));

  const list = document.createElement('div');
  list.className = 'ytcq-focus-messages';

  card.append(header, list);
  mountFocusCard(card);
  activeList = list;

  scanVisibleFocusInteractions();
  renderFocusMessages();
  scrollFocusListToBottom();
  scheduleEnsureFocusMentionPrefix();
}

function scanVisibleFocusInteractions(): void {
  if (!activeSource) return;

  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    const record = createFocusRecord(message);
    if (record) focusRecords.push(record);
  });
}

function createFocusRecord(message: HTMLElement): FocusRecord | null {
  if (!activeSource) return null;

  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!authorName || !text) return null;

  const selectedAuthor = isSelectedFocusAuthor(message, activeSource);
  const currentAuthor = isCurrentUserAuthorName(authorName);
  if (!selectedAuthor && !currentAuthor) return null;

  const side = currentAuthor ? 'us' : 'them';
  if (currentAuthor && !textMentionsSelectedUser(text, activeSource)) return null;

  const timestampText = getMessageTimestampText(message);
  const messageId = cleanText(getMessageStableId(message));
  const contentKey = [
    side,
    normalizeComparableText(authorName),
    normalizeComparableText(timestampText),
    normalizeComparableText(text)
  ].join('\n');
  const key = messageId || contentKey;
  if (
    !key ||
    seenFocusRecordMessages.has(message) ||
    seenFocusRecordKeys.has(key) ||
    seenFocusRecordContentKeys.has(contentKey)
  ) {
    return null;
  }

  seenFocusRecordMessages.add(message);
  seenFocusRecordKeys.add(key);
  seenFocusRecordContentKeys.add(contentKey);

  return {
    authorName,
    contentParts: serializeRichMessageNodes(getMessageContentSourceNodes(message)),
    id: nextRecordId++,
    key,
    side,
    text,
    timestampText
  };
}

function renderFocusMessages(): void {
  if (!activeList) return;
  activeList.replaceChildren();

  if (!focusRecords.length) {
    const empty = document.createElement('div');
    empty.className = 'ytcq-focus-empty';
    empty.textContent = t('noMessagesYet');
    activeList.append(empty);
    return;
  }

  focusRecords.forEach((record) => {
    const item = document.createElement('div');
    item.className = `ytcq-focus-message ytcq-focus-message-${record.side}`;
    if (record.side === 'them') {
      item.classList.add('ytcq-focus-message-quotable');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('title', t('quoteMessage'));
      item.setAttribute('aria-label', t('quoteMessage'));
      wireFocusMessageQuote(item, record);
    }

    const meta = document.createElement('div');
    meta.className = 'ytcq-focus-message-meta';
    meta.textContent = record.timestampText;

    const bubble = document.createElement('div');
    bubble.className = 'ytcq-focus-bubble';
    appendRichMessageText(bubble, record.text, [], record.contentParts);

    item.append(meta, bubble);
    activeList?.append(item);
  });
}

function wireFocusMessageQuote(item: HTMLElement, record: FocusRecord): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    void quoteFocusRecord(record);
  };

  item.addEventListener('click', quote);
  item.addEventListener('keydown', (event) => {
    if (event.target !== item) return;
    if (event.key === 'Enter' || event.key === ' ') {
      quote(event);
    }
  });
}

async function quoteFocusRecord(record: FocusRecord): Promise<void> {
  const { quoteAuthorRichText } = await import('./reply');
  quoteAuthorRichText(record.authorName, record.text, {
    segments: record.contentParts
  }, { skipFocusPrompt: true });
}

function closeFocusMode(): void {
  activeCard?.remove();
  activeCard = null;
  activeList = null;
  activeSource = null;
  activeExpanded = false;
  clearFocusRecords();
  window.clearTimeout(mentionRestoreTimer);
  mentionRestoreTimer = 0;
}

function clearFocusRecords(): void {
  focusRecords.length = 0;
  seenFocusRecordKeys.clear();
  seenFocusRecordContentKeys.clear();
  seenFocusRecordMessages = new WeakSet<HTMLElement>();
}

function createFocusAuthor(source: FocusSource, options: { openChannel: boolean }): HTMLElement {
  const channelUrl = getChannelUrl(source.channelId, source.authorName);
  const author = channelUrl && options.openChannel ? document.createElement('button') : document.createElement('span');
  author.className = 'ytcq-focus-author';
  if (author instanceof HTMLButtonElement) {
    author.type = 'button';
    author.classList.add('ytcq-focus-author-button');
    author.title = t('openChannel');
    author.setAttribute('aria-label', t('openChannel'));
    author.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openChannelWindow(channelUrl);
    });
  }
  author.append(createFocusAvatar(source), document.createTextNode(source.authorName));
  return author;
}

function createFocusAvatar(source: FocusSource): HTMLElement {
  if (source.avatarSrc) {
    const image = document.createElement('img');
    image.className = 'ytcq-focus-avatar';
    image.src = source.avatarSrc;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    return image;
  }

  const fallback = document.createElement('span');
  fallback.className = 'ytcq-focus-avatar ytcq-focus-avatar-fallback';
  fallback.textContent = getAuthorInitial(source.authorName);
  return fallback;
}

function createFocusCloseButton(onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-focus-close';
  button.setAttribute('aria-label', t('close'));
  button.append(createCloseIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
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

function mountFocusCard(card: HTMLElement): void {
  const anchor = getFocusAnchor();
  anchor.replaceChildren(card);
  activeCard = card;
}

function getFocusAnchor(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`.${FOCUS_ANCHOR_CLASS}`);
  const panelPages = document.querySelector<HTMLElement>(PANEL_PAGES_SELECTOR);
  const parent = panelPages?.parentElement || document.body;
  if (existing && existing.parentElement === parent) return existing;

  existing?.remove();

  const anchor = document.createElement('div');
  anchor.className = FOCUS_ANCHOR_CLASS;
  if (panelPages) {
    parent.insertBefore(anchor, panelPages);
  } else {
    parent.append(anchor);
  }
  return anchor;
}

function scrollFocusListToBottom(): void {
  if (!activeList) return;
  window.requestAnimationFrame(() => {
    if (activeList) activeList.scrollTop = activeList.scrollHeight;
  });
}

function handleDocumentKeydown(event: KeyboardEvent): void {
  if (!activeExpanded) return;
  if (event.key === 'Escape') {
    closeFocusMode();
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || !isFromChatInput(event.target)) return;

  schedulePostSendMentionRestore();
}

function handleDocumentClick(event: Event): void {
  if (!activeExpanded) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(SEND_BUTTON_SELECTOR)) return;

  schedulePostSendMentionRestore();
}

function schedulePostSendMentionRestore(): void {
  window.setTimeout(() => scheduleEnsureFocusMentionPrefix({ prefixExistingText: false }), 120);
  window.setTimeout(() => scheduleEnsureFocusMentionPrefix({ prefixExistingText: false }), 360);
}

function scheduleEnsureFocusMentionPrefix(options: { prefixExistingText?: boolean } = {}): void {
  if (mentionRestoreTimer) window.clearTimeout(mentionRestoreTimer);
  const prefixExistingText = options.prefixExistingText !== false;
  mentionRestoreTimer = window.setTimeout(() => {
    mentionRestoreTimer = 0;
    ensureFocusMentionPrefix({ prefixExistingText });
  }, 0);
}

function ensureFocusMentionPrefix({ prefixExistingText }: { prefixExistingText: boolean }): void {
  if (!activeExpanded || !activeSource) return;

  const prefix = getFocusMentionPrefix(activeSource);
  if (!prefix) return;

  const text = getChatInputText();
  if (startsWithFocusMention(text, activeSource)) {
    focusChatInput();
    return;
  }

  const nextText = prefixExistingText && text
    ? `${prefix}${text}`
    : prefix;
  replaceChatInput(nextText);
}

function focusChatInput(): void {
  const input = findChatInput();
  if (!input) return;

  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    input.selectionStart = input.selectionEnd = input.value.length;
    return;
  }

  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function isFromChatInput(target: EventTarget | null): boolean {
  const input = findChatInput();
  return Boolean(input && target instanceof Node && (input === target || input.contains(target)));
}

function startsWithFocusMention(text: string, source: FocusSource): boolean {
  const normalizedText = normalizeSearchText(text);
  return getMentionNeedlesForAuthor(source.authorName).some((needle) => (
    normalizedText.startsWith(needle) &&
    !isHandleCharacter(normalizedText[needle.length] || '')
  ));
}

function getFocusMentionPrefix(source: FocusSource): string {
  const authorName = cleanText(source.authorName);
  return authorName ? `${authorName} ` : '';
}

function textMentionsSelectedUser(text: string, source: FocusSource): boolean {
  return getMentionNeedlesForAuthor(source.authorName)
    .some((needle) => textContainsMentionNeedle(text, needle));
}

function textContainsMentionNeedle(text: string, needle: string): boolean {
  const haystack = normalizeSearchText(text);
  if (!haystack || !needle) return false;

  let index = haystack.indexOf(needle);
  while (index >= 0) {
    const before = index > 0 ? haystack[index - 1] : '';
    const after = haystack[index + needle.length] || '';
    if (!isHandleCharacter(before) && !isHandleCharacter(after)) return true;
    index = haystack.indexOf(needle, index + 1);
  }
  return false;
}

function getMentionNeedlesForAuthor(authorName: string): string[] {
  const normalized = normalizeSearchText(authorName).replace(/^@+/, '');
  if (!normalized || /\s/.test(normalized)) return [];

  return Array.from(new Set([
    `@${normalized}`,
    normalized
  ]));
}

function isSelectedFocusAuthor(message: HTMLElement, source: FocusSource): boolean {
  const data = getRendererData(message);
  const channelId = data?.authorExternalChannelId || data?.authorChannelId;
  if (source.channelId && channelId) return source.channelId === channelId;

  return normalizeComparableText(getAuthorName(message)) === normalizeComparableText(source.authorName);
}

function getFocusSourceFromMessage(message: HTMLElement): FocusSource | null {
  const data = getRendererData(message);
  const authorName = getAuthorName(message);
  if (!authorName) return null;

  return normalizeFocusSource({
    authorName,
    avatarSrc: getMessageAvatarSrc(message),
    channelId: data?.authorExternalChannelId || data?.authorChannelId
  });
}

function normalizeFocusSource(source: FocusSource): FocusSource | null {
  const authorName = cleanText(source.authorName);
  if (!authorName) return null;
  const channelId = cleanText(source.channelId);
  const cleanSource: FocusSource = { authorName, channelId };
  const avatarSrc = cleanText(source.avatarSrc) ||
    getAvatarSrcForIdentity(cleanSource) ||
    getVisibleAvatarSrcForFocusSource(cleanSource);

  return {
    authorName,
    avatarSrc,
    channelId
  };
}

function getVisibleAvatarSrcForFocusSource(source: FocusSource): string {
  for (const message of document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)) {
    if (!isSelectedFocusAuthor(message, source)) continue;

    const avatarSrc = getMessageAvatarSrc(message);
    if (avatarSrc) return avatarSrc;
  }

  return '';
}

function isSameFocusSource(a: FocusSource, b: FocusSource): boolean {
  if (a.channelId && b.channelId) return a.channelId === b.channelId;
  return normalizeComparableText(a.authorName) === normalizeComparableText(b.authorName);
}

function getAuthorInitial(authorName: string): string {
  return cleanText(authorName).replace(/^@/, '').slice(0, 1).toUpperCase() || '?';
}

function normalizeSearchText(value: string): string {
  return cleanText(value).toLocaleLowerCase().normalize('NFKC');
}

function isHandleCharacter(value: string): boolean {
  return Boolean(value && /[\p{L}\p{N}._-]/u.test(value));
}
