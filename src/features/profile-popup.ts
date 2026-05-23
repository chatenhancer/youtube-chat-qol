/**
 * Avatar profile card.
 *
 * Clicking a chat avatar opens a small local card with recent messages from
 * that user and an Open channel action. The message history is not persisted;
 * it only exists while the current chat page is open.
 */
import { getOptions } from '../shared/state';
import { createEmptyLeavesIcon } from '../shared/icons';
import { cleanText, normalizeComparableText } from '../shared/text';
import { getAuthorName, getRendererData } from '../youtube/messages';
import { appendRichMessageText } from '../youtube/rich-text';
import {
  createInlineTranslationElement,
  createReplacedTranslationIcon,
  getReplacementTranslationTitle,
  isMeaningfulTranslation
} from './translation/render';
import { createNodesWithPlaceholders } from './translation/protected-placeholders';
import {
  getLiveMessageForRecord,
  getRecentMessagesForIdentity,
  getRecentMessagesForKey,
  getUserKeyFromIdentity,
  onUserMessagesChanged,
  recordVisibleUserMessages,
  type MessageRecord,
  type UserIdentity
} from './user-message-history';
import { createJumpToMessageIcon, jumpToChatMessage } from './message-jump';
import { mentionAuthorName, quoteAuthorRichText } from './reply';

const PROFILE_WINDOW_WIDTH = 486;
const PROFILE_WINDOW_HEIGHT = 680;
const PROFILE_WINDOW_MARGIN = 12;

let activeProfileCard: HTMLElement | null = null;
let activeProfileCardCleanup: (() => void) | null = null;

interface ProfileSource {
  authorName: string;
  avatarSrc: string;
  identity: UserIdentity;
  profileUrl: string;
}

interface ParticipantRendererData {
  authorExternalChannelId?: string;
  authorChannelId?: string;
  authorName?: {
    simpleText?: string;
    runs?: { text?: string }[];
  };
}

export function wireProfileClick(message: HTMLElement): void {
  if (message.dataset.ytcqProfileWired === 'true') return;
  message.dataset.ytcqProfileWired = 'true';

  const avatar = message.querySelector<HTMLElement>('#author-photo');
  if (!avatar) return;

  avatar.classList.add('ytcq-profile-enabled');
  avatar.title = 'Show recent messages';
  avatar.addEventListener('click', (event) => {
    const source = getMessageProfileSource(message);
    if (!source) return;

    event.preventDefault();
    event.stopPropagation();
    showProfileCard(source, avatar);
  }, true);
}

export function wireParticipantProfileClick(participant: HTMLElement): void {
  if (participant.dataset.ytcqProfileWired === 'true') return;
  participant.dataset.ytcqProfileWired = 'true';

  const clickTargets = [
    participant.querySelector<HTMLElement>('yt-img-shadow, img#img, img'),
    participant.querySelector<HTMLElement>('#author-name')
  ].filter((target): target is HTMLElement => Boolean(target));

  clickTargets.forEach((target) => {
    target.classList.add('ytcq-profile-enabled');
    target.title = 'Show recent messages';
    target.addEventListener('click', (event) => {
      const source = getParticipantProfileSource(participant);
      if (!source) return;

      event.preventDefault();
      event.stopPropagation();
      showProfileCard(source, target);
    }, true);
  });
}

function getMessageProfileSource(message: HTMLElement): ProfileSource | null {
  const data = getRendererData(message);
  const channelId = data?.authorExternalChannelId || data?.authorChannelId;
  const authorName = getAuthorName(message);
  const avatarSrc = getMessageAvatarSrc(message);
  if (!authorName || !avatarSrc) return null;

  return {
    authorName,
    avatarSrc,
    identity: {
      authorName,
      channelId
    },
    profileUrl: getProfileUrl(channelId, authorName)
  };
}

function getParticipantProfileSource(participant: HTMLElement): ProfileSource | null {
  const data = getParticipantRendererData(participant);
  const channelId = data?.authorExternalChannelId || data?.authorChannelId;
  const authorName = cleanText(
    data?.authorName?.simpleText ||
    data?.authorName?.runs?.map((run) => run.text || '').join('') ||
    participant.querySelector('#author-name')?.textContent ||
    participant.textContent ||
    ''
  );
  const avatarSrc = participant.querySelector<HTMLImageElement>('yt-img-shadow img, img#img, img')?.src || '';

  if (!authorName || !avatarSrc) return null;

  return {
    authorName,
    avatarSrc,
    identity: {
      authorName,
      channelId
    },
    profileUrl: getProfileUrl(channelId, authorName)
  };
}

function getProfileUrl(channelId: string | undefined, authorName: string): string {
  if (channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
  }

  if (authorName?.startsWith('@')) {
    return `https://www.youtube.com/${authorName}`;
  }

  return '';
}

function getParticipantRendererData(participant: HTMLElement): ParticipantRendererData | null {
  const candidate = participant as HTMLElement & {
    data?: ParticipantRendererData;
    __data?: { data?: ParticipantRendererData };
  };
  return candidate.data || candidate.__data?.data || null;
}

