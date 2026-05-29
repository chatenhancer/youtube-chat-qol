/**
 * Avatar profile card.
 *
 * Clicking a chat avatar opens a small local card with recent messages from
 * that user and an avatar channel action. The message history is not persisted;
 * it only exists while the current chat page is open.
 */
import { t } from '../../shared/i18n';
import { createCloseIcon } from '../../shared/icons';
import { ytcqCreateElement } from '../../shared/managed-dom';
import { captureScrollPosition, restoreScrollPositionAfterRender, scrollElementToBottom } from '../../shared/scroll';
import { findChatInput } from '../../youtube/chat-input';
import {
  getRecentMessagesForIdentity,
  getUserKeyFromIdentity,
  onUserMessagesChanged,
  recordVisibleUserMessages,
  type UserIdentity
} from '../user-message-history';
import { registerFeatureLifecycle } from '../../content/lifecycle';
import { mentionAuthorName } from '../reply';
import { getChannelUrl } from '../channel-popup';
import { createAvatarElement, createProfileAvatarButton } from './elements';
import { renderProfileMessages, shouldRefreshProfileMessages } from './messages';
import { keepProfileCardInViewport, positionProfileCard } from './positioning';
import { getMessageProfileSource, getParticipantProfileSource } from './source';
import type { ProfileSource } from './types';

let activeProfileCard: HTMLElement | null = null;
let activeProfileCardCleanup: (() => void) | null = null;

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
    target.title = t('showRecentMessages');
    target.addEventListener('click', (event) => {
      const source = getParticipantProfileSource(participant);
      if (!source) return;

      event.preventDefault();
      event.stopPropagation();
      showProfileCard(source, target);
    }, true);
  });
}

export function cleanupStaleProfilePopupSurfaces(): void {
  closeProfileCard();
  document.querySelectorAll<HTMLElement>('.ytcq-profile-card:not(.ytcq-inbox-card)').forEach((card) => card.remove());
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
  closeProfileCard();
  recordVisibleUserMessages();

  const card = ytcqCreateElement('section');
  card.className = 'ytcq-profile-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t('recentMessagesFromThisUser'));

  const header = ytcqCreateElement('div');
  header.className = 'ytcq-profile-card-header';

  const avatar = createAvatarElement(source.avatarSrc);
  header.append(source.profileUrl ? createProfileAvatarButton(avatar, source.profileUrl) : avatar);

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
    closeProfileCard();
  });

  const subtitle = ytcqCreateElement('div');
  subtitle.className = 'ytcq-profile-card-subtitle';
  subtitle.textContent = t('recentMessages');

  titleWrap.append(title, subtitle);
  header.append(titleWrap);

  const closeButton = ytcqCreateElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-profile-card-close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', closeProfileCard);
  header.append(closeButton);

  const list = ytcqCreateElement('div');
  list.className = 'ytcq-profile-card-messages';

  const profileKey = getUserKeyFromIdentity(source.identity);
  renderProfileMessages(list, getRecentMessagesForIdentity(source.identity), source, closeProfileCard);

  card.append(header, list);
  document.body.append(card);
  activeProfileCard = card;
  positionProfileCard(card, anchor);
  scrollElementToBottom(list);

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
      if (activeProfileCard !== card) return;
      if (!anchor.isConnected) {
        closeProfileCard();
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

    schedulePosition('anchor');
  };
  const unsubscribeMessages = onUserMessagesChanged((key) => {
    if (!activeProfileCard || !shouldRefreshProfileMessages(key, source, profileKey)) return;
    const scrollPosition = captureScrollPosition(list);
    renderProfileMessages(list, getRecentMessagesForIdentity(source.identity), source, closeProfileCard);
    schedulePosition('viewport');
    restoreScrollPositionAfterRender(list, scrollPosition);
  });

  activeProfileCardCleanup = () => {
    document.removeEventListener('click', handleOutsideClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('resize', handleResize, true);
    if (positionFrame) window.cancelAnimationFrame(positionFrame);
    resizeObserver.disconnect();
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
