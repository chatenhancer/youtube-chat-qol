import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageRecord } from '../user-message-history';

const profileTestState = vi.hoisted(() => ({
  messageSource: null as unknown,
  participantSource: null as unknown,
  recentMessages: [] as MessageRecord[],
  userMessagesChanged: null as ((key: string) => void) | null
}));

const historyMocks = vi.hoisted(() => ({
  getLiveMessageForRecord: vi.fn(() => null),
  getUserMessagesForIdentity: vi.fn((identity: { authorName?: string; channelId?: string }) => {
    const authorName = (identity.authorName || '').trim().toLowerCase();
    return profileTestState.recentMessages.filter((record) =>
      Boolean(
        (identity.channelId && record.channelId === identity.channelId) ||
        (authorName && record.authorName.trim().toLowerCase() === authorName)
      )
    );
  }),
  getUserKeyFromIdentity: vi.fn((identity: { authorName?: string; channelId?: string }) => {
    if (identity.channelId) return `channel:${identity.channelId}`;
    const authorName = (identity.authorName || '').trim().toLowerCase();
    return authorName ? `author:${authorName}` : '';
  }),
  onUserMessagesChanged: vi.fn((listener: (key: string) => void) => {
    profileTestState.userMessagesChanged = listener;
    return vi.fn();
  }),
  recordVisibleUserMessages: vi.fn()
}));

const sourceMocks = vi.hoisted(() => ({
  getMessageProfileSource: vi.fn(() => profileTestState.messageSource),
  getParticipantProfileSource: vi.fn(() => profileTestState.participantSource)
}));

const messageMocks = vi.hoisted(() => ({
  renderProfileMessages: vi.fn(
    (
      list: HTMLElement,
      messages: MessageRecord[],
      _source: unknown,
      _onClose: () => void,
      originRecordId: number | null
    ) => {
      list.replaceChildren(
        ...messages.map((message) => {
          const item = document.createElement('div');
          item.className =
            message.id === originRecordId
              ? 'ytcq-profile-card-message ytcq-profile-card-message-origin'
              : 'ytcq-profile-card-message';
          item.dataset.ytcqMessageRecordId = String(message.id);
          item.textContent = message.text;
          return item;
        })
      );
    }
  ),
  shouldRefreshProfileMessages: vi.fn(() => true)
}));

const positioningMocks = vi.hoisted(() => ({
  keepProfileCardInViewport: vi.fn(),
  positionProfileCard: vi.fn()
}));

const channelMocks = vi.hoisted(() => ({
  getChannelUrl: vi.fn(
    (_channelId?: string, authorName?: string) => `https://www.youtube.com/${authorName}`
  ),
  openChannelWindow: vi.fn()
}));

const replyMocks = vi.hoisted(() => ({
  mentionAuthorName: vi.fn()
}));

const avatarRingMocks = vi.hoisted(() => ({
  applyAvatarRing: vi.fn(),
  createAvatarRingToggleButton: vi.fn(() => {
    const button = document.createElement('button');
    button.className = 'ytcq-avatar-ring-toggle';
    return button;
  })
}));

const queueMocks = vi.hoisted(() => {
  const close = vi.fn();
  const prioritize = vi.fn();
  return {
    close,
    createTranslationPriorityScope: vi.fn(() => ({ close, prioritize })),
    prioritize
  };
});

vi.mock('../user-message-history', () => historyMocks);
vi.mock('./source', () => sourceMocks);
vi.mock('./messages', () => messageMocks);
vi.mock('./positioning', () => positioningMocks);
vi.mock('../channel-popup', () => channelMocks);
vi.mock('../reply', () => replyMocks);
vi.mock('../avatar-rings', () => avatarRingMocks);
vi.mock('../translation/queue', () => queueMocks);

import {
  cleanupStaleProfilePopupSurfaces,
  closeProfileCard,
  openProfileCardForIdentity,
  wireParticipantProfileClick,
  wireProfileClick
} from './index';
import { suspendFeatures } from '../../content/feature-runtime';

