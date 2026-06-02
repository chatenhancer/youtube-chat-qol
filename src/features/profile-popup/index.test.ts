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
  getUserKeyFromIdentity: vi.fn(() => 'channel:viewer-channel'),
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
vi.mock('../translation/queue', () => queueMocks);

import {
  cleanupStaleProfilePopupSurfaces,
  closeProfileCard,
  openProfileCardForIdentity,
  wireParticipantProfileClick,
  wireProfileClick
} from './index';

describe('profile popup coordinator', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    profileTestState.recentMessages = [record()];
    profileTestState.messageSource = source();
    profileTestState.participantSource = source({ authorName: '@Participant' });
    profileTestState.userMessagesChanged = null;
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      value: class ResizeObserverMock {
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
    message.querySelector<HTMLElement>('#author-photo')!.click();

    cleanupStaleProfilePopupSurfaces();

    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
    expect(message.hasAttribute('data-ytcq-profile-wired')).toBe(false);
  });

  it('closes from the header button, outside click, and Escape', async () => {
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
    expect(document.querySelector('.ytcq-profile-card')).toBeNull();

    message.querySelector<HTMLElement>('#author-photo')!.click();
    await vi.runOnlyPendingTimersAsync();
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    expect(document.querySelector('.ytcq-profile-card')).toBeNull();
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

function createMessage(): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.innerHTML = `
    <button id="author-photo"></button>
    <span id="author-name">@ViewerOne</span>
    <span id="message">hello</span>
  `;
  return message;
}
