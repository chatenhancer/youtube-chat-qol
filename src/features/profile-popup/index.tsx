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
import { jsx, el } from '../../shared/jsx-dom';
import { updateScrollEdgeFades, wireScrollEdgeFades } from '../../shared/scroll';
import { findChatInput } from '../../youtube/chat-input';
import {
  getLiveMessageForRecord,
  getUserMessagesForIdentity,
  getUserKeyFromIdentity,
  onUserMessagesChanged,
  recordVisibleUserMessages,
  type MessageRecord,
  type UserIdentity
} from '../user-message-history';
import { registerFeature } from '../../content/feature-runtime';
import { mentionAuthorName } from '../reply';
import { applyAvatarRing, createAvatarRingToggleButton } from '../avatar-rings';
import {
  createTranslationPriorityScope,
  type TranslationPriorityScope
} from '../translation/queue';
import {
  onMessageTranslationCleared,
  onMessageTranslationsCleared,
  onTranslationTextRendered
} from '../translation/events';
import { getChannelUrl, openChannelWindow } from '../channel-popup';
import { createAvatarElement, createProfileAvatarButton } from './elements';
import { createProfileMessagePager } from './history-pager';
import {
  clearProfileMentions,
  decorateChatMessageProfileMentions,
  decorateProfileMentions,
  getProfileMentionAuthorName,
  getProfileMentionChannelId,
  refreshVisibleProfileMentions,
  getProfileMentionTarget
} from './mentions';
import { renderProfileMessages, shouldRefreshProfileMessages } from './messages';
import { keepProfileCardInViewport, positionProfileCard } from './positioning';
import { getMessageProfileSource, getParticipantProfileSource } from './source';
import type { ProfileSource } from './types';

const profileCards = new Set<HTMLElement>();
const profileCardsByKey = new Map<string, HTMLElement>();
const profileCardCleanups = new WeakMap<HTMLElement, () => void>();
const profileCardKeys = new WeakMap<HTMLElement, string>();
const profileCardOriginMessageIds = new WeakMap<HTMLElement, string>();
const stickyProfileCards = new WeakSet<HTMLElement>();
const PROFILE_HISTORY_EDGE_TOLERANCE_PX = 12;
const PROFILE_AUTHOR_MAX_FONT_SIZE_PX = 14;
const PROFILE_AUTHOR_MIN_FONT_SIZE_PX = 12;
let nextProfileCardZIndex = 10_000;
let profileWiringListeners = new AbortController();
let profileMentionListenersWired = false;
let profileMentionRefreshFrame = 0;
let profileMentionSurfaceCleanups: Array<() => void> = [];

registerFeature({
  page: {
    init: initProfilePopupSurfaces,
    cleanup: cleanupStaleProfilePopupSurfaces,
    reset: closeProfileCard
  },
  message: wireProfileClick,
  participant: wireParticipantProfileClick
});

