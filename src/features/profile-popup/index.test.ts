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
  getRecentMessagesForIdentity: vi.fn(() => profileTestState.recentMessages),
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
  renderProfileMessages: vi.fn((list: HTMLElement, messages: MessageRecord[]) => {
    list.textContent = messages.map((message) => message.text).join('\n');
  }),
  shouldRefreshProfileMessages: vi.fn(() => true)
}));

const positioningMocks = vi.hoisted(() => ({
  keepProfileCardInViewport: vi.fn(),
  positionProfileCard: vi.fn()
}));

const channelMocks = vi.hoisted(() => ({
  getChannelUrl: vi.fn((_channelId?: string, authorName?: string) => `https://www.youtube.com/${authorName}`),
  openChannelWindow: vi.fn()
}));

const replyMocks = vi.hoisted(() => ({
  mentionAuthorName: vi.fn()
}));

const markedUserMocks = vi.hoisted(() => ({
  applyMarkedUserRing: vi.fn(),
  createMarkedUserToggleButton: vi.fn(() => {
    const button = document.createElement('button');
    button.className = 'ytcq-marked-user-toggle';
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
vi.mock('../marked-users', () => markedUserMocks);
vi.mock('../translation/queue', () => queueMocks);

import {
  cleanupStaleProfilePopupSurfaces,
  closeProfileCard,
  openProfileCardForIdentity,
  wireParticipantProfileClick,
  wireProfileClick
} from './index';
import { suspendFeatures } from '../../content/lifecycle';

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
    expect(positioningMocks.positionProfileCard).toHaveBeenCalledWith(card, avatar);
    expect(markedUserMocks.applyMarkedUserRing).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      {
        authorName: '@ViewerOne',
        avatarUrl: 'https://example.com/avatar.jpg',
        channelId: 'viewer-channel'
      }
    );
    expect(card.querySelector('.ytcq-marked-user-toggle')).not.toBeNull();

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

    expect(channelMocks.openChannelWindow).toHaveBeenCalledWith('https://www.youtube.com/@ViewerOne');
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

    expect(openProfileCardForIdentity({ authorName: '@ViewerOne', channelId: 'viewer-channel' })).toBe(true);
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
    const firstCard = document.querySelector<HTMLElement>('.ytcq-profile-card:not(.ytcq-inbox-card)')!;
    const firstHeader = firstCard.querySelector<HTMLElement>('.ytcq-profile-card-header')!;
    firstHeader.dispatchEvent(createPointerEvent('pointerdown', {
      clientX: 120,
      clientY: 40,
      pointerId: 3
    }));
    document.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 180,
      clientY: 80,
      pointerId: 3
    }));
    document.dispatchEvent(createPointerEvent('pointerup', {
      clientX: 180,
      clientY: 80,
      pointerId: 3
    }));
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
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue(createRect({
      bottom: 200,
      height: 180,
      left: 100,
      right: 400,
      top: 20,
      width: 300
    }));
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

    document.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 2_000,
      clientY: -100,
      pointerId: 7
    }));
    expect(card.style.left).toBe('292px');
    expect(card.style.top).toBe('8px');

    document.dispatchEvent(createPointerEvent('pointerup', {
      clientX: 2_000,
      clientY: -100,
      pointerId: 7
    }));
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
    expect(openProfileCardForIdentity({ authorName: '@ViewerOne', channelId: 'viewer-channel' })).toBe(true);
    expect(historyMocks.recordVisibleUserMessages).toHaveBeenCalled();
    expect(document.querySelector('.ytcq-profile-card')?.textContent).toContain('hello from history');

    profileTestState.recentMessages = [record({ text: 'updated history' })];
    profileTestState.userMessagesChanged?.('channel:viewer-channel');

    expect(messageMocks.renderProfileMessages).toHaveBeenCalledWith(expect.any(HTMLElement), profileTestState.recentMessages, expect.any(Object), expect.any(Function));

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

  it('repositions on resize and closes when the anchor disconnects', async () => {
    vi.useFakeTimers();
    const message = createMessage();
    document.body.append(message);
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    wireProfileClick(message);
    avatar.click();
    await vi.runOnlyPendingTimersAsync();

    window.dispatchEvent(new Event('resize'));
    await vi.runOnlyPendingTimersAsync();
    expect(positioningMocks.positionProfileCard).toHaveBeenCalledWith(expect.any(HTMLElement), avatar);

    avatar.remove();
    window.dispatchEvent(new Event('resize'));
    await vi.runOnlyPendingTimersAsync();
    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
  });

  it('keeps the card in view after resize observer updates and closes if the anchor disappears', async () => {
    vi.useFakeTimers();
    const message = createMessage();
    document.body.append(message);
    const avatar = message.querySelector<HTMLElement>('#author-photo')!;
    wireProfileClick(message);
    avatar.click();

    resizeObserverCallbacks.at(-1)?.([], {} as ResizeObserver);
    await vi.runOnlyPendingTimersAsync();
    expect(positioningMocks.keepProfileCardInViewport).toHaveBeenCalledWith(expect.any(HTMLElement));

    avatar.remove();
    resizeObserverCallbacks.at(-1)?.([], {} as ResizeObserver);
    await vi.runOnlyPendingTimersAsync();
    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
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
    text: 'hello from history',
    timestamp: 1,
    timestampText: '9:30 PM',
    ...overrides
  };
}

function createMessage({ includeAuthorName = true }: {
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

function createPointerEvent(type: string, options: {
  clientX: number;
  clientY: number;
  pointerId: number;
}): Event {
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
