import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadInboxStoredState,
  saveInboxRecords,
  serializeInboxRecord,
  sortAndTrimRecords
} from './storage';
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

  it('serializes records without live DOM references', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const serialized = serializeInboxRecord(createRecord({
      messageRef: new WeakRef(message),
      messageId: 'message-1'
    }));

    expect('messageRef' in serialized).toBe(false);
    expect(serialized.messageId).toBe('message-1');
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
