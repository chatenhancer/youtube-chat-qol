/**
 * Avatar profile card.
 *
 * Clicking a chat avatar opens a small local card with recent messages from
 * that user and an Open channel action. The message history is not persisted;
 * it only exists while the current chat page is open.
 */
import { getOptions } from '../shared/state';
import { getAuthorName, getRendererData } from '../youtube/messages';
import {
  getRecentMessagesForKey,
  getUserKey,
  onUserMessagesChanged,
  type MessageRecord
} from './userMessageHistory';
import { mentionAuthorName, quoteAuthorText } from './reply';

let activeProfileCard: HTMLElement | null = null;
let activeProfileCardCleanup: (() => void) | null = null;

export function wireProfileClick(message: HTMLElement): void {
  if (message.dataset.ytcqProfileWired === 'true') return;
  message.dataset.ytcqProfileWired = 'true';

  const avatar = message.querySelector<HTMLElement>('#author-photo');
  if (!avatar) return;

  avatar.classList.add('ytcq-profile-enabled');
  avatar.title = 'Show recent messages';
  avatar.addEventListener('click', (event) => {
    const url = getProfileUrl(message);

    event.preventDefault();
    event.stopPropagation();
    showProfileCard(message, avatar, url);
  }, true);
}

function getProfileUrl(message: HTMLElement): string {
  const data = getRendererData(message);
  const channelId = data?.authorExternalChannelId || data?.authorChannelId;
  if (channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
  }

  const authorName = getAuthorName(message);
  if (authorName?.startsWith('@')) {
    return `https://www.youtube.com/${encodeURIComponent(authorName)}`;
  }

  return '';
}

function openProfileWindow(url: string): void {
  if (!url) return;

  const features = getOptions().openProfilesInPopup
    ? 'popup=yes,width=430,height=680,menubar=no,toolbar=no,location=yes,status=no,scrollbars=yes,resizable=yes'
    : 'noopener';
  window.open(url, 'ytcq-profile', features);
}

function showProfileCard(message: HTMLElement, anchor: HTMLElement, profileUrl: string): void {
  closeProfileCard();

  const card = document.createElement('section');
  card.className = 'ytcq-profile-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Recent messages from this user');

  const header = document.createElement('div');
  header.className = 'ytcq-profile-card-header';

  const avatar = getAvatarElement(message);
  if (avatar) {
    header.append(avatar);
  }

  const titleWrap = document.createElement('div');
  titleWrap.className = 'ytcq-profile-card-title-wrap';

  const authorName = getAuthorName(message) || 'Chat user';
  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'ytcq-profile-card-title ytcq-profile-card-author';
  title.textContent = authorName;
  title.title = 'Mention user';
  title.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    mentionAuthorName(authorName);
  });

  const subtitle = document.createElement('div');
  subtitle.className = 'ytcq-profile-card-subtitle';
  subtitle.textContent = 'Recent messages';

  titleWrap.append(title, subtitle);
  header.append(titleWrap);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-profile-card-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', closeProfileCard);
  header.append(closeButton);

  const list = document.createElement('div');
  list.className = 'ytcq-profile-card-messages';

  const profileKey = getUserKey(message);
  renderProfileMessages(list, profileKey ? getRecentMessagesForKey(profileKey) : []);

  const actions = document.createElement('div');
  actions.className = 'ytcq-profile-card-actions';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'ytcq-profile-card-open';
  openButton.textContent = 'Open channel';
  openButton.disabled = !profileUrl;
  openButton.addEventListener('click', () => {
    openProfileWindow(profileUrl);
    closeProfileCard();
  });
  actions.append(openButton);

  card.append(header, list, actions);
  document.body.append(card);
  activeProfileCard = card;
  positionProfileCard(card, anchor);
  scrollCardListToBottom(list);

  const handleOutsideClick = (event: MouseEvent): void => {
    if (activeProfileCard?.contains(event.target as Node)) return;
    closeProfileCard();
  };
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeProfileCard();
  };
  const handleResize = (): void => {
    if (!activeProfileCard) return;
    if (!anchor.isConnected) {
      closeProfileCard();
      return;
    }

    positionProfileCard(activeProfileCard, anchor);
  };
  const unsubscribeMessages = profileKey
    ? onUserMessagesChanged((key) => {
        if (key !== profileKey || !activeProfileCard) return;
        renderProfileMessages(list, getRecentMessagesForKey(profileKey));
        scrollCardListToBottom(list);
      })
    : null;

  activeProfileCardCleanup = () => {
    document.removeEventListener('click', handleOutsideClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('resize', handleResize, true);
    unsubscribeMessages?.();
  };

  window.setTimeout(() => {
    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('resize', handleResize, true);
  }, 0);
}

function closeProfileCard(): void {
  activeProfileCardCleanup?.();
  activeProfileCardCleanup = null;
  activeProfileCard?.remove();
  activeProfileCard = null;
}

function renderProfileMessages(list: HTMLElement, recentMessages: MessageRecord[]): void {
  list.replaceChildren();

  if (recentMessages.length) {
    recentMessages.forEach((recentMessage) => {
      const item = document.createElement('div');
      item.className = 'ytcq-profile-card-message';
      item.title = 'Quote message';
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      wireQuoteCardItem(item, recentMessage);

      const timestamp = document.createElement('time');
      timestamp.className = 'ytcq-profile-card-message-time';
      timestamp.textContent = recentMessage.timestampText;
      timestamp.dateTime = new Date(recentMessage.timestamp).toISOString();

      const text = document.createElement('span');
      text.className = 'ytcq-profile-card-message-text';
      text.textContent = recentMessage.text;

      item.append(timestamp, text);
      list.append(item);
    });
    return;
  }

  const empty = document.createElement('div');
  empty.className = 'ytcq-profile-card-empty';
  empty.textContent = 'No recent messages yet.';
  list.append(empty);
}

function wireQuoteCardItem(item: HTMLElement, recentMessage: MessageRecord): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    quoteAuthorText(recentMessage.authorName, recentMessage.text);
  };

  item.addEventListener('click', quote);
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      quote(event);
    }
  });
}

function scrollCardListToBottom(list: HTMLElement): void {
  window.requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function getAvatarElement(message: HTMLElement): HTMLImageElement | null {
  const source = message.querySelector<HTMLImageElement>('#author-photo img, #author-photo #img, img#img');
  if (!source?.src) return null;

  const image = document.createElement('img');
  image.className = 'ytcq-profile-card-avatar';
  image.src = source.src;
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  return image;
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

function positionProfileCard(card: HTMLElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const margin = 8;
  const width = cardRect.width;
  const height = cardRect.height;

  let left = anchorRect.right + margin;
  if (left + width + margin > window.innerWidth) {
    left = anchorRect.left - width - margin;
  }

  let top = anchorRect.top;
  if (top + height + margin > window.innerHeight) {
    top = window.innerHeight - height - margin;
  }

  card.style.left = `${Math.max(margin, Math.round(left))}px`;
  card.style.top = `${Math.max(margin, Math.round(top))}px`;
}
