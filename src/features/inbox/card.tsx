/**
 * Inbox card UI.
 *
 * Renders the Inbox panel, message rows, clear action, quote behavior, and
 * jump-to-message buttons while state changes stay in the coordinator.
 */
import { t } from '../../shared/i18n';
import { createCloseIcon, createOpenInNewIcon } from '../../shared/icons';
import { jsx, el } from '../../shared/jsx-dom';
import {
  captureScrollPosition,
  restoreScrollPositionAfterRender,
  scrollElementToBottom,
  wireScrollEdgeFades
} from '../../shared/scroll';
import { appendRichMessageText } from '../../youtube/rich-text';
import { applyMarkedUserRing } from '../marked-users';
import { canJumpToChatMessage, createJumpToMessageIcon, jumpToChatMessage } from '../message-jump';
import { mentionAuthorName, quoteAuthorRichText } from '../reply';
import { getChannelUrl, openChannelWindow } from '../channel-popup';
import { highlightInboxAuthorMatches, highlightInboxMatches } from './highlights';
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
import { INBOX_BUTTON_SELECTOR } from './selectors';
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

export function openInboxCardView(
  anchor: HTMLElement | undefined,
  callbacks: InboxCardCallbacks
): void {
  closeInboxCard();

  const keywordButton = createKeywordToggleButton();
  const closeButton = createCardCloseButton();
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

  let list!: HTMLDivElement;
  const clearButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-open ytcq-inbox-clear"
      disabled={getInboxRecordsSnapshot().length === 0}
      onClick={callbacks.onClearRecords}
    >
      {t('clear')}
    </button>
  );

  const card = el<HTMLElement>(
    <section class="ytcq-profile-card ytcq-inbox-card" role="dialog" aria-label={t('inbox')}>
      <div class="ytcq-profile-card-header ytcq-inbox-card-header">
        <span class="ytcq-inbox-card-icon">
          {createInboxIcon(getInboxRecordsSnapshot().length > 0)}
        </span>
        <div class="ytcq-profile-card-title-wrap">
          <div class="ytcq-profile-card-title">{t('inbox')}</div>
          <div class="ytcq-profile-card-subtitle">{getInboxSubtitle()}</div>
        </div>
        {keywordButton}
        {closeButton}
      </div>
      {keywordPanel}
      <div
        ref={(element: HTMLDivElement) => (list = element)}
        class="ytcq-profile-card-messages ytcq-inbox-messages"
      />
      <div class="ytcq-profile-card-actions">{clearButton}</div>
    </section>
  );
  const scrollFadeCleanup = wireScrollEdgeFades(list);
  renderInboxList(list);
  document.body.append(card);
  activeInboxCard = card;
  positionInboxCard(card, anchor);
  scrollElementToBottom(list);
  callbacks.onMarkRead();

  const handleOutsideClick = (event: MouseEvent): void => {
    if (activeInboxCard?.contains(event.target as Node)) return;
    if ((event.target as Element | null)?.closest?.(INBOX_BUTTON_SELECTOR)) return;
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
    scrollFadeCleanup();
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
  const keywordButton = activeInboxCard.querySelector<HTMLButtonElement>(
    '.ytcq-inbox-keyword-toggle'
  );
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
    list.append(
      el<HTMLDivElement>(
        <div class="ytcq-profile-card-empty ytcq-inbox-empty" aria-label={t('inboxEmpty')}>
          <span>{t('noInboxMessages')}</span>
        </div>
      )
    );
    return;
  }

  records.forEach((record) => {
    const item = el<HTMLDivElement>(
      <div
        class="ytcq-profile-card-message ytcq-inbox-message"
        title={t('quoteMessage')}
        role="button"
        tabIndex={0}
      />
    );
    wireQuoteCardItem(item, record);

    const avatar = createInboxAvatar(record);
    if (avatar) item.classList.add('ytcq-inbox-message-has-avatar');
    const timestamp = el<HTMLTimeElement>(
      <time
        class="ytcq-profile-card-message-time"
        dateTime={new Date(record.timestamp).toISOString()}
        title={new Intl.DateTimeFormat(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(record.timestamp)}
      >
        {record.timestampText}
      </time>
    );

    const body = el<HTMLSpanElement>(
      <span class="ytcq-profile-card-message-text ytcq-inbox-message-body" />
    );

    const author = el<HTMLButtonElement>(
      <button
        type="button"
        class="ytcq-inbox-author"
        onClick={(event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          mentionAuthorName(record.authorName);
          closeInboxCard();
        }}
      >
        {record.authorName}
      </button>
    );
    highlightInboxAuthorMatches(author, record);

    const spacer = document.createTextNode(' ');
    const text = el<HTMLSpanElement>(<span />);
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

  const avatar = el<HTMLImageElement>(
    <img src={record.avatarSrc} alt="" referrerPolicy="no-referrer" />
  );
  const channelUrl = getChannelUrl(record.channelId, record.authorName);
  const surface = channelUrl
    ? el<HTMLButtonElement>(
        <button
          type="button"
          class="ytcq-inbox-avatar"
          title={t('openChannel')}
          aria-label={t('openChannel')}
          onClick={(event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            openChannelWindow(channelUrl);
          }}
        >
          {avatar}
          {createInboxAvatarOpenIcon()}
        </button>
      )
    : el<HTMLSpanElement>(<span class="ytcq-inbox-avatar">{avatar}</span>);
  applyMarkedUserRing(surface, {
    authorName: record.authorName,
    avatarUrl: record.avatarSrc,
    channelId: record.channelId
  });
  return surface;
}

function createInboxAvatarOpenIcon(): SVGSVGElement {
  const icon = createOpenInNewIcon();
  icon.classList.add('ytcq-profile-card-avatar-open-icon', 'ytcq-inbox-avatar-open-icon');
  return icon;
}

function createCardCloseButton(): HTMLButtonElement {
  const closeButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-header-button ytcq-profile-card-close"
      aria-label={t('close')}
      onClick={closeInboxCard}
    >
      {createCloseIcon()}
    </button>
  );
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
  if (!canJumpToChatMessage(getLiveInboxMessage(record), record.messageId)) return null;

  const button = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-jump"
      title={t('jumpToMessage')}
      aria-label={t('jumpToMessage')}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        jumpToInboxMessage(record);
      }}
    >
      {createJumpToMessageIcon()}
    </button>
  );

  return button;
}

function jumpToInboxMessage(record: InboxRecord): void {
  const target = getLiveInboxMessage(record);
  if (!canJumpToChatMessage(target, record.messageId)) return;

  jumpToChatMessage(target, record.messageId);
  closeInboxCard();
}

function getInboxSubtitle(): string {
  const records = getInboxRecordsSnapshot();
  if (!records.length) {
    return getInboxKeywordsSnapshot().length
      ? t('watchingMentionsAndKeywords')
      : t('watchingMentions');
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
