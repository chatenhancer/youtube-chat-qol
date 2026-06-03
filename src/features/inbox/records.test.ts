import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createInboxRecord,
  hasTransientRecordUpdate,
  mergeInboxRecords,
  recordsEqual
} from './records';
import type { InboxRecord } from './types';

describe('inbox records', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates stored records from live YouTube message renderers', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);

    const message = createMessage();
    const record = createInboxRecord(message, {
      keywords: ['launch'],
      mention: true
    }, {
      getMentionHandles: () => ['@CurrentViewer'],
      sourceUrl: 'https://www.youtube.com/watch?v=stream'
    });

    expect(record).toMatchObject({
      authorName: '@ExampleUser',
      avatarSrc: 'https://example.test/avatar.jpg',
      channelId: 'example-channel',
      id: expect.stringMatching(/^\d+-4fzyo8$/),
      matchedKeywords: ['launch'],
      mention: true,
      mentionHandles: ['@CurrentViewer'],
      messageId: 'message-1',
      read: false,
      sourceUrl: 'https://www.youtube.com/watch?v=stream',
      text: 'hello @CurrentViewer 🚀',
      timestampText: '10:30 PM'
    });
    expect(record?.contentParts).toEqual([
      { type: 'text', text: 'hello @CurrentViewer ' },
      {
        type: 'emoji',
        alt: '🚀',
        className: 'emoji',
        emojiId: 'rocket',
        src: 'https://example.test/rocket.png',
        tooltip: ''
      }
    ]);
    expect(record?.messageRef?.deref()).toBe(message);
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
    expect(recordsEqual(first, record({ avatarSrc: 'https://example.test/avatar.jpg', read: true }))).toBe(false);
    expect(recordsEqual(first, record({ channelId: 'example-channel', read: true }))).toBe(false);
  });
});

function createMessage(): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
    data?: unknown;
  };
  message.data = {
    id: 'message-1',
    authorExternalChannelId: 'example-channel',
    authorName: { simpleText: '@ExampleUser' }
  };
  message.innerHTML = `
    <span id="author-name">@FallbackUser</span>
    <span id="author-photo"><img src="https://example.test/avatar.jpg"></span>
    <span id="timestamp">10:30 PM</span>
    <span id="message">hello @CurrentViewer <img class="emoji" alt="🚀" data-emoji-id="rocket" src="https://example.test/rocket.png"></span>
  `;
  return message;
}

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
