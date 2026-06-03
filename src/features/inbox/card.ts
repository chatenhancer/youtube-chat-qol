/**
 * Inbox card UI.
 *
 * Renders the Inbox panel, message rows, clear action, quote behavior, and
 * jump-to-message buttons while state changes stay in the coordinator.
 */
import { t } from '../../shared/i18n';
import { createCloseIcon } from '../../shared/icons';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { captureScrollPosition, restoreScrollPositionAfterRender, scrollElementToBottom } from '../../shared/scroll';
import { appendRichMessageText } from '../../youtube/rich-text';
import { applyMarkedUserRing } from '../marked-users';
import { createJumpToMessageIcon, jumpToChatMessage } from '../message-jump';
import { mentionAuthorName, quoteAuthorRichText } from '../reply';
import {
  highlightInboxAuthorMatches,
  highlightInboxMatches
} from './highlights';
import { createInboxIcon, setInboxIcon } from './icons';
import {
  createKeywordPanel,
  createKeywordToggleButton,
  refreshKeywordToggle
} from './keyword-panel';
import {
  getInboxKeywordsSnapshot,
  getInboxRecordsSnapshot,
  getLiveInboxMessage,
  getUnreadInboxCount
} from './state';
import type { InboxRecord } from './types';

export interface InboxCardCallbacks {
  onClearRecords: () => void;
  onKeywordsChanged: () => void;
  onMarkRead: () => void;
}

let activeInboxCard: HTMLElement | null = null;
let activeInboxCardCleanup: (() => void) | null = null;

export function isInboxCardOpen(): boolean {
  return Boolean(activeInboxCard);
}

export function openInboxCardView(anchor: HTMLElement | undefined, callbacks: InboxCardCallbacks): void {
  closeInboxCard();

  const card = ytcqCreateElement('section');
  card.className = 'ytcq-profile-card ytcq-inbox-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t('inbox'));

  const header = ytcqCreateElement('div');
  header.className = 'ytcq-profile-card-header ytcq-inbox-card-header';

  const icon = ytcqCreateElement('span');
  icon.className = 'ytcq-inbox-card-icon';
  icon.append(createInboxIcon(getInboxRecordsSnapshot().length > 0));

  const titleWrap = ytcqCreateElement('div');
  titleWrap.className = 'ytcq-profile-card-title-wrap';

  const title = ytcqCreateElement('div');
  title.className = 'ytcq-profile-card-title';
  title.textContent = t('inbox');

  const subtitle = ytcqCreateElement('div');
  subtitle.className = 'ytcq-profile-card-subtitle';
  subtitle.textContent = getInboxSubtitle();

  titleWrap.append(title, subtitle);

  const keywordButton = createKeywordToggleButton();
  const closeButton = createCardCloseButton();

  header.append(icon, titleWrap, keywordButton, closeButton);

  const keywordPanel = createKeywordPanel({
    onKeywordsChanged: callbacks.onKeywordsChanged
  });
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

  const list = ytcqCreateElement('div');
  list.className = 'ytcq-profile-card-messages ytcq-inbox-messages';
  renderInboxList(list);

  const actions = ytcqCreateElement('div');
  actions.className = 'ytcq-profile-card-actions';

  const clearButton = ytcqCreateElement('button');
  clearButton.type = 'button';
  clearButton.className = 'ytcq-profile-card-open ytcq-inbox-clear';
  clearButton.textContent = t('clear');
  clearButton.disabled = getInboxRecordsSnapshot().length === 0;
  clearButton.addEventListener('click', callbacks.onClearRecords);
  actions.append(clearButton);

  card.append(header, keywordPanel, list, actions);
  document.body.append(card);
  activeInboxCard = card;
  positionInboxCard(card, anchor);
  scrollElementToBottom(list);
  callbacks.onMarkRead();

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
  const cardListeners = new AbortController();

  activeInboxCardCleanup = () => {
    cardListeners.abort();
  };

  window.setTimeout(() => {
    const options = { capture: true, signal: cardListeners.signal };
    document.addEventListener('click', handleOutsideClick, options);
    document.addEventListener('keydown', handleKeydown, options);
    window.addEventListener('resize', handleResize, options);
  }, 0);
}

export function refreshOpenInboxCard(): void {
  if (!activeInboxCard) return;

  const list = activeInboxCard.querySelector<HTMLElement>('.ytcq-inbox-messages');
  const subtitle = activeInboxCard.querySelector<HTMLElement>('.ytcq-profile-card-subtitle');
  const clearButton = activeInboxCard.querySelector<HTMLButtonElement>('.ytcq-inbox-clear');
  const icon = activeInboxCard.querySelector<HTMLElement>('.ytcq-inbox-card-icon');
  const keywordButton = activeInboxCard.querySelector<HTMLButtonElement>('.ytcq-inbox-keyword-toggle');
  const records = getInboxRecordsSnapshot();

  if (list) {
    const scrollPosition = captureScrollPosition(list);
    renderInboxList(list);
    restoreScrollPositionAfterRender(list, scrollPosition);
  }
  if (subtitle) subtitle.textContent = getInboxSubtitle();
  if (clearButton) clearButton.disabled = records.length === 0;
  if (icon) setInboxIcon(icon, records.length > 0);
  if (keywordButton) refreshKeywordToggle(keywordButton);
}

