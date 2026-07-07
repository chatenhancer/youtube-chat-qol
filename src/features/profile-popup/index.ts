/**
 * Avatar profile card.
 *
 * Clicking a chat avatar opens a small local card with recent messages from
 * that user and an avatar channel action. The message history is not persisted;
 * it only exists while the current chat page is open.
 */
import { t } from '../../shared/i18n';
import { wireFloatingPanelDrag } from '../../shared/floating-panel-drag';
import { createChannelIcon, createCloseIcon } from '../../shared/icons';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { captureScrollPosition, restoreScrollPositionAfterRender, scrollElementToBottom } from '../../shared/scroll';
import { findChatInput } from '../../youtube/chat-input';
import {
  getLiveMessageForRecord,
  getRecentMessagesForIdentity,
  getUserKeyFromIdentity,
  onUserMessagesChanged,
  recordVisibleUserMessages,
  type MessageRecord,
  type UserIdentity
} from '../user-message-history';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { mentionAuthorName } from '../reply';
import {
  applyMarkedUserRing,
  createMarkedUserToggleButton
} from '../marked-users';
import { createTranslationPriorityScope, type TranslationPriorityScope } from '../translation/queue';
import { getChannelUrl, openChannelWindow } from '../channel-popup';
import { createAvatarElement, createProfileAvatarButton } from './elements';
import { renderProfileMessages, shouldRefreshProfileMessages } from './messages';
import { keepProfileCardInViewport, positionProfileCard } from './positioning';
import { getMessageProfileSource, getParticipantProfileSource } from './source';
import type { ProfileSource } from './types';

const profileCards = new Set<HTMLElement>();
const profileCardsByKey = new Map<string, HTMLElement>();
const profileCardCleanups = new WeakMap<HTMLElement, () => void>();
const profileCardKeys = new WeakMap<HTMLElement, string>();
const stickyProfileCards = new WeakSet<HTMLElement>();
let nextProfileCardZIndex = 10_000;
let profileWiringListeners = new AbortController();

registerFeatureLifecycle({
  page: {
    cleanupStale: cleanupStaleProfilePopupSurfaces,
    reset: closeProfileCard
  },
  message: { enhance: wireProfileClick },
  participant: { enhance: wireParticipantProfileClick }
});

export function wireProfileClick(message: HTMLElement): void {
  if (message.dataset.ytcqProfileWired === 'true') return;
  message.dataset.ytcqProfileWired = 'true';

  const avatar = message.querySelector<HTMLElement>('#author-photo');
  if (!avatar) return;

  avatar.classList.add('ytcq-profile-enabled');
  avatar.title = t('showRecentMessages');
  const handleClick = (event: MouseEvent): void => {
    const source = getMessageProfileSource(message);
    if (!source) return;

    event.preventDefault();
    event.stopPropagation();
    showProfileCard(source, avatar);
  };
  avatar.addEventListener('click', handleClick, {
    capture: true,
    signal: profileWiringListeners.signal
  });
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
    target.title = t('showRecentMessages');
    const handleClick = (event: MouseEvent): void => {
      const source = getParticipantProfileSource(participant);
      if (!source) return;

      event.preventDefault();
      event.stopPropagation();
      showProfileCard(source, target);
    };
    target.addEventListener('click', handleClick, {
      capture: true,
      signal: profileWiringListeners.signal
    });
  });
}

export function cleanupStaleProfilePopupSurfaces(): void {
  profileWiringListeners.abort();
  profileWiringListeners = new AbortController();
  closeProfileCard();
  document.querySelectorAll<HTMLElement>('.ytcq-profile-card:not(.ytcq-inbox-card)').forEach((card) => card.remove());
  document.querySelectorAll<HTMLElement>('.ytcq-profile-enabled').forEach((target) => {
    target.classList.remove('ytcq-profile-enabled');
    if (target.title === t('showRecentMessages')) {
      target.removeAttribute('title');
    }
  });
  document.querySelectorAll('[data-ytcq-profile-wired]').forEach((element) => {
    element.removeAttribute('data-ytcq-profile-wired');
  });
}

