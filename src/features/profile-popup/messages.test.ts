import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import type { MessageRecord } from '../user-message-history';
import type { ProfileSource } from './types';

const userHistoryMocks = vi.hoisted(() => ({
  getLiveMessageForRecord: vi.fn(),
  getRecentMessagesForKey: vi.fn(),
  getUserMessagesForIdentity: vi.fn()
}));

const jumpMocks = vi.hoisted(() => ({
  canJumpToChatMessage: vi.fn(),
  createJumpToMessageIcon: vi.fn(() => document.createElement('svg')),
  jumpToChatMessage: vi.fn()
}));

const replyMocks = vi.hoisted(() => ({
  quoteAuthorRichText: vi.fn()
}));

const bookmarkMocks = vi.hoisted(() => ({
  createBookmarkToggleButton: vi.fn(() => {
    const button = document.createElement('button');
    button.className = 'ytcq-bookmark-toggle';
    return button;
  })
}));

vi.mock('../user-message-history', () => userHistoryMocks);
vi.mock('../message-jump', () => jumpMocks);
vi.mock('../reply', () => replyMocks);
vi.mock('../bookmarks', () => bookmarkMocks);

import { renderProfileMessages, shouldRefreshProfileMessages } from './messages';

describe('profile card message renderer', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
    jumpMocks.canJumpToChatMessage.mockImplementation(
      (target: HTMLElement | null) => Boolean(target?.isConnected)
    );
    userHistoryMocks.getUserMessagesForIdentity.mockImplementation(
      (identity: { authorName?: string }) =>
        identity.authorName?.toLowerCase() === '@otherviewer'
          ? [record({ authorName: '@OtherViewer', channelId: 'other-channel' })]
          : []
    );
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
    expect(item.querySelector<HTMLElement>('.ytcq-profile-card-message-text')?.dir).toBe('auto');
    expect(item.querySelector('.ytcq-profile-card-message-text')?.textContent).toBe('hello from chat');
    expect(item.querySelector('.ytcq-profile-card-message-actions .ytcq-bookmark-toggle')).not.toBeNull();
    expect(bookmarkMocks.createBookmarkToggleButton).toHaveBeenCalledWith(recentMessage);

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

  it('marks the feed-origin message within a rendered history batch', () => {
    const list = document.createElement('div');
    const messages = [record(), record({ id: 2, messageId: 'message-2' })];

    renderProfileMessages(list, messages, source(), vi.fn(), 2);

    const items = list.querySelectorAll<HTMLElement>('.ytcq-profile-card-message');
    expect(items[0]?.classList.contains('ytcq-profile-card-message-origin')).toBe(false);
    expect(items[1]?.classList.contains('ytcq-profile-card-message-origin')).toBe(true);
  });

  it('makes mentioned handles clickable inside recent-message rows', () => {
    const list = document.createElement('div');

    renderProfileMessages(
      list,
      [record({ text: 'Ask @OtherViewer, not @MissingViewer.' })],
      source(),
      vi.fn()
    );

    const mention = list.querySelector<HTMLElement>('.ytcq-profile-mention');
    expect(mention?.textContent).toBe('@OtherViewer');
    expect(mention?.dir).toBe('auto');
    expect(mention?.dataset.ytcqProfileMention).toBe('@OtherViewer');
    expect(list.querySelectorAll('.ytcq-profile-mention')).toHaveLength(1);
    expect(list.textContent).toContain('@MissingViewer');
  });

  it('ignores profile message keyboard events from children or unrelated keys', () => {
    const list = document.createElement('div');
    const onClose = vi.fn();

    renderProfileMessages(list, [record({ messageId: '' })], source(), onClose);
    const item = list.querySelector<HTMLElement>('.ytcq-profile-card-message')!;
    const text = item.querySelector<HTMLElement>('.ytcq-profile-card-message-text')!;

    item.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    text.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));

    expect(item.dataset.ytcqMessageId).toBeUndefined();
    expect(replyMocks.quoteAuthorRichText).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
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

    text.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.click();

    expect(item.dataset.ytcqTranslationView).toBe('original');
    expect(text.textContent).toContain('hola');
    expect(text.title).toBe('Translated: hello');
    expect(replyMocks.quoteAuthorRichText).not.toHaveBeenCalled();

    text.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.click();

    expect(item.dataset.ytcqTranslationView).toBe('translated');
    expect(text.textContent).toContain('hello');
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
    expect(jumpMocks.jumpToChatMessage).toHaveBeenCalledWith(liveMessage, 'message-1');
  });

  it('keeps a jump button for a retained Lite message without a mounted row', () => {
    const list = document.createElement('div');
    userHistoryMocks.getLiveMessageForRecord.mockReturnValue(null);
    jumpMocks.canJumpToChatMessage.mockReturnValue(true);

    renderProfileMessages(list, [record()], source(), vi.fn());
    const item = list.querySelector<HTMLElement>('.ytcq-profile-card-message')!;
    const jumpButton = item.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!;
    jumpButton.click();

    expect(jumpMocks.canJumpToChatMessage).toHaveBeenCalledWith(null, 'message-1');
    expect(item.dataset.ytcqLiveMessageId).toBeUndefined();
    expect(jumpMocks.jumpToChatMessage).toHaveBeenCalledWith(null, 'message-1');
  });

  it('preserves jump-button focus when refreshed records replace the list', () => {
    const list = document.createElement('div');
    const liveMessage = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(list, liveMessage);
    userHistoryMocks.getLiveMessageForRecord.mockReturnValue(liveMessage);
    const recentMessage = record();

    renderProfileMessages(list, [recentMessage], source(), vi.fn());
    const previousJumpButton = list.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!;
    previousJumpButton.focus();

    renderProfileMessages(list, [recentMessage], source(), vi.fn());

    const currentJumpButton = list.querySelector<HTMLButtonElement>('.ytcq-profile-card-jump')!;
    expect(currentJumpButton).not.toBe(previousJumpButton);
    expect(document.activeElement).toBe(currentJumpButton);
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
