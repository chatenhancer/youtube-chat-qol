import { describe, expect, it } from 'vitest';
import {
  createInboxRecordFromChatFeed,
  hasTransientRecordUpdate,
  mergeInboxRecords,
  recordsEqual
} from './records';
import type { YouTubeChatMessageRecord } from '../../youtube/chat-feed/protocol';
import type { InboxRecord } from './types';

describe('inbox records', () => {
  it('creates rich live Inbox records from normalized feed messages', () => {
    const sourceRecord: YouTubeChatMessageRecord = {
      author: {
        avatarUrl: 'https://example.test/feed-avatar.jpg',
        badges: [],
        channelId: 'feed-channel',
        name: '@FeedUser'
      },
      id: 'feed-live-1',
      kind: 'text',
      plainText: 'hello @CurrentViewer 🚀',
      runs: [
        { text: 'hello @CurrentViewer ', type: 'text' },
        {
          alt: '🚀',
          emojiId: 'rocket',
          imageUrl: 'https://example.test/feed-rocket.png',
          shortcuts: [':rocket:'],
          type: 'emoji'
        }
      ],
      timestampText: '10:30 PM',
      timestampUsec: '1780317000123000'
    };

    const record = createInboxRecordFromChatFeed(sourceRecord, {
      keywords: ['launch'],
      mention: true,
      mentionHandles: ['@CurrentViewer']
    }, {
      receivedAt: 1_780_318_000_000,
      source: 'live',
      sourceUrl: 'https://www.youtube.com/watch?v=stream'
    });

    expect(record).toMatchObject({
      authorName: '@FeedUser',
      avatarSrc: 'https://example.test/feed-avatar.jpg',
      channelId: 'feed-channel',
      id: 'feed:feed-live-1',
      matchedKeywords: ['launch'],
      mention: true,
      mentionHandles: ['@CurrentViewer'],
      messageId: 'feed-live-1',
      read: false,
      sourceUrl: 'https://www.youtube.com/watch?v=stream',
      text: 'hello @CurrentViewer 🚀',
      timestamp: 1_780_317_000_123,
      timestampText: '10:30 PM'
    });
    expect(record?.contentParts).toEqual([
      { text: 'hello @CurrentViewer ', type: 'text' },
      {
        alt: '🚀',
        className: 'emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer',
        emojiId: 'rocket',
        src: 'https://example.test/feed-rocket.png',
        tooltip: ':rocket:',
        type: 'emoji'
      }
    ]);
  });

  it('derives replay timestamps from the replay offset instead of live wall-clock metadata', () => {
    const receivedAt = new Date('2026-06-01T12:34:56Z').getTime();
    const replayDay = new Date(receivedAt);
    replayDay.setHours(0, 0, 0, 0);
    const sourceRecord: YouTubeChatMessageRecord = {
      author: {
        badges: [],
        name: '@ReplayUser'
      },
      id: 'feed-replay-1',
      kind: 'text',
      plainText: 'replay hello 👋',
      runs: [
        { text: 'replay hello ', type: 'text' },
        {
          alt: '👋',
          imageUrl: 'https://example.test/feed-wave.png',
          shortcuts: [':wave:'],
          type: 'emoji'
        }
      ],
      timestampUsec: '1780317000123000'
    };

    const record = createInboxRecordFromChatFeed(sourceRecord, {
      mention: false
    }, {
      receivedAt,
      replayOffsetMs: 3_723_999,
      source: 'replay',
      sourceUrl: 'https://www.youtube.com/watch?v=replay'
    });

    expect(record).toMatchObject({
      authorName: '@ReplayUser',
      id: 'feed:feed-replay-1',
      messageId: 'feed-replay-1',
      sourceUrl: 'https://www.youtube.com/watch?v=replay',
      text: 'replay hello 👋',
      timestamp: replayDay.getTime() + 3_723_000,
      timestampText: '1:02:03'
    });
    expect(record?.contentParts).toEqual([
      { text: 'replay hello ', type: 'text' },
      {
        alt: '👋',
        className: 'emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer',
        emojiId: '',
        src: 'https://example.test/feed-wave.png',
        tooltip: ':wave:',
        type: 'emoji'
      }
    ]);
  });

  it('merges mention and keyword matches for the same saved message', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const existing = record({
      matchedKeywords: ['launch'],
      mention: false,
      read: true
    });
    const incoming = record({
      matchedKeywords: ['status'],
      mention: true,
      mentionHandles: ['@CurrentViewer'],
      messageId: 'message-1',
      messageRef: new WeakRef(message)
    });

    const merged = mergeInboxRecords(existing, incoming, false, (candidate) => candidate.messageRef?.deref() || null);

    expect(merged).toMatchObject({
      matchedKeywords: ['launch', 'status'],
      mention: true,
      mentionHandles: ['@CurrentViewer'],
      messageId: 'message-1',
      read: false
    });
    expect(merged.messageRef?.deref()).toBe(message);
  });

  it('preserves existing stored metadata and read state for already-read updates', () => {
    const existingMessage = document.createElement('yt-live-chat-text-message-renderer');
    const existing = record({
      avatarSrc: 'https://example.test/existing-avatar.jpg',
      channelId: 'existing-channel',
      contentParts: [{ type: 'text', text: 'existing rich content' }],
      matchedKeywords: ['launch'],
      mention: false,
      messageId: 'existing-message',
      messageRef: new WeakRef(existingMessage),
      read: true
    });
    const incoming = record({
      avatarSrc: 'https://example.test/incoming-avatar.jpg',
      channelId: 'incoming-channel',
      contentParts: [{ type: 'text', text: 'incoming rich content' }],
      matchedKeywords: ['status'],
      mention: true,
      messageId: 'incoming-message',
      messageRef: new WeakRef(document.createElement('yt-live-chat-text-message-renderer'))
    });

    const merged = mergeInboxRecords(existing, incoming, true, () => null);

    expect(merged.avatarSrc).toBe('https://example.test/existing-avatar.jpg');
    expect(merged.channelId).toBe('existing-channel');
    expect(merged.contentParts).toEqual([{ type: 'text', text: 'existing rich content' }]);
    expect(merged.messageId).toBe('existing-message');
    expect(merged.messageRef?.deref()).toBe(existingMessage);
    expect(merged.read).toBe(true);
  });

  it('keeps read state when a merge adds no new match', () => {
    const existing = record({
      matchedKeywords: ['launch'],
      mention: true,
      mentionHandles: ['@CurrentViewer'],
      read: true
    });
    const incoming = record({
      matchedKeywords: ['launch'],
      mention: true,
      mentionHandles: ['@CurrentViewer']
    });

    expect(mergeInboxRecords(existing, incoming, false, () => null).read).toBe(true);
  });

  it('compares stable record fields separately from transient live DOM refs', () => {
    const firstMessage = document.createElement('yt-live-chat-text-message-renderer');
    const secondMessage = document.createElement('yt-live-chat-text-message-renderer');
    const first = record({ messageRef: new WeakRef(firstMessage), read: true });
    const second = record({ messageRef: new WeakRef(secondMessage), read: true });

    expect(recordsEqual(first, second)).toBe(true);
    expect(hasTransientRecordUpdate(first, second, (candidate) => candidate.messageRef?.deref() || null)).toBe(true);
    expect(hasTransientRecordUpdate(first, first, (candidate) => candidate.messageRef?.deref() || null)).toBe(false);
    expect(recordsEqual(first, record({ avatarSrc: 'https://example.test/avatar.jpg', read: true }))).toBe(false);
    expect(recordsEqual(first, record({ channelId: 'example-channel', read: true }))).toBe(false);
    expect(recordsEqual(first, record({ messageId: 'other-message', read: true }))).toBe(false);
    expect(recordsEqual(first, record({ mention: true, read: true }))).toBe(false);
    expect(recordsEqual(first, record({ matchedKeywords: ['launch'], read: true }))).toBe(false);
    expect(recordsEqual(first, record({ mentionHandles: ['@Viewer'], read: true }))).toBe(false);
  });
});

function record(overrides: Partial<InboxRecord> = {}): InboxRecord {
  return {
    id: 'record-1',
    authorName: '@ExampleUser',
    contentParts: [],
    matchedKeywords: [],
    mention: false,
    mentionHandles: [],
    read: false,
    sourceUrl: 'https://www.youtube.com/watch?v=stream',
    text: 'hello',
    timestamp: 1_000,
    timestampText: '10:00 PM',
    ...overrides
  };
}