let resizeObserverCallbacks: ResizeObserverCallback[] = [];

describe('profile popup coordinator', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    resizeObserverCallbacks = [];
    profileTestState.recentMessages = [record()];
    profileTestState.messageSource = source();
    profileTestState.participantSource = source({ authorName: '@Participant' });
    profileTestState.userMessagesChanged = null;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class ResizeObserverMock {
        constructor(callback: ResizeObserverCallback) {
          resizeObserverCallbacks.push(callback);
        }

        observe = vi.fn();
        disconnect = vi.fn();
        unobserve = vi.fn();
      }
    });
  });

  afterEach(() => {
    cleanupStaleProfilePopupSurfaces();
    vi.useRealTimers();
  });

  it('opens a profile card from a chat avatar and wires header actions', () => {
    const message = createMessage();
    document.body.append(message);

    wireProfileClick(message);
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    avatar.click();

    const card = document.querySelector<HTMLElement>('.ytcq-profile-card')!;
    expect(card).not.toBeNull();
    expect(card.getAttribute('aria-label')).toBe('Recent messages from this user');
    expect(message.dataset.ytcqProfileWired).toBe('true');
    expect(avatar.title).toBe('Show recent messages');
    expect(messageMocks.renderProfileMessages).toHaveBeenCalled();
    expect(card.querySelector<HTMLElement>('.ytcq-profile-card-author')?.dir).toBe('auto');
    expect(positioningMocks.positionProfileCard).toHaveBeenCalledWith(
      card,
      expect.objectContaining({ left: 0, right: 0, top: 0 })
    );
    expect(avatarRingMocks.applyAvatarRing).toHaveBeenCalledWith(expect.any(HTMLElement), {
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    });
    expect(avatarRingMocks.createAvatarRingToggleButton).toHaveBeenCalledWith({
      authorName: '@ViewerOne',
      avatarUrl: 'https://example.com/avatar.jpg',
      channelId: 'viewer-channel'
    });
    expect(card.querySelector('.ytcq-avatar-ring-toggle')).not.toBeNull();
    expect(card.querySelector('.ytcq-bookmark-toggle')).toBeNull();

    card.querySelector<HTMLButtonElement>('.ytcq-profile-card-author')!.click();
    expect(replyMocks.mentionAuthorName).toHaveBeenCalledWith('@ViewerOne', {
      focusSource: {
        authorName: '@ViewerOne',
        avatarSrc: 'https://example.com/avatar.jpg',
        channelId: 'viewer-channel'
      }
    });
  });

  it('opens the author channel from the header channel button', () => {
    const message = createMessage();
    document.body.append(message);

    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();
    document.querySelector<HTMLButtonElement>('.ytcq-profile-card-channel')!.click();

    expect(channelMocks.openChannelWindow).toHaveBeenCalledWith(
      'https://www.youtube.com/@ViewerOne'
    );
  });

  it('renders a profile card without channel actions when no profile URL exists', () => {
    profileTestState.messageSource = source({ profileUrl: '' });
    const message = createMessage();
    document.body.append(message);

    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();

    expect(document.querySelector('.ytcq-profile-card-header-has-channel')).toBeNull();
    expect(document.querySelector('.ytcq-profile-card-channel')).toBeNull();
  });

  it('does not rewire a message twice and tolerates messages without avatars', () => {
    const message = createMessage();
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    document.body.append(message);

    wireProfileClick(message);
    wireProfileClick(message);
    avatar.click();
    expect(sourceMocks.getMessageProfileSource).toHaveBeenCalledOnce();

    const noAvatar = document.createElement('yt-live-chat-text-message-renderer');
    wireProfileClick(noAvatar);
    expect(noAvatar.dataset.ytcqProfileWired).toBe('true');
  });

  it('opens recent messages for a clicked mention and uses its linked channel identity', () => {
    profileTestState.recentMessages = [
      record({
        authorName: '@MentionedViewer',
        channelId: 'mentioned-channel',
        text: 'mentioned viewer history'
      })
    ];
    const message = createMessage();
    message.querySelector<HTMLElement>('#message')!.innerHTML =
      'Ask <a href="/channel/mentioned-channel">@mentionedviewer</a> about it';
    const rowClick = vi.fn();
    message.addEventListener('click', rowClick);
    document.body.append(message);

    wireProfileClick(message);
    const competingListeners = new AbortController();
    const competingDocumentAction = vi.fn();
    document.addEventListener('click', competingDocumentAction, {
      capture: true,
      signal: competingListeners.signal
    });
    const mention = message.querySelector<HTMLElement>('.ytcq-profile-mention')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    mention.dispatchEvent(click);
    competingListeners.abort();

    expect(historyMocks.getUserMessagesForIdentity).toHaveBeenCalledWith({
      authorName: '@mentionedviewer',
      channelId: 'mentioned-channel'
    });
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe(
      '@MentionedViewer'
    );
    expect(positioningMocks.positionProfileCard).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ left: 0, right: 0, top: 0 })
    );
    expect(click.defaultPrevented).toBe(true);
    expect(rowClick).not.toHaveBeenCalled();
    expect(competingDocumentAction).not.toHaveBeenCalled();
  });

  it('positions a nested mention card from the mention geometry before closing its parent card', () => {
    profileTestState.recentMessages = [
      record(),
      record({
        authorName: '@NestedViewer',
        channelId: 'nested-channel',
        text: 'nested viewer history'
      })
    ];
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();

    const parentCard = document.querySelector<HTMLElement>('.ytcq-profile-card')!;
    const mention = document.createElement('span');
    mention.className = 'ytcq-profile-mention';
    mention.dataset.ytcqProfileMention = '@NestedViewer';
    mention.dataset.ytcqProfileMentionChannelId = 'nested-channel';
    mention.textContent = '@NestedViewer';
    parentCard.querySelector('.ytcq-profile-card-messages')!.append(mention);
    vi.spyOn(mention, 'getBoundingClientRect').mockImplementation(() =>
      mention.isConnected
        ? createRect({ left: 120, right: 230, top: 90, width: 110 })
        : createRect({})
    );

    mention.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, cancelable: true }));

    const nestedCard = document.querySelector<HTMLElement>('.ytcq-profile-card')!;
    expect(parentCard.isConnected).toBe(false);
    expect(nestedCard).not.toBe(parentCard);
    expect(nestedCard.querySelector('.ytcq-profile-card-title')?.textContent).toBe('@NestedViewer');
    expect(positioningMocks.positionProfileCard).toHaveBeenLastCalledWith(
      nestedCard,
      expect.objectContaining({ left: 120, right: 230, top: 90 })
    );
  });

  it('does not highlight a mention when that user has no recent message history', () => {
    const message = createMessage();
    message.querySelector<HTMLElement>('#message')!.textContent = 'Ask @MissingViewer';
    document.body.append(message);

    wireProfileClick(message);

    expect(message.querySelector('.ytcq-profile-mention')).toBeNull();
    expect(message.querySelector('#message')?.textContent).toBe('Ask @MissingViewer');
  });

  it('consumes a mention click even if its matching history disappears before activation', () => {
    profileTestState.recentMessages = [
      record({
        authorName: '@MentionedViewer',
        channelId: 'mentioned-channel'
      })
    ];
    const message = createMessage();
    message.querySelector<HTMLElement>('#message')!.textContent = 'Ask @mentionedviewer';
    const rowClick = vi.fn();
    message.addEventListener('click', rowClick);
    document.body.append(message);

    wireProfileClick(message);
    const mention = message.querySelector<HTMLElement>('.ytcq-profile-mention')!;
    profileTestState.recentMessages = [];
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    mention.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(rowClick).not.toHaveBeenCalled();
    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
  });

  it('decorates matching mentions in Lite message rows', () => {
    profileTestState.recentMessages = [
      record({ authorName: '@LiteViewer', channelId: 'lite-channel' })
    ];
    const message = createMessage();
    message.className = 'ytcq-lite-message';
    message.querySelector<HTMLElement>('#message')!.textContent = 'Ask @liteviewer';
    document.body.append(message);

    wireProfileClick(message);

    expect(message.querySelector('.ytcq-profile-mention')?.textContent).toBe('@liteviewer');
  });

  it('opens profile cards from participant avatars and names', () => {
    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = `
      <img id="img">
      <span id="author-name">@Participant</span>
    `;
    document.body.append(participant);

    wireParticipantProfileClick(participant);
    participant.querySelector<HTMLElement>('#author-name')!.click();

    expect(document.querySelector('.ytcq-profile-card')).not.toBeNull();
    expect(sourceMocks.getParticipantProfileSource).toHaveBeenCalledWith(participant);
  });

  it('opens Participants at the latest batch and loads older messages at the top', async () => {
    vi.useFakeTimers();
    profileTestState.recentMessages = records(30);
    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = `
      <img id="img">
      <span id="author-name">@Participant</span>
    `;
    document.body.append(participant);

    wireParticipantProfileClick(participant);
    participant.querySelector<HTMLElement>('#author-name')!.click();

    expect(renderedMessageIds()).toEqual(range(18, 30));
    await vi.runOnlyPendingTimersAsync();

    const list = document.querySelector<HTMLElement>('.ytcq-profile-card-messages')!;
    setScrollMetrics(list, { clientHeight: 100, scrollHeight: 400 });
    list.scrollTop = 0;
    list.dispatchEvent(new Event('scroll'));

    expect(renderedMessageIds()).toEqual(range(6, 30));
  });

  it('opens a feed profile at the clicked message and loads newer messages at the bottom', async () => {
    vi.useFakeTimers();
    profileTestState.recentMessages = records(40);
    profileTestState.messageSource = source({ originMessageId: 'message-15' });
    const message = createMessage();
    document.body.append(message);

    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();

    expect(renderedMessageIds()).toEqual(range(9, 21));
    expect(document.querySelector('.ytcq-profile-card-message-origin')?.textContent).toBe(
      'message 15'
    );
    await vi.runOnlyPendingTimersAsync();

    const list = document.querySelector<HTMLElement>('.ytcq-profile-card-messages')!;
    setScrollMetrics(list, { clientHeight: 100, scrollHeight: 300 });
    list.scrollTop = 200;
    list.dispatchEvent(new Event('scroll'));

    expect(renderedMessageIds()).toEqual(range(9, 33));
  });

  it('centers a feed-origin message that reaches history after the card opens', async () => {
    vi.useFakeTimers();
    profileTestState.recentMessages = records(10);
    profileTestState.messageSource = source({ originMessageId: 'message-15' });
    const message = createMessage();
    document.body.append(message);

    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();
    expect(document.querySelector('.ytcq-profile-card-message-origin')).toBeNull();

    profileTestState.recentMessages = records(30);
    profileTestState.userMessagesChanged?.('channel:viewer-channel');

    const list = document.querySelector<HTMLElement>('.ytcq-profile-card-messages')!;
    const origin = list.querySelector<HTMLElement>('.ytcq-profile-card-message-origin')!;
    setScrollMetrics(list, { clientHeight: 100, scrollHeight: 900 });
    vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(
      createRect({
        height: 100,
        top: 100
      })
    );
    vi.spyOn(origin, 'getBoundingClientRect').mockReturnValue(
      createRect({
        height: 20,
        top: 400
      })
    );

    await vi.runOnlyPendingTimersAsync();

    expect(origin.textContent).toBe('message 15');
    expect(list.scrollTop).toBe(260);
  });

  it('reuses the open profile card when opening the same user again', () => {
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;

    avatar.click();
    const card = document.querySelector<HTMLElement>('.ytcq-profile-card')!;
    const initialZIndex = Number(card.style.zIndex);
    avatar.click();

    expect(document.querySelectorAll('.ytcq-profile-card:not(.ytcq-inbox-card)')).toHaveLength(1);
    expect(document.querySelector('.ytcq-profile-card')).toBe(card);
    expect(Number(card.style.zIndex)).toBeGreaterThan(initialZIndex);
    expect(positioningMocks.positionProfileCard).toHaveBeenCalledOnce();

    expect(
      openProfileCardForIdentity({ authorName: '@ViewerOne', channelId: 'viewer-channel' })
    ).toBe(true);
    expect(document.querySelectorAll('.ytcq-profile-card:not(.ytcq-inbox-card)')).toHaveLength(1);
    expect(document.querySelector('.ytcq-profile-card')).toBe(card);
  });

  it('closes an unmoved profile card while opening another profile target', () => {
    const firstMessage = createMessage({ includeAuthorName: false });
    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = `
      <img id="img">
      <span id="author-name">@Participant</span>
    `;
    document.body.append(firstMessage, participant);
    wireProfileClick(firstMessage);
    wireParticipantProfileClick(participant);
    const firstAvatar = firstMessage.querySelector<HTMLElement>('#author-photo')!;
    const participantName = participant.querySelector<HTMLElement>('#author-name')!;

    firstAvatar.click();
    profileTestState.participantSource = source({
      authorName: '@ViewerTwo',
      identity: {
        authorName: '@ViewerTwo',
        channelId: 'viewer-two-channel'
      },
      profileUrl: 'https://www.youtube.com/@ViewerTwo'
    });
    participantName.click();

    const cards = document.querySelectorAll('.ytcq-profile-card:not(.ytcq-inbox-card)');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.textContent).toContain('@ViewerTwo');
    expect(cards[0]?.textContent).not.toContain('@ViewerOne');
  });

  it('keeps dragged profile cards open while opening another profile target', async () => {
    vi.useFakeTimers();
    const firstMessage = createMessage({ includeAuthorName: false });
    const participant = document.createElement('yt-live-chat-participant-renderer');
    participant.innerHTML = `
      <img id="img">
      <span id="author-name">@Participant</span>
    `;
    document.body.append(firstMessage, participant);
    wireProfileClick(firstMessage);
    wireParticipantProfileClick(participant);
    const firstAvatar = firstMessage.querySelector<HTMLElement>('#author-photo')!;
    const participantName = participant.querySelector<HTMLElement>('#author-name')!;

    firstAvatar.click();
    await vi.runOnlyPendingTimersAsync();
    const firstCard = document.querySelector<HTMLElement>(
      '.ytcq-profile-card:not(.ytcq-inbox-card)'
    )!;
    const firstHeader = firstCard.querySelector<HTMLElement>('.ytcq-profile-card-header')!;
    firstHeader.dispatchEvent(
      createPointerEvent('pointerdown', {
        clientX: 120,
        clientY: 40,
        pointerId: 3
      })
    );
    document.dispatchEvent(
      createPointerEvent('pointermove', {
        clientX: 180,
        clientY: 80,
        pointerId: 3
      })
    );
    document.dispatchEvent(
      createPointerEvent('pointerup', {
        clientX: 180,
        clientY: 80,
        pointerId: 3
      })
    );
    profileTestState.participantSource = source({
      authorName: '@ViewerTwo',
      identity: {
        authorName: '@ViewerTwo',
        channelId: 'viewer-two-channel'
      },
      profileUrl: 'https://www.youtube.com/@ViewerTwo'
    });
    participantName.click();

    const cards = document.querySelectorAll('.ytcq-profile-card:not(.ytcq-inbox-card)');
    expect(cards).toHaveLength(2);
    expect(Array.from(cards).map((card) => card.textContent)).toEqual([
      expect.stringContaining('@ViewerOne'),
      expect.stringContaining('@ViewerTwo')
    ]);
  });

  it('drags profile cards by the header and ignores header buttons', () => {
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 400
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 600
    });
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();

    const card = document.querySelector<HTMLElement>('.ytcq-profile-card')!;
    const header = card.querySelector<HTMLElement>('.ytcq-profile-card-header')!;
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(
      createRect({
        bottom: 200,
        height: 180,
        left: 100,
        right: 400,
        top: 20,
        width: 300
      })
    );
    card.setPointerCapture = vi.fn();
    card.releasePointerCapture = vi.fn();
    card.style.transform = 'translateX(-50%)';

    const ignoredDown = createPointerEvent('pointerdown', {
      clientX: 120,
      clientY: 40,
      pointerId: 1
    });
    card.querySelector<HTMLButtonElement>('.ytcq-profile-card-close')!.dispatchEvent(ignoredDown);
    expect(card.classList.contains('ytcq-profile-card-dragging')).toBe(false);

    const down = createPointerEvent('pointerdown', {
      clientX: 150,
      clientY: 70,
      pointerId: 7
    });
    const preventDefault = vi.spyOn(down, 'preventDefault');
    header.dispatchEvent(down);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(card.classList.contains('ytcq-profile-card-dragging')).toBe(true);
    expect(card.style.left).toBe('100px');
    expect(card.style.top).toBe('20px');
    expect(card.style.right).toBe('auto');
    expect(card.style.bottom).toBe('auto');
    expect(card.style.transform).toBe('');
    expect(card.setPointerCapture).toHaveBeenCalledWith(7);

    document.dispatchEvent(
      createPointerEvent('pointermove', {
        clientX: 2_000,
        clientY: -100,
        pointerId: 7
      })
    );
    expect(card.style.left).toBe('292px');
    expect(card.style.top).toBe('8px');

    document.dispatchEvent(
      createPointerEvent('pointerup', {
        clientX: 2_000,
        clientY: -100,
        pointerId: 7
      })
    );
    expect(card.classList.contains('ytcq-profile-card-dragging')).toBe(false);
    expect(card.releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it('tolerates participants without clickable avatar or author targets', () => {
    const participant = document.createElement('yt-live-chat-participant-renderer');

    wireParticipantProfileClick(participant);
    wireParticipantProfileClick(participant);

    expect(participant.dataset.ytcqProfileWired).toBe('true');
    expect(sourceMocks.getParticipantProfileSource).not.toHaveBeenCalled();
  });

  it('opens by identity from recent history and refreshes when matching history changes', () => {
    expect(
      openProfileCardForIdentity({ authorName: '@ViewerOne', channelId: 'viewer-channel' })
    ).toBe(true);
    expect(historyMocks.recordVisibleUserMessages).toHaveBeenCalled();
    expect(document.querySelector('.ytcq-profile-card')?.textContent).toContain(
      'hello from history'
    );

    profileTestState.recentMessages = [record({ text: 'updated history' })];
    profileTestState.userMessagesChanged?.('channel:viewer-channel');

    expect(messageMocks.renderProfileMessages).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      profileTestState.recentMessages,
      expect.any(Object),
      expect.any(Function),
      null
    );

    messageMocks.renderProfileMessages.mockClear();
    messageMocks.shouldRefreshProfileMessages.mockReturnValueOnce(false);
    profileTestState.userMessagesChanged?.('channel:other-viewer');
    expect(messageMocks.renderProfileMessages).not.toHaveBeenCalled();

    closeProfileCard();
    profileTestState.recentMessages = [];
    expect(openProfileCardForIdentity({ authorName: '@Missing' })).toBe(false);
  });

  it('cleans profile cards and wiring markers', () => {
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    avatar.click();

    cleanupStaleProfilePopupSurfaces();

    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
    expect(message.hasAttribute('data-ytcq-profile-wired')).toBe(false);
    expect(avatar.classList.contains('ytcq-profile-enabled')).toBe(false);
    expect(avatar.hasAttribute('title')).toBe(false);
  });

  it('closes from the header button and Escape while ignoring outside clicks', async () => {
    vi.useFakeTimers();
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);

    message.querySelector<HTMLElement>('#author-photo')!.click();
    document.querySelector<HTMLButtonElement>('.ytcq-profile-card-close')!.click();
    expect(document.querySelector('.ytcq-profile-card')).toBeNull();

    message.querySelector<HTMLElement>('#author-photo')!.click();
    await vi.runOnlyPendingTimersAsync();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.ytcq-profile-card')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
  });

  it('keeps the card open for inside clicks and ignores non-Escape keys', async () => {
    vi.useFakeTimers();
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);

    message.querySelector<HTMLElement>('#author-photo')!.click();
    await vi.runOnlyPendingTimersAsync();
    const card = document.querySelector<HTMLElement>('.ytcq-profile-card')!;
    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(document.querySelector('.ytcq-profile-card')).toBe(card);
  });

  it('repositions on resize and stays open when the anchor disconnects', async () => {
    vi.useFakeTimers();
    const message = createMessage();
    document.body.append(message);
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    wireProfileClick(message);
    avatar.click();
    await vi.runOnlyPendingTimersAsync();
    const card = document.querySelector<HTMLElement>('.ytcq-profile-card')!;

    window.dispatchEvent(new Event('resize'));
    await vi.runOnlyPendingTimersAsync();
    expect(positioningMocks.positionProfileCard).toHaveBeenCalledTimes(2);
    expect(positioningMocks.positionProfileCard).toHaveBeenLastCalledWith(
      card,
      expect.objectContaining({ left: 0, right: 0, top: 0 })
    );

    avatar.remove();
    window.dispatchEvent(new Event('resize'));
    await vi.runOnlyPendingTimersAsync();
    expect(document.querySelector('.ytcq-profile-card')).toBe(card);
    expect(positioningMocks.keepProfileCardInViewport).toHaveBeenCalledWith(card);
  });

  it('keeps the card in view after resize observer updates even if the anchor disappears', async () => {
    vi.useFakeTimers();
    const message = createMessage();
    document.body.append(message);
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    wireProfileClick(message);
    avatar.click();

    resizeObserverCallbacks.at(-1)?.([], {} as ResizeObserver);
    await vi.runOnlyPendingTimersAsync();
    expect(positioningMocks.keepProfileCardInViewport).toHaveBeenCalledWith(
      expect.any(HTMLElement)
    );

    avatar.remove();
    resizeObserverCallbacks.at(-1)?.([], {} as ResizeObserver);
    await vi.runOnlyPendingTimersAsync();
    expect(document.querySelector('.ytcq-profile-card')).not.toBeNull();
    expect(positioningMocks.keepProfileCardInViewport).toHaveBeenCalledTimes(2);
  });

  it('shrinks a medium recent-messages handle to one line and restores its size when space returns', () => {
    profileTestState.messageSource = source({ authorName: '@AHandleThatNeedsMoreHeaderSpace' });
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();

    const author = document.querySelector<HTMLButtonElement>('.ytcq-profile-card-author')!;
    let availableWidth = 140;
    Object.defineProperties(author, {
      clientWidth: {
        configurable: true,
        get: () => availableWidth
      },
      scrollWidth: {
        configurable: true,
        get: () => 160
      }
    });

    resizeObserverCallbacks.at(-1)?.([], {} as ResizeObserver);
    expect(author.style.fontSize).toBe('12.2px');
    expect(author.classList.contains('ytcq-profile-card-author-wrap')).toBe(false);

    availableWidth = 220;
    resizeObserverCallbacks.at(-1)?.([], {} as ResizeObserver);
    expect(author.style.fontSize).toBe('');
  });

  it('wraps an extra-long recent-messages handle instead of shrinking below 12px', () => {
    profileTestState.messageSource = source({
      authorName: '@AnExceptionallyLongHandleThatCannotFit'
    });
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();

    const author = document.querySelector<HTMLButtonElement>('.ytcq-profile-card-author')!;
    Object.defineProperties(author, {
      clientWidth: {
        configurable: true,
        get: () => 140
      },
      scrollWidth: {
        configurable: true,
        get: () => 210
      }
    });

    resizeObserverCallbacks.at(-1)?.([], {} as ResizeObserver);
    expect(author.style.fontSize).toBe('12px');
    expect(author.classList.contains('ytcq-profile-card-author-wrap')).toBe(true);
  });

  it('ignores history updates after the active card closes', () => {
    const message = createMessage();
    document.body.append(message);
    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();
    closeProfileCard();
    messageMocks.renderProfileMessages.mockClear();

    profileTestState.userMessagesChanged?.('channel:viewer-channel');

    expect(messageMocks.renderProfileMessages).not.toHaveBeenCalled();
  });

  it('ignores profile clicks when YouTube source details cannot be read', () => {
    const message = createMessage();
    document.body.append(message);
    profileTestState.messageSource = null;

    wireProfileClick(message);
    message.querySelector<HTMLElement>('#author-photo')!.click();

    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
    expect(messageMocks.renderProfileMessages).not.toHaveBeenCalled();
  });

  it('does not open a card by identity when no recent message or author exists', () => {
    profileTestState.recentMessages = [record({ authorName: '' })];
    expect(openProfileCardForIdentity({ channelId: 'viewer-channel' })).toBe(false);

    profileTestState.recentMessages = [];
    expect(openProfileCardForIdentity({ authorName: '@ViewerOne' })).toBe(false);
  });

  it('ignores already-wired avatar clicks after features are suspended', () => {
    const message = createMessage();
    document.body.append(message);

    wireProfileClick(message);
    suspendFeatures();
    message.querySelector<HTMLElement>('#author-photo')!.click();

    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
    expect(sourceMocks.getMessageProfileSource).not.toHaveBeenCalled();
  });
});