function openProfileWindow(url: string): void {
  if (!url) return;

  const features = getOptions().openProfilesInPopup
    ? getProfileWindowFeatures()
    : 'noopener';
  window.open(url, 'ytcq-profile', features);
}

function getProfileWindowFeatures(): string {
  const position = getProfileWindowPosition();
  return [
    'popup=yes',
    `width=${PROFILE_WINDOW_WIDTH}`,
    `height=${PROFILE_WINDOW_HEIGHT}`,
    `left=${position.left}`,
    `top=${position.top}`,
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'scrollbars=yes',
    'resizable=yes'
  ].join(',');
}

function showProfileCard(source: ProfileSource, anchor: HTMLElement): void {
  closeProfileCard();
  recordVisibleUserMessages();

  const card = document.createElement('section');
  card.className = 'ytcq-profile-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Recent messages from this user');

  const header = document.createElement('div');
  header.className = 'ytcq-profile-card-header';

  const avatar = createAvatarElement(source.avatarSrc);
  header.append(source.profileUrl ? createProfileAvatarButton(avatar, source.profileUrl) : avatar);

  const titleWrap = document.createElement('div');
  titleWrap.className = 'ytcq-profile-card-title-wrap';

  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'ytcq-profile-card-title ytcq-profile-card-author';
  title.textContent = source.authorName;
  title.title = 'Mention user';
  title.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    mentionAuthorName(source.authorName);
    closeProfileCard();
  });

  const subtitle = document.createElement('div');
  subtitle.className = 'ytcq-profile-card-subtitle';
  subtitle.textContent = 'Recent messages';

  titleWrap.append(title, subtitle);
  header.append(titleWrap);

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'ytcq-profile-card-open ytcq-profile-card-open-header';
  openButton.textContent = 'Open channel';
  openButton.disabled = !source.profileUrl;
  openButton.addEventListener('click', () => {
    openProfileWindow(source.profileUrl);
  });
  header.append(openButton);

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-profile-card-close';
  closeButton.setAttribute('aria-label', 'Close');
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', closeProfileCard);
  header.append(closeButton);

  const list = document.createElement('div');
  list.className = 'ytcq-profile-card-messages';

  const profileKey = getUserKeyFromIdentity(source.identity);
  renderProfileMessages(list, getRecentMessagesForIdentity(source.identity));

  card.append(header, list);
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
  const unsubscribeMessages = onUserMessagesChanged((key) => {
    if (!activeProfileCard || !shouldRefreshProfileMessages(key, source, profileKey)) return;
    renderProfileMessages(list, getRecentMessagesForIdentity(source.identity));
    scrollCardListToBottom(list);
  });

  activeProfileCardCleanup = () => {
    document.removeEventListener('click', handleOutsideClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('resize', handleResize, true);
    unsubscribeMessages();
  };

  window.setTimeout(() => {
    document.addEventListener('click', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('resize', handleResize, true);
  }, 0);
}

export function closeProfileCard(): void {
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

      const text = document.createElement('div');
      text.className = 'ytcq-profile-card-message-text';
      renderProfileMessageText(item, text, recentMessage);

      item.append(timestamp, text);
      const jumpButton = createJumpToMessageButton(recentMessage);
      if (jumpButton) item.append(jumpButton);
      list.append(item);
    });
    return;
  }

  const empty = document.createElement('div');
  empty.className = 'ytcq-profile-card-empty ytcq-profile-card-empty-centered';

  const icon = document.createElement('span');
  icon.className = 'ytcq-profile-card-empty-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.append(createEmptyLeavesIcon());

  const text = document.createElement('span');
  text.textContent = 'Nothing here yet';

  empty.append(icon, text);
  list.append(empty);
}

function shouldRefreshProfileMessages(key: string, source: ProfileSource, profileKey: string): boolean {
  if (key === profileKey) return true;

  const authorName = normalizeComparableText(source.authorName);
  if (!authorName) return false;

  return getRecentMessagesForKey(key).some((record) => (
    normalizeComparableText(record.authorName) === authorName
  ));
}

function renderProfileMessageText(
  item: HTMLElement,
  text: HTMLElement,
  recentMessage: MessageRecord
): void {
  const translation = getVisibleProfileMessageTranslation(recentMessage);

  if (translation && getOptions().translationDisplay === 'replace') {
    item.classList.add('ytcq-translation-replaced');
    text.classList.add('ytcq-translation-replaced-text');
    text.lang = translation.result.targetLanguage;
    text.title = getReplacementTranslationTitle(translation.result, recentMessage.text);
    text.append(
      ...createNodesWithPlaceholders(translation.result.text, translation.protectedTokens),
      createReplacedTranslationIcon()
    );
    return;
  }

  appendRichMessageText(text, recentMessage.text, [], recentMessage.contentParts);
  if (translation) {
    text.append(createInlineTranslationElement(translation.result, translation.protectedTokens));
  }
}

