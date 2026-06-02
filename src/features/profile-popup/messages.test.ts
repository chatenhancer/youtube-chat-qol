import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
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
    setOptions({
      ...DEFAULT_OPTIONS,
      targetLanguage: 'en',
      translationDisplay: 'below'
    });
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

    const nextClose = vi.fn();
    renderProfileMessages(list, [recentMessage], source(), nextClose);
    list.querySelector<HTMLElement>('.ytcq-profile-card-message')!
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    expect(nextClose).toHaveBeenCalledOnce();
  });

  it('renders inline translations that match the active target language', () => {
    const list = document.createElement('div');

    renderProfileMessages(list, [record({
      text: 'hola',
      translation: {
        originalText: 'hola',
        protectedTokens: [],
        result: {
          sourceLanguage: 'es',
          targetLanguage: 'en',
          text: 'hello'
        },
        sourceText: 'hola'
      }
    })], source(), vi.fn());

    expect(list.querySelector('.ytcq-translation')?.textContent).toContain('hello');
  });

  it('renders replaced translations when replace display mode is selected', () => {
    setOptions({
      ...DEFAULT_OPTIONS,
      targetLanguage: 'en',
      translationDisplay: 'replace'
    });
    const list = document.createElement('div');

    renderProfileMessages(list, [record({
      text: 'hola',
      translation: {
        originalText: 'hola',
        protectedTokens: [],
        result: {
          sourceLanguage: 'es',
          targetLanguage: 'en',
          text: 'hello'
        },
        sourceText: 'hola'
      }
    })], source(), vi.fn());

    const item = list.querySelector<HTMLElement>('.ytcq-profile-card-message')!;
    const text = list.querySelector<HTMLElement>('.ytcq-profile-card-message-text')!;
    expect(item.classList.contains('ytcq-translation-replaced')).toBe(true);
    expect(text.lang).toBe('en');
    expect(text.textContent).toContain('hello');
    expect(text.title).toContain('hola');
  });

  it('hides stale or unchanged profile translations', () => {
    const list = document.createElement('div');

    renderProfileMessages(list, [
      record({
        text: 'hola',
        translation: {
          originalText: 'hola',
          protectedTokens: [],
          result: {
            sourceLanguage: 'es',
            targetLanguage: 'ja',
            text: 'こんにちは'
          },
          sourceText: 'hola'
        }
      }),
      record({
        id: 2,
        messageId: 'message-2',
        text: 'same',
        translation: {
          originalText: 'same',
          protectedTokens: [],
          result: {
            sourceLanguage: 'en',
            targetLanguage: 'en',
            text: 'same'
          },
          sourceText: 'same'
        }
      })
    ], source(), vi.fn());

    expect(list.querySelector('.ytcq-translation')).toBeNull();
    expect(list.textContent).toContain('hola');
    expect(list.textContent).toContain('same');
  });

  it('adds a jump button when the live message renderer is still connected', () => {
    const list = document.createElement('div');
    const liveMessage = document.createElement('yt-live-chat-text-message-renderer');
    liveMessage.id = 'live-message-1';
    document.body.append(liveMessage);
    userHistoryMocks.getLiveMessageForRecord.mockReturnValue(liveMessage);
    const recentMessage = record();

    renderProfileMessages(list, [recentMessage], source(), vi.fn());
    const item = list.querySelector<HTMLElement>('.ytcq-profile-card-message')!;
    const jumpButton = list.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!;
    jumpButton.click();

    expect(item.dataset.ytcqMessageRecordId).toBe('1');
    expect(item.dataset.ytcqMessageId).toBe('message-1');
    expect(item.dataset.ytcqLiveMessageId).toBe('live-message-1');
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
    expect(shouldRefreshProfileMessages('author:empty', { ...source(), authorName: '' }, 'channel:focused-channel')).toBe(false);
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
