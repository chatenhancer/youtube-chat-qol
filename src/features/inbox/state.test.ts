import { beforeEach, describe, expect, it } from 'vitest';
import {
  addInboxKeywordsToState,
  clearInboxRecords,
  getInboxKeywordsSnapshot,
  getInboxRecordsSnapshot,
  getKeywordCheckKeyFromValues,
  getLatestInboxRecord,
  getLatestMentionInboxRecord,
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

  it('tracks unread records and can mark all read', () => {
    upsertInboxRecord(record({ id: 'old', read: false, timestamp: 1 }), false);
    upsertInboxRecord(record({ id: 'new', read: true, timestamp: 2 }), true);

    expect(getUnreadInboxCount()).toBe(1);
    expect(markInboxRecordsRead()).toBe(true);
    expect(getUnreadInboxCount()).toBe(0);
    expect(markInboxRecordsRead()).toBe(false);
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