export function closeInboxCard(): void {
  activeInboxCardCleanup?.();
  activeInboxCardCleanup = null;
  activeInboxCard?.remove();
  activeInboxCard = null;
}

export function cleanupStaleInboxCards(): void {
  closeInboxCard();
  document.querySelectorAll<HTMLElement>('.ytcq-inbox-card').forEach((card) => card.remove());
}

function renderInboxList(list: HTMLElement): void {
  list.replaceChildren();

  const records = getInboxRecordsSnapshot();
  if (!records.length) {
    const empty = ytcqCreateElement('div');
    empty.className = 'ytcq-profile-card-empty ytcq-inbox-empty';

    const text = ytcqCreateElement('span');
    text.textContent = t('noInboxMessages');

    empty.setAttribute('aria-label', t('inboxEmpty'));
    empty.append(text);
    list.append(empty);
    return;
  }

  records.forEach((record) => {
    const item = ytcqCreateElement('div');
    item.className = 'ytcq-profile-card-message ytcq-inbox-message';
    item.title = t('quoteMessage');
    item.setAttribute('role', 'button');
    item.tabIndex = 0;
    wireQuoteCardItem(item, record);

    const avatar = createInboxAvatar(record);
    if (avatar) item.classList.add('ytcq-inbox-message-has-avatar');
    const timestamp = ytcqCreateElement('time');
    timestamp.className = 'ytcq-profile-card-message-time';
    timestamp.textContent = record.timestampText;
    timestamp.dateTime = new Date(record.timestamp).toISOString();
    timestamp.title = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(record.timestamp);

    const body = ytcqCreateElement('span');
    body.className = 'ytcq-profile-card-message-text ytcq-inbox-message-body';

    const author = ytcqCreateElement('button');
    author.type = 'button';
    author.className = 'ytcq-inbox-author';
    author.textContent = record.authorName;
    highlightInboxAuthorMatches(author, record);
    author.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      mentionAuthorName(record.authorName);
      closeInboxCard();
    });

    const spacer = document.createTextNode(' ');
    const text = ytcqCreateElement('span');
    appendRichMessageText(text, record.text, [], record.contentParts);
    highlightInboxMatches(text, record);

    body.append(author, spacer, text);
    if (avatar) item.append(avatar);
    item.append(timestamp, body);
    const jumpButton = createInboxJumpButton(record);
    if (jumpButton) item.append(jumpButton);
    list.append(item);
  });
}

function createInboxAvatar(record: InboxRecord): HTMLElement | null {
  if (!record.avatarSrc) return null;

  const surface = ytcqCreateElement('span');
  surface.className = 'ytcq-inbox-avatar';
  const image = ytcqCreateElement('img');
  image.src = record.avatarSrc;
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  surface.append(image);
  applyMarkedUserRing(surface, {
    authorName: record.authorName,
    avatarUrl: record.avatarSrc,
    channelId: record.channelId
  });
  return surface;
}

function createCardCloseButton(): HTMLButtonElement {
  const closeButton = ytcqCreateElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-profile-card-header-button ytcq-profile-card-close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', closeInboxCard);
  return closeButton;
}

function wireQuoteCardItem(item: HTMLElement, record: InboxRecord): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    quoteAuthorRichText(record.authorName, record.text, {
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

function createInboxJumpButton(record: InboxRecord): HTMLButtonElement | null {
  if (!getLiveInboxMessage(record)) return null;

  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-jump';
  button.title = t('jumpToMessage');
  button.setAttribute('aria-label', t('jumpToMessage'));
  button.append(createJumpToMessageIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    jumpToInboxMessage(record);
  });

  return button;
}

function jumpToInboxMessage(record: InboxRecord): void {
  const target = getLiveInboxMessage(record);
  if (!target) return;

  jumpToChatMessage(target);
  closeInboxCard();
}

function getInboxSubtitle(): string {
  const records = getInboxRecordsSnapshot();
  if (!records.length) {
    return getInboxKeywordsSnapshot().length ? t('watchingMentionsAndKeywords') : t('watchingMentions');
  }

  const unread = getUnreadInboxCount();
  if (unread) return t('unreadMessages', { count: unread });
  return t('savedMessages', { count: records.length });
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
