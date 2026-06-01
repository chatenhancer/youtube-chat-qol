import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageRecord } from '../user-message-history';
import type { ProfileSource } from './types';

const userHistoryMocks = vi.hoisted(() => ({
  getLiveMessageForRecord: vi.fn(),
  getRecentMessagesForKey: vi.fn()
}));

const jumpMocks = vi.hoisted(() => ({
  createJumpToMessageIcon: vi.fn(() => document.createElement('svg')),
  jumpToChatMessage: vi.fn()
}));

const replyMocks = vi.hoisted(() => ({
  quoteAuthorRichText: vi.fn()
}));

vi.mock('../user-message-history', () => userHistoryMocks);
vi.mock('../message-jump', () => jumpMocks);
vi.mock('../reply', () => replyMocks);

import { renderProfileMessages, shouldRefreshProfileMessages } from './messages';

describe('profile card message renderer', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('renders an empty centered state when there are no recent messages', () => {
    const list = document.createElement('div');

    renderProfileMessages(list, [], source(), vi.fn());

    expect(list.querySelector('.ytcq-profile-card-empty-centered')?.textContent).toBe('No recent messages');
  });

  it('renders recent messages with quote and keyboard interactions', () => {
    const list = document.createElement('div');
    const onClose = vi.fn();
    const recentMessage = record({
      authorName: '@ViewerOne',
      text: 'hello from chat'
    });

    renderProfileMessages(list, [recentMessage], source(), onClose);
    const item = list.querySelector<HTMLElement>('.ytcq-profile-card-message')!;

    expect(item.getAttribute('role')).toBe('button');
    expect(item.querySelector('time')?.textContent).toBe('9:30 PM');
    expect(item.querySelector('.ytcq-profile-card-message-text')?.textContent).toBe('hello from chat');

    item.click();
    expect(replyMocks.quoteAuthorRichText).toHaveBeenCalledWith('@ViewerOne', 'hello from chat', {
      segments: []
    }, {
      focusSource: {
        authorName: '@FocusedUser',
        avatarSrc: 'https://example.com/focused.jpg',
        channelId: 'focused-channel'
      }
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('adds a jump button when the live message renderer is still connected', () => {
    const list = document.createElement('div');
    const liveMessage = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(liveMessage);
    userHistoryMocks.getLiveMessageForRecord.mockReturnValue(liveMessage);
    const recentMessage = record();

    renderProfileMessages(list, [recentMessage], source(), vi.fn());
    const jumpButton = list.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!;
    jumpButton.click();

    expect(jumpButton.title).toBe('Jump to message');
    expect(jumpMocks.jumpToChatMessage).toHaveBeenCalledWith(liveMessage);
  });

  it('refreshes when records for the same profile key or author name change', () => {
    expect(shouldRefreshProfileMessages('channel:focused-channel', source(), 'channel:focused-channel')).toBe(true);

    userHistoryMocks.getRecentMessagesForKey.mockReturnValue([record({
      authorName: '@FocusedUser'
    })]);
    expect(shouldRefreshProfileMessages('author:fallback', source(), 'channel:focused-channel')).toBe(true);

    userHistoryMocks.getRecentMessagesForKey.mockReturnValue([record({
      authorName: '@SomeoneElse'
    })]);
    expect(shouldRefreshProfileMessages('author:other', source(), 'channel:focused-channel')).toBe(false);
  });
});

function source(): ProfileSource {
  return {
    authorName: '@FocusedUser',
    avatarSrc: 'https://example.com/focused.jpg',
    identity: {
      channelId: 'focused-channel'
    },
    profileUrl: 'https://www.youtube.com/@FocusedUser'
  };
}

function record(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    authorName: '@ViewerOne',
    contentParts: [],
    id: 1,
    messageId: 'message-1',
    text: 'hello',
    timestamp: new Date('2026-05-31T21:30:00Z').getTime(),
    timestampText: '9:30 PM',
    ...overrides
  };
}
