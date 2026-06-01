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

  it('opens by identity from recent history and refreshes when matching history changes', () => {
    expect(openProfileCardForIdentity({ authorName: '@ViewerOne', channelId: 'viewer-channel' })).toBe(true);
    expect(historyMocks.recordVisibleUserMessages).toHaveBeenCalled();
    expect(document.querySelector('.ytcq-profile-card')?.textContent).toContain('hello from history');

    profileTestState.recentMessages = [record({ text: 'updated history' })];
    profileTestState.userMessagesChanged?.('channel:viewer-channel');

    expect(messageMocks.renderProfileMessages).toHaveBeenCalledWith(expect.any(HTMLElement), profileTestState.recentMessages, expect.any(Object), expect.any(Function));

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