export function wireProfileClick(message: HTMLElement): void {
  ensureProfileMentionListeners();
  decorateChatMessageProfileMentions(message);
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
  profileMentionListenersWired = false;
  profileMentionSurfaceCleanups.forEach((cleanup) => cleanup());
  profileMentionSurfaceCleanups = [];
  if (profileMentionRefreshFrame) window.cancelAnimationFrame(profileMentionRefreshFrame);
  profileMentionRefreshFrame = 0;
  closeProfileCard();
  clearProfileMentions();
  document
    .querySelectorAll<HTMLElement>('.ytcq-profile-card:not(.ytcq-inbox-card)')
    .forEach((card) => card.remove());
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

export function openProfileCardForIdentity(
  identity: UserIdentity,
  anchor?: HTMLElement | null
): boolean {
  recordVisibleUserMessages();
  const userMessages = getUserMessagesForIdentity(identity);
  const latestMessage = userMessages[userMessages.length - 1];
  if (!latestMessage) return false;

  const authorName = latestMessage.authorName || identity.authorName || '';
  if (!authorName) return false;

  const avatarSrc = latestMessage.avatarSrc || '';
  const channelId = identity.channelId || latestMessage.channelId;
  const source: ProfileSource = {
    authorName,
    avatarSrc,
    identity: {
      authorName,
      channelId
    },
    profileUrl: getChannelUrl(channelId, authorName)
  };

  showProfileCard(source, anchor || findChatInput() || document.body);
  return true;
}

function ensureProfileMentionListeners(): void {
  if (profileMentionListenersWired) return;
  profileMentionListenersWired = true;
  const options = {
    capture: true,
    signal: profileWiringListeners.signal
  };
  document.addEventListener('click', handleProfileMentionActivation, options);
  document.addEventListener('keydown', handleProfileMentionActivation, options);
}

function initProfilePopupSurfaces(): void {
  ensureProfileMentionListeners();
  if (profileMentionSurfaceCleanups.length) return;

  profileMentionSurfaceCleanups = [
    onUserMessagesChanged(scheduleProfileMentionRefresh),
    onMessageTranslationCleared(({ message }) => decorateChatMessageProfileMentions(message)),
    onMessageTranslationsCleared(scheduleProfileMentionRefresh),
    onTranslationTextRendered((messageText) => decorateProfileMentions(messageText))
  ];
  refreshVisibleProfileMentions();
}

function scheduleProfileMentionRefresh(): void {
  if (profileMentionRefreshFrame) return;
  profileMentionRefreshFrame = window.requestAnimationFrame(() => {
    profileMentionRefreshFrame = 0;
    refreshVisibleProfileMentions();
  });
}

function handleProfileMentionActivation(event: MouseEvent | KeyboardEvent): void {
  if (event instanceof MouseEvent) {
    if (event.button !== 0) return;
  } else if (!['Enter', ' '].includes(event.key) || event.repeat) {
    return;
  }

  const mention = getProfileMentionTarget(event.target);
  if (!mention) return;
  const modifiedNativeLinkClick =
    event instanceof MouseEvent &&
    (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) &&
    Boolean(mention.closest('a[href]'));

  event.stopImmediatePropagation();
  if (!modifiedNativeLinkClick) event.preventDefault();
  if (
    event instanceof MouseEvent &&
    (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
  )
    return;

  const authorName = getProfileMentionAuthorName(mention);
  if (!authorName) return;

  openProfileCardForIdentity(
    { authorName, channelId: getProfileMentionChannelId(mention) },
    mention
  );
}

function showProfileCard(source: ProfileSource, anchor: HTMLElement): void {
  ensureProfileMentionListeners();
  const initialAnchorRect = anchor.getBoundingClientRect();
  recordVisibleUserMessages();
  const profileKey = getUserKeyFromIdentity(source.identity);
  const existingCard = profileKey ? profileCardsByKey.get(profileKey) : null;
  if (existingCard && isProfileCardOpen(existingCard)) {
    const existingOriginMessageId = profileCardOriginMessageIds.get(existingCard) || '';
    if (existingOriginMessageId === (source.originMessageId || '')) {
      bringProfileCardToFront(existingCard);
      return;
    }
    closeSingleProfileCard(existingCard);
  }
  if (profileKey) profileCardsByKey.delete(profileKey);

  closeTransientProfileCards();

  const cardListeners = new AbortController();
  const avatar = createAvatarElement(source.avatarSrc);
  const avatarSurface = source.profileUrl
    ? createProfileAvatarButton(avatar, source.profileUrl)
    : avatar;
  applyAvatarRing(avatarSurface, source.identity);
  let card!: HTMLElement;
  const handleTitleClick = (event: MouseEvent): void => {
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
  };
  const handleCloseClick = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    closeProfileCard(card);
  };
  const title = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-title ytcq-profile-card-author"
      dir="auto"
      title={t('mentionUser')}
      onClick={handleTitleClick}
    >
      {source.authorName}
    </button>
  );
  const channelButton = source.profileUrl ? createProfileChannelButton(source.profileUrl) : null;
  const closeButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-header-button ytcq-profile-card-close"
      aria-label={t('close')}
      onClick={handleCloseClick}
    >
      {createCloseIcon()}
    </button>
  );
  let header!: HTMLDivElement;
  let list!: HTMLDivElement;
  card = el<HTMLElement>(
    <section class="ytcq-profile-card" role="dialog" aria-label={t('recentMessagesFromThisUser')}>
      <div
        ref={(element: HTMLDivElement) => (header = element)}
        class={
          source.profileUrl
            ? 'ytcq-profile-card-header ytcq-profile-card-header-has-channel'
            : 'ytcq-profile-card-header'
        }
      >
        {avatarSurface}
        <div class="ytcq-profile-card-title-wrap">
          {title}
          <div class="ytcq-profile-card-subtitle">{t('recentMessages')}</div>
        </div>
        {createAvatarRingToggleButton({
          ...source.identity,
          avatarUrl: source.avatarSrc
        })}
        {channelButton}
        {closeButton}
      </div>
      <div ref={(element: HTMLDivElement) => (list = element)} class="ytcq-profile-card-messages" />
    </section>
  );
  card.addEventListener('pointerdown', () => bringProfileCardToFront(card), {
    signal: cardListeners.signal
  });
  const scrollFadeCleanup = wireScrollEdgeFades(list);

  const translationPriorityScope = createTranslationPriorityScope();
  const messagePager = createProfileMessagePager(source.originMessageId);
  const renderVisibleMessages = (): void => {
    const visibleMessages = [...messagePager.getVisibleMessages()];
    renderProfileMessages(
      list,
      visibleMessages,
      source,
      () => closeProfileCard(card),
      messagePager.getOriginRecordId()
    );
    prioritizeProfileMessageTranslations(translationPriorityScope, visibleMessages);
  };
  messagePager.updateMessages(getUserMessagesForIdentity(source.identity), {
    followLatest: !source.originMessageId
  });
  renderVisibleMessages();
  document.body.append(card);
  fitProfileCardAuthorText(title);
  profileCards.add(card);
  if (profileKey) {
    profileCardsByKey.set(profileKey, card);
    profileCardKeys.set(card, profileKey);
  }
  profileCardOriginMessageIds.set(card, source.originMessageId || '');
  bringProfileCardToFront(card);
  positionProfileCard(card, initialAnchorRect);
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
  let scrollFrame = 0;
  let pendingScrollIntent: ProfileScrollIntent | null = null;
  const scheduleScroll = (intent: ProfileScrollIntent): void => {
    pendingScrollIntent = intent;
    if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      const nextIntent = pendingScrollIntent;
      pendingScrollIntent = null;
      if (!nextIntent || !isProfileCardOpen(card)) return;
      applyProfileScrollIntent(list, nextIntent);
      updateScrollEdgeFades(list);
    });
  };
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
        positionProfileCard(card, anchor.getBoundingClientRect());
      } else {
        keepProfileCardInViewport(card);
      }
    });
  };
  const resizeObserver = new ResizeObserver(() => {
    fitProfileCardAuthorText(title);
    schedulePosition('viewport');
  });
  resizeObserver.observe(card);
  schedulePosition('viewport');
  const originRecordId = messagePager.getOriginRecordId();
  scheduleScroll(
    originRecordId === null ? { type: 'bottom' } : { recordId: originRecordId, type: 'record' }
  );

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeProfileCard(card);
  };
  const handleResize = (): void => {
    if (!isProfileCardOpen(card)) return;
    schedulePosition('anchor');
  };
  const handleMessageScroll = (): void => {
    if (scrollFrame) return;

    if (list.scrollTop <= PROFILE_HISTORY_EDGE_TOLERANCE_PX && messagePager.hasEarlier()) {
      const intent: ProfileScrollIntent = {
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
        type: 'prepend'
      };
      if (!messagePager.loadEarlier()) return;
      renderVisibleMessages();
      scheduleScroll(intent);
      schedulePosition('viewport');
      return;
    }

    if (isProfileMessageListAtBottom(list) && messagePager.hasLater()) {
      const intent: ProfileScrollIntent = {
        scrollTop: list.scrollTop,
        type: 'exact'
      };
      if (!messagePager.loadLater()) return;
      renderVisibleMessages();
      scheduleScroll(intent);
      schedulePosition('viewport');
    }
  };
  list.addEventListener('scroll', handleMessageScroll, {
    passive: true,
    signal: cardListeners.signal
  });
  const unsubscribeMessages = onUserMessagesChanged((key) => {
    if (!isProfileCardOpen(card) || !shouldRefreshProfileMessages(key, source, profileKey)) return;
    const preservedIntent = pendingScrollIntent;
    const previousOriginRecordId = messagePager.getOriginRecordId();
    const followLatest =
      preservedIntent?.type === 'bottom' ||
      (!preservedIntent && isProfileMessageListAtBottom(list));
    messagePager.updateMessages(getUserMessagesForIdentity(source.identity), { followLatest });
    const resolvedOriginRecordId = messagePager.getOriginRecordId();
    const scrollIntent =
      previousOriginRecordId === null && resolvedOriginRecordId !== null
        ? { recordId: resolvedOriginRecordId, type: 'record' as const }
        : preservedIntent ||
          (followLatest
            ? { type: 'bottom' as const }
            : { scrollTop: list.scrollTop, type: 'exact' as const });
    renderVisibleMessages();
    schedulePosition('viewport');
    scheduleScroll(scrollIntent);
  });

  profileCardCleanups.set(card, () => {
    cardListeners.abort();
    if (positionFrame) window.cancelAnimationFrame(positionFrame);
    if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
    pendingScrollIntent = null;
    resizeObserver.disconnect();
    scrollFadeCleanup();
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

function fitProfileCardAuthorText(author: HTMLButtonElement): void {
  author.style.removeProperty('font-size');
  author.classList.remove('ytcq-profile-card-author-wrap');
  if (author.clientWidth <= 0 || author.scrollWidth <= author.clientWidth) return;

  const idealFontSize = PROFILE_AUTHOR_MAX_FONT_SIZE_PX * (author.clientWidth / author.scrollWidth);
  const fittedFontSize = Math.max(
    PROFILE_AUTHOR_MIN_FONT_SIZE_PX,
    Math.floor(idealFontSize * 10) / 10
  );
  author.style.fontSize = `${fittedFontSize}px`;
  if (idealFontSize < PROFILE_AUTHOR_MIN_FONT_SIZE_PX) {
    author.classList.add('ytcq-profile-card-author-wrap');
  }
}

function createProfileChannelButton(profileUrl: string): HTMLButtonElement {
  const channelButton = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-header-button ytcq-profile-card-channel"
      title={t('openChannel')}
      aria-label={t('openChannel')}
      onClick={(event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        openChannelWindow(profileUrl);
      }}
    >
      {createChannelIcon()}
    </button>
  );
  return channelButton;
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
  recentMessages: readonly MessageRecord[]
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
  profileCardOriginMessageIds.delete(card);
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

type ProfileScrollIntent =
  | { type: 'bottom' }
  | { recordId: number; type: 'record' }
  | { scrollHeight: number; scrollTop: number; type: 'prepend' }
  | { scrollTop: number; type: 'exact' };

function applyProfileScrollIntent(list: HTMLElement, intent: ProfileScrollIntent): void {
  if (intent.type === 'bottom') {
    list.scrollTop = list.scrollHeight;
    return;
  }

  if (intent.type === 'prepend') {
    const addedHeight = Math.max(0, list.scrollHeight - intent.scrollHeight);
    setProfileMessageScrollTop(list, intent.scrollTop + addedHeight);
    return;
  }

  if (intent.type === 'exact') {
    setProfileMessageScrollTop(list, intent.scrollTop);
    return;
  }

  const message = Array.from(list.querySelectorAll<HTMLElement>('.ytcq-profile-card-message')).find(
    (candidate) => candidate.dataset.ytcqMessageRecordId === String(intent.recordId)
  );
  if (!message) return;

  const listRect = list.getBoundingClientRect();
  const messageRect = message.getBoundingClientRect();
  const messageTop = list.scrollTop + messageRect.top - listRect.top;
  setProfileMessageScrollTop(
    list,
    messageTop - Math.max(0, (list.clientHeight - messageRect.height) / 2)
  );
}

function setProfileMessageScrollTop(list: HTMLElement, scrollTop: number): void {
  const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
  list.scrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
}

function isProfileMessageListAtBottom(list: HTMLElement): boolean {
  return (
    list.scrollTop + list.clientHeight >= list.scrollHeight - PROFILE_HISTORY_EDGE_TOLERANCE_PX
  );
}
