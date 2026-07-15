import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadInboxStoredState,
  saveInboxKeywords,
  saveInboxRecords,
  serializeInboxRecord,
  sortAndTrimRecords
} from './storage';
import { getYouTubeChatSourceStorageKey } from '../../youtube/source-url';
import type { InboxRecord } from './types';

describe('inbox storage', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('scopes stored records per stream source', async () => {
    const sourceA = 'https://www.youtube.com/watch?v=stream-a';
    const sourceB = 'https://www.youtube.com/watch?v=stream-b';
    await saveInboxRecords([createRecord({ id: 'a', sourceUrl: sourceA })], sourceA);

    await expect(loadInboxStoredState(sourceA)).resolves.toMatchObject({
      records: [expect.objectContaining({ id: 'a', sourceUrl: sourceA })]
    });
    await expect(loadInboxStoredState(sourceB)).resolves.toMatchObject({
      records: []
    });
  });

  it('sorts records by timestamp and keeps the newest 100', () => {
    const records = Array.from({ length: 101 }, (_, index) => createRecord({
      id: `record-${index.toString().padStart(3, '0')}`,
      timestamp: index
    }));

    const sorted = sortAndTrimRecords(records.reverse());

    expect(sorted).toHaveLength(100);
    expect(sorted[0].id).toBe('record-001');
    expect(sorted.at(-1)?.id).toBe('record-100');
  });

  it('uses record ids as a stable tie-breaker when timestamps match', () => {
    const sorted = sortAndTrimRecords([
      createRecord({ id: 'b', timestamp: 1 }),
      createRecord({ id: 'a', timestamp: 1 })
    ]);

    expect(sorted.map((record) => record.id)).toEqual(['a', 'b']);
  });

  it('serializes records without live DOM references', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const serialized = serializeInboxRecord(createRecord({
      channelId: 'example-channel',
      messageRef: new WeakRef(message),
      messageId: 'message-1'
    }));

    expect('messageRef' in serialized).toBe(false);
    expect(serialized.avatarSrc).toBe(undefined);
    expect(serialized.channelId).toBe('example-channel');
    expect(serialized.messageId).toBe('message-1');
  });

  it('normalizes stored keywords and filters malformed stored records', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await chrome.storage.local.set({
      'ytcqInboxKeywords': [' Launch ', '', 'launch'],
      'ytcqInboxRecords:video:stream-a': [
        createRecord({ id: 'valid', sourceUrl, timestampText: '10:00 PM' }),
        createRecord({ id: '', sourceUrl }),
        'not a record',
        { ...createRecord({ id: 'bad-parts', sourceUrl }), contentParts: [] }
      ]
    });

    await expect(loadInboxStoredState(sourceUrl)).resolves.toMatchObject({
      keywords: ['Launch'],
      records: [expect.objectContaining({ id: 'valid' })]
    });
  });

  it('treats non-array stored record values as empty state', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await chrome.storage.local.set({
      ytcqInboxKeywords: 'not keywords',
      'ytcqInboxRecords:video:stream-a': { id: 'not-array' }
    });

    await expect(loadInboxStoredState(sourceUrl)).resolves.toEqual({
      keywords: [],
      records: []
    });
  });

  it('normalizes optional stored record fields and mention handle lists', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await chrome.storage.local.set({
      'ytcqInboxRecords:video:stream-a': [
        createRecord({
          avatarSrc: ' https://example.test/avatar.jpg ',
          channelId: ' example-channel ',
          matchedKeywords: [' Launch ', 'launch'],
          mentionHandles: [' @CurrentUser ', '@currentuser', ''],
          messageId: ' message-1 ',
          sourceUrl
        })
      ]
    });

    const stored = await loadInboxStoredState(sourceUrl);

    expect(stored.records[0]).toMatchObject({
      avatarSrc: 'https://example.test/avatar.jpg',
      channelId: 'example-channel',
      matchedKeywords: ['Launch'],
      mentionHandles: ['@CurrentUser'],
      messageId: 'message-1'
    });
  });

  it('uses replay elapsed timestamps for replay-scoped stored records', async () => {
    const sourceUrl = 'https://www.youtube.com/live_chat_replay?continuation=abc';
    const recordsStorageKey = `ytcqInboxRecords:${getYouTubeChatSourceStorageKey(sourceUrl)}`;
    await chrome.storage.local.set({
      [recordsStorageKey]: [
        createRecord({
          id: 'replay-record',
          sourceUrl,
          timestamp: new Date('2026-06-01T12:00:00Z').getTime(),
          timestampText: '0:30'
        })
      ]
    });

    const stored = await loadInboxStoredState(sourceUrl);
    const startOfDay = new Date('2026-06-01T12:00:00Z');
    startOfDay.setHours(0, 0, 0, 0);

    expect(stored.records[0].timestamp).toBe(startOfDay.getTime() + 30_000);
  });

  it('saves watched keywords separately from stream-scoped records', async () => {
    await saveInboxKeywords(['Launch', 'Status']);

    await expect(loadInboxStoredState('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      keywords: ['Launch', 'Status'],
      records: []
    });
  });

  it('falls back to stored timestamps when stored timestamp text cannot be parsed', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await chrome.storage.local.set({
      'ytcqInboxRecords:video:stream-a': [
        createRecord({ id: 'valid', sourceUrl, timestamp: 123_456, timestampText: 'not a timestamp' })
      ]
    });

    const stored = await loadInboxStoredState(sourceUrl);

    expect(stored.records[0].timestamp).toBe(123_456);
  });

});

function createRecord(overrides: Partial<InboxRecord> = {}): InboxRecord {
  return {
    id: 'record',
    authorName: '@ExampleUser',
    contentParts: [{ type: 'text', text: 'hello @currentuser' }],
    matchedKeywords: [],
    mention: true,
    mentionHandles: ['@currentuser'],
    read: false,
    sourceUrl: 'https://www.youtube.com/watch?v=stream',
    text: 'hello @currentuser',
    timestamp: 1_000,
    timestampText: '10:00 PM',
    ...overrides
  };
}
