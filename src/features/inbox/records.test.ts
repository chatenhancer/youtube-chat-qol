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

  it('skips unreadable messages and preserves explicit mention handles', () => {
    const emptyMessage = document.createElement('yt-live-chat-text-message-renderer');
    const getMentionHandles = vi.fn(() => ['@FallbackViewer']);

    expect(createInboxRecord(emptyMessage, {
      mention: true
    }, {
      getMentionHandles,
      sourceUrl: 'https://www.youtube.com/watch?v=stream'
    })).toBeNull();

    const record = createInboxRecord(createMessage(), {
      keywords: ['launch', 'launch'],
      mention: true,
      mentionHandles: ['@ExplicitViewer']
    }, {
      getMentionHandles,
      sourceUrl: 'https://www.youtube.com/watch?v=stream'
    });

    expect(record?.matchedKeywords).toEqual(['launch']);
    expect(record?.mentionHandles).toEqual(['@ExplicitViewer']);
    expect(getMentionHandles).not.toHaveBeenCalled();
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

function createMessage(): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.setAttribute('data-message-id', 'message-1');
  message.innerHTML = `
    <a href="/channel/example-channel"><span id="author-name">@ExampleUser</span></a>
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
