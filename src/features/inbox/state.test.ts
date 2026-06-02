import { beforeEach, describe, expect, it } from 'vitest';
import {
  addInboxKeywordsToState,
  clearInboxRecords,
  getInboxKeywordsSnapshot,
  getInboxRecordsSnapshot,
  getInboxKeywords,
  getKeywordCheckKeyFromValues,
  getLatestInboxRecord,
  getLatestMentionInboxRecord,
  getLiveInboxMessage,
  getLoadedInboxKeywords,
  getMatchingKeywords,
  getUnreadInboxCount,
  isInboxStateLoaded,
  markInboxRecordsRead,
  removeInboxKeywordsFromState,
  resetInboxStore,
  upsertInboxRecord
} from './state';
import type { InboxRecord } from './types';

describe('inbox state store', () => {
  beforeEach(() => {
    resetInboxStore();
  });

  it('starts as a loaded empty store after reset', () => {
    expect(isInboxStateLoaded()).toBe(true);
    expect(getInboxRecordsSnapshot()).toEqual([]);
    expect(getLoadedInboxKeywords()).toEqual([]);
    expect(getUnreadInboxCount()).toBe(0);
  });

  it('adds normalized keywords and reports duplicates', () => {
    const result = addInboxKeywordsToState([' Launch ', 'launch', 'status update']);

    expect(result).toEqual({
      added: ['Launch', 'status update'],
      duplicates: ['launch']
    });
    expect(getInboxKeywordsSnapshot()).toEqual(['Launch', 'status update']);
    expect(getMatchingKeywords('new launch soon')).toEqual(['Launch']);
    expect(getKeywordCheckKeyFromValues(['new launch soon'])).toContain('new launch soon');
  });

  it('ignores blank keyword additions and duplicate additions in one call', () => {
    const result = addInboxKeywordsToState([' ', 'Launch', 'launch', '\n']);

    expect(result).toEqual({
      added: ['Launch'],
      duplicates: ['launch']
    });
    expect(getInboxKeywordsSnapshot()).toEqual(['Launch']);
  });

  it('caps watched keywords to the newest maximum entries', () => {
    addInboxKeywordsToState(Array.from({ length: 32 }, (_, index) => `keyword-${index}`));

    expect(getInboxKeywordsSnapshot()).toHaveLength(30);
    expect(getInboxKeywordsSnapshot()[0]).toBe('keyword-2');
  });

  it('removes keywords and reports missing values', () => {
    addInboxKeywordsToState(['launch', 'status']);

    expect(removeInboxKeywordsFromState(['missing', 'launch'])).toEqual({
      missing: ['missing'],
      removed: ['launch']
    });
    expect(getInboxKeywordsSnapshot()).toEqual(['status']);
  });

  it('ignores blank keyword removals and leaves state unchanged when nothing is removed', () => {
    addInboxKeywordsToState(['launch']);

    expect(removeInboxKeywordsFromState([' ', 'missing'])).toEqual({
      missing: ['missing'],
      removed: []
    });
    expect(getInboxKeywordsSnapshot()).toEqual(['launch']);
  });

  it('tracks unread records and can mark all read', () => {
    upsertInboxRecord(record({ id: 'old', read: false, timestamp: 1 }), false);
    upsertInboxRecord(record({ id: 'new', read: true, timestamp: 2 }), true);

    expect(getUnreadInboxCount()).toBe(1);
    expect(markInboxRecordsRead()).toBe(true);
    expect(getUnreadInboxCount()).toBe(0);
    expect(markInboxRecordsRead()).toBe(false);
  });

  it('reports null latest command records when the inbox is empty', async () => {
    await expect(getLatestInboxRecord()).resolves.toBeNull();
    await expect(getLatestMentionInboxRecord()).resolves.toBeNull();
    await expect(getInboxKeywords()).resolves.toEqual([]);
  });

  it('merges matching records instead of duplicating them', () => {
    upsertInboxRecord(record({
      id: 'first',
      matchedKeywords: ['launch'],
      messageId: 'message-1',
      read: true
    }), true);

    const result = upsertInboxRecord(record({
      id: 'second',
      matchedKeywords: ['status'],
      mention: true,
      mentionHandles: ['@CurrentViewer'],
      messageId: 'message-1',
      read: false
    }), false);

    expect(result.changed).toBe(true);
    expect(getInboxRecordsSnapshot()).toHaveLength(1);
    expect(getInboxRecordsSnapshot()[0]).toMatchObject({
      id: 'first',
      matchedKeywords: ['launch', 'status'],
      mention: true,
      mentionHandles: ['@CurrentViewer'],
      read: false
    });
  });

  it('reports unchanged upserts when the matching record does not change', () => {
    const current = record({ messageId: 'message-1', read: true });
    upsertInboxRecord(current, true);

    expect(upsertInboxRecord(current, true)).toEqual({
      changed: false,
      transientChanged: false
    });
    expect(getInboxRecordsSnapshot()).toHaveLength(1);
  });

  it('returns latest inbox and mention records for commands', async () => {
    upsertInboxRecord(record({ authorName: '@KeywordUser', mention: false, timestamp: 1, text: 'keyword' }), false);
    upsertInboxRecord(record({ authorName: '@MentionUser', mention: true, timestamp: 2, text: 'mention' }), false);

    await expect(getLatestInboxRecord()).resolves.toEqual({
      authorName: '@MentionUser',
      text: 'mention'
    });
    await expect(getLatestMentionInboxRecord()).resolves.toEqual({
      authorName: '@MentionUser',
      text: 'mention'
    });
  });

  it('clears records without clearing watched keywords', () => {
    addInboxKeywordsToState(['launch']);
    upsertInboxRecord(record(), false);

    clearInboxRecords();

    expect(getInboxRecordsSnapshot()).toEqual([]);
    expect(getInboxKeywordsSnapshot()).toEqual(['launch']);
  });

  it('returns connected live messages and rejects stale live message refs', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(message);
    const withLiveMessage = record({ messageRef: new WeakRef(message) });
    const withoutLiveMessage = record();

    expect(getLiveInboxMessage(withLiveMessage)).toBe(message);
    message.remove();
    expect(getLiveInboxMessage(withLiveMessage)).toBeNull();
    expect(getLiveInboxMessage(withoutLiveMessage)).toBeNull();
  });
});

function record(overrides: Partial<InboxRecord> = {}): InboxRecord {
  return {
    id: 'record',
    authorName: '@ExampleUser',
    contentParts: [],
    matchedKeywords: [],
    mention: false,
    mentionHandles: [],
    messageId: '',
    read: false,
    sourceUrl: 'https://www.youtube.com/watch?v=stream',
    text: 'hello',
    timestamp: 1_000,
    timestampText: '10:00 PM',
    ...overrides
  };
}