export function openProfileCardForIdentity(identity: UserIdentity, anchor?: HTMLElement | null): boolean {
  recordVisibleUserMessages();
  const recentMessages = getRecentMessagesForIdentity(identity);
  const latestMessage = recentMessages[recentMessages.length - 1];
  if (!latestMessage) return false;

  const authorName = latestMessage.authorName || identity.authorName || '';
  if (!authorName) return false;

  const avatarSrc = latestMessage.avatarSrc || '';
  const source: ProfileSource = {
    authorName,
    avatarSrc,
    identity: {
      authorName,
      channelId: identity.channelId
    },
    profileUrl: getChannelUrl(identity.channelId, authorName)
  };

  showProfileCard(source, anchor || findChatInput() || document.body);
  return true;
}

function showProfileCard(source: ProfileSource, anchor: HTMLElement): void {
  recordVisibleUserMessages();
  const profileKey = getUserKeyFromIdentity(source.identity);
  const existingCard = profileKey ? profileCardsByKey.get(profileKey) : null;
  if (existingCard && isProfileCardOpen(existingCard)) {
    bringProfileCardToFront(existingCard);
    return;
  }
  if (profileKey) profileCardsByKey.delete(profileKey);

  closeTransientProfileCards();

  const cardListeners = new AbortController();

  const card = ytcqCreateElement('section');
  card.className = 'ytcq-profile-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t('recentMessagesFromThisUser'));
  card.addEventListener('pointerdown', () => bringProfileCardToFront(card), {
    signal: cardListeners.signal
  });

  const header = ytcqCreateElement('div');
  header.className = source.profileUrl
    ? 'ytcq-profile-card-header ytcq-profile-card-header-has-channel'
    : 'ytcq-profile-card-header';

  const avatar = createAvatarElement(source.avatarSrc);
  const avatarSurface = source.profileUrl ? createProfileAvatarButton(avatar, source.profileUrl) : avatar;
  applyMarkedUserRing(avatarSurface, {
    ...source.identity,
    avatarUrl: source.avatarSrc
  });
  header.append(avatarSurface);

  const titleWrap = ytcqCreateElement('div');
  titleWrap.className = 'ytcq-profile-card-title-wrap';

  const title = ytcqCreateElement('button');
  title.type = 'button';
  title.className = 'ytcq-profile-card-title ytcq-profile-card-author';
  title.textContent = source.authorName;
  title.title = t('mentionUser');
  title.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    mentionAuthorName(source.authorName, {
      focusSource: {
        authorName: source.authorName,
        avatarSrc: source.avatarSrc,
        channelId: source.identity.channelId
      }
    });
    closeProfileCard(card);
  });

  const subtitle = ytcqCreateElement('div');
  subtitle.className = 'ytcq-profile-card-subtitle';
  subtitle.textContent = t('recentMessages');

  titleWrap.append(title, subtitle);
  header.append(titleWrap);

  header.append(createMarkedUserToggleButton({
    ...source.identity,
    avatarUrl: source.avatarSrc
  }));

  if (source.profileUrl) {
    const channelButton = ytcqCreateElement('button');
    channelButton.type = 'button';
    channelButton.className = 'ytcq-profile-card-header-button ytcq-profile-card-channel';
    channelButton.title = t('openChannel');
    channelButton.setAttribute('aria-label', t('openChannel'));
    channelButton.append(createChannelIcon());
    channelButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openChannelWindow(source.profileUrl);
    });
    header.append(channelButton);
  }

  const closeButton = ytcqCreateElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-profile-card-header-button ytcq-profile-card-close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeProfileCard(card);
  });
  header.append(closeButton);

  const list = ytcqCreateElement('div');
  list.className = 'ytcq-profile-card-messages';

  const translationPriorityScope = createTranslationPriorityScope();
  const renderMessages = (): void => {
    const recentMessages = getRecentMessagesForIdentity(source.identity);
    renderProfileMessages(list, recentMessages, source, () => closeProfileCard(card));
    prioritizeProfileMessageTranslations(translationPriorityScope, recentMessages);
  };
  renderMessages();

  card.append(header, list);
  document.body.append(card);
  profileCards.add(card);
  if (profileKey) {
    profileCardsByKey.set(profileKey, card);
    profileCardKeys.set(card, profileKey);
  }
  bringProfileCardToFront(card);
  positionProfileCard(card, anchor);
  scrollElementToBottom(list);
  wireFloatingPanelDrag({
    draggingClassName: 'ytcq-profile-card-dragging',
    handle: header,
    onDragMove: () => stickyProfileCards.add(card),
    onDragStart: () => bringProfileCardToFront(card),
    panel: card,
    signal: cardListeners.signal
  });

  let positionFrame = 0;
  let positionMode: 'anchor' | 'viewport' = 'viewport';
  const schedulePosition = (mode: 'anchor' | 'viewport'): void => {
    if (mode === 'anchor') positionMode = mode;
    if (positionFrame) return;

    positionMode = mode;

    positionFrame = window.requestAnimationFrame(() => {
      positionFrame = 0;
      const modeToApply = positionMode;
      positionMode = 'viewport';
      if (!isProfileCardOpen(card)) return;
      if (!anchor.isConnected) {
        keepProfileCardInViewport(card);
        return;
      }

      if (modeToApply === 'anchor') {
        positionProfileCard(card, anchor);
      } else {
        keepProfileCardInViewport(card);
      }
    });
  };
  const resizeObserver = new ResizeObserver(() => schedulePosition('viewport'));
  resizeObserver.observe(card);
  schedulePosition('viewport');

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeProfileCard(card);
  };
  const handleResize = (): void => {
    if (!isProfileCardOpen(card)) return;
    schedulePosition('anchor');
  };
  const unsubscribeMessages = onUserMessagesChanged((key) => {
    if (!isProfileCardOpen(card) || !shouldRefreshProfileMessages(key, source, profileKey)) return;
    const scrollPosition = captureScrollPosition(list);
    renderMessages();
    schedulePosition('viewport');
    restoreScrollPositionAfterRender(list, scrollPosition);
  });

  profileCardCleanups.set(card, () => {
    cardListeners.abort();
    if (positionFrame) window.cancelAnimationFrame(positionFrame);
    resizeObserver.disconnect();
    translationPriorityScope.close();
    unsubscribeMessages();
  });

  window.setTimeout(() => {
    if (!isProfileCardOpen(card)) return;
    const options = { capture: true, signal: cardListeners.signal };
    document.addEventListener('keydown', handleKeydown, options);
    window.addEventListener('resize', handleResize, options);
  }, 0);
}

export function closeProfileCard(card?: HTMLElement): void {
  if (card) {
    closeSingleProfileCard(card);
    return;
  }
  Array.from(profileCards).forEach(closeSingleProfileCard);
}

function prioritizeProfileMessageTranslations(
  scope: TranslationPriorityScope,
  recentMessages: MessageRecord[]
): void {
  scope.prioritize(recentMessages.map(getLiveMessageForRecord));
}

function closeSingleProfileCard(card: HTMLElement): void {
  profileCardCleanups.get(card)?.();
  profileCardCleanups.delete(card);
  const profileKey = profileCardKeys.get(card);
  if (profileKey && profileCardsByKey.get(profileKey) === card) {
    profileCardsByKey.delete(profileKey);
  }
  profileCardKeys.delete(card);
  profileCards.delete(card);
  card.remove();
}

function closeTransientProfileCards(): void {
  Array.from(profileCards).forEach((card) => {
    if (!stickyProfileCards.has(card)) closeSingleProfileCard(card);
  });
}

function isProfileCardOpen(card: HTMLElement): boolean {
  return profileCards.has(card) && card.isConnected;
}

function bringProfileCardToFront(card: HTMLElement): void {
  card.style.zIndex = String(++nextProfileCardZIndex);
}