function getVisibleProfileMessageTranslation(recentMessage: MessageRecord): MessageRecord['translation'] {
  const translation = recentMessage.translation;
  const targetLanguage = getOptions().targetLanguage;
  if (!translation || !targetLanguage) return undefined;
  if (translation.result.targetLanguage !== targetLanguage) return undefined;
  if (!isMeaningfulTranslation(translation.result, translation.protectedTokens, translation.sourceText)) return undefined;
  return translation;
}

function wireQuoteCardItem(item: HTMLElement, recentMessage: MessageRecord): void {
  const quote = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    quoteAuthorRichText(recentMessage.authorName, recentMessage.text, {
      segments: recentMessage.contentParts
    });
    closeProfileCard();
  };

  item.addEventListener('click', quote);
  item.addEventListener('keydown', (event) => {
    if (event.target !== item) return;
    if (event.key === 'Enter' || event.key === ' ') {
      quote(event);
    }
  });
}

function createJumpToMessageButton(recentMessage: MessageRecord): HTMLButtonElement | null {
  if (!getLiveMessageForRecord(recentMessage)) return null;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-jump';
  button.title = 'Jump to message';
  button.setAttribute('aria-label', 'Jump to message');
  button.append(createJumpToMessageIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    jumpToRecentMessage(recentMessage);
  });

  return button;
}

function jumpToRecentMessage(recentMessage: MessageRecord): void {
  const target = getLiveMessageForRecord(recentMessage);
  if (!target) return;

  jumpToChatMessage(target);
}

function scrollCardListToBottom(list: HTMLElement): void {
  window.requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function getMessageAvatarSrc(message: HTMLElement): string {
  const source = message.querySelector<HTMLImageElement>('#author-photo img, #author-photo #img, img#img');
  return source?.src || '';
}

function createAvatarElement(src: string): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'ytcq-profile-card-avatar';
  image.src = src;
  image.alt = '';
  image.referrerPolicy = 'no-referrer';
  return image;
}

function createProfileAvatarButton(avatar: HTMLImageElement, profileUrl: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-profile-card-avatar-button';
  button.title = 'Open channel';
  button.setAttribute('aria-label', 'Open channel');
  button.append(avatar, createOpenInNewIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openProfileWindow(profileUrl);
  });
  return button;
}

function createOpenInNewIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('aria-hidden', 'true');
  icon.classList.add('ytcq-profile-card-avatar-open-icon');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2Z');
  icon.append(path);

  return icon;
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

function getProfileWindowPosition(): { left: number; top: number } {
  const screenRect = getAvailableScreenRect();
  const chatRect = getChatScreenRect();

  let left = chatRect.left - PROFILE_WINDOW_WIDTH - PROFILE_WINDOW_MARGIN;
  if (left < screenRect.left + PROFILE_WINDOW_MARGIN) {
    left = chatRect.left + chatRect.width + PROFILE_WINDOW_MARGIN;
  }

  const top = chatRect.top + Math.max(PROFILE_WINDOW_MARGIN, (chatRect.height - PROFILE_WINDOW_HEIGHT) / 2);

  const leftMin = screenRect.left + PROFILE_WINDOW_MARGIN;
  const leftMax = screenRect.left + screenRect.width - PROFILE_WINDOW_WIDTH - PROFILE_WINDOW_MARGIN;
  const topMin = screenRect.top + PROFILE_WINDOW_MARGIN;
  const topMax = screenRect.top + screenRect.height - PROFILE_WINDOW_HEIGHT - PROFILE_WINDOW_MARGIN;

  return {
    left: Math.round(clamp(left, leftMin, leftMax)),
    top: Math.round(clamp(top, topMin, topMax))
  };
}

function getChatScreenRect(): { left: number; top: number; width: number; height: number } {
  try {
    const frame = window.frameElement as HTMLElement | null;
    if (frame && window.parent !== window) {
      const frameRect = frame.getBoundingClientRect();
      const parentChromeTop = Math.max(0, window.parent.outerHeight - window.parent.innerHeight);

      return {
        left: window.parent.screenX + frameRect.left,
        top: window.parent.screenY + parentChromeTop + frameRect.top,
        width: frameRect.width,
        height: frameRect.height
      };
    }
  } catch {
    // Fall through to the standalone chat-window approximation.
  }

  return {
    left: window.screenX,
    top: window.screenY,
    width: window.outerWidth || window.innerWidth,
    height: window.outerHeight || window.innerHeight
  };
}

function getAvailableScreenRect(): { left: number; top: number; width: number; height: number } {
  const screenWithOffsets = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = Number.isFinite(screenWithOffsets.availLeft) ? Number(screenWithOffsets.availLeft) : 0;
  const top = Number.isFinite(screenWithOffsets.availTop) ? Number(screenWithOffsets.availTop) : 0;

  return {
    left,
    top,
    width: window.screen.availWidth || window.screen.width,
    height: window.screen.availHeight || window.screen.height
  };
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