function source(overrides: Record<string, unknown> = {}) {
  return {
    authorName: '@ViewerOne',
    avatarSrc: 'https://example.com/avatar.jpg',
    identity: {
      authorName: '@ViewerOne',
      channelId: 'viewer-channel'
    },
    profileUrl: 'https://www.youtube.com/@ViewerOne',
    ...overrides
  };
}

function record(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    authorName: '@ViewerOne',
    avatarSrc: 'https://example.com/avatar.jpg',
    contentParts: [],
    id: 1,
    messageId: 'message-1',
    text: 'hello from history',
    timestamp: 1,
    timestampText: '9:30 PM',
    ...overrides
  };
}

function records(count: number): MessageRecord[] {
  return Array.from({ length: count }, (_, index) =>
    record({
      id: index + 1,
      messageId: `message-${index}`,
      text: `message ${index}`,
      timestamp: index
    })
  );
}

function renderedMessageIds(): number[] {
  const call = messageMocks.renderProfileMessages.mock.calls.at(-1);
  const messages = (call?.[1] || []) as MessageRecord[];
  return messages.map((message) => Number(message.messageId?.replace('message-', '')));
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, index) => start + index);
}

function setScrollMetrics(
  element: HTMLElement,
  { clientHeight, scrollHeight }: { clientHeight: number; scrollHeight: number }
): void {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight
  });
}

function createMessage({
  includeAuthorName = true
}: {
  includeAuthorName?: boolean;
} = {}): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.innerHTML = `
    <button id="author-photo"></button>
    ${includeAuthorName ? '<span id="author-name">@ViewerOne</span>' : ''}
    <span id="message">hello</span>
  `;
  return message;
}

function createRect(overrides: Partial<DOMRect>): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: overrides.left ?? 0,
    y: overrides.top ?? 0,
    toJSON: () => ({}),
    ...overrides
  } as DOMRect;
}

function createPointerEvent(
  type: string,
  options: {
    clientX: number;
    clientY: number;
    pointerId: number;
  }
): Event {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  });
  Object.defineProperties(event, {
    clientX: { value: options.clientX },
    clientY: { value: options.clientY },
    pointerId: { value: options.pointerId }
  });
  return event;
}
