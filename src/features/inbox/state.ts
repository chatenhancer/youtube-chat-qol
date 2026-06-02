/**
 * Inbox state store.
 *
 * Owns loaded records, watched keywords, read state, persistence, and prepared
 * keyword caches for the current chat page.
 */
import {
  getCurrentMentionCandidates
} from '../mention-detection';
import {
  findMatchingRecordIndex,
  getKeywordValuesKey,
  getMatchingPreparedKeywords,
  getMatchedMentionHandles as getMatchedMentionHandlesFromCandidates,
  getPreparedKeywordsKey,
  keywordsEqual,
  MAX_INBOX_KEYWORDS,
  normalizeKeyword,
  prepareKeywords,
  type PreparedKeyword
} from './matching';
import {
  hasTransientRecordUpdate,
  mergeInboxRecords,
  recordsEqual
} from './records';
import { getCurrentYouTubeChatSourceUrl } from '../../youtube/source-url';
import {
  loadInboxStoredState,
  saveInboxKeywords as saveInboxKeywordsToStorage,
  saveInboxRecords as saveInboxRecordsToStorage,
  sortAndTrimRecords
} from './storage';
import type { InboxRecord, LatestInboxRecord } from './types';

export interface InboxRecordUpsertResult {
  changed: boolean;
  transientChanged: boolean;
}

let records: InboxRecord[] = [];
let keywords: string[] = [];
let preparedKeywords: PreparedKeyword[] = [];
let preparedKeywordsKey = '';
let inboxStateLoaded = false;
let inboxStateLoadPromise: Promise<void> | null = null;

export function isInboxStateLoaded(): boolean {
  return inboxStateLoaded;
}

export function loadInboxState(): Promise<void> {
  if (inboxStateLoaded) return Promise.resolve();
  if (inboxStateLoadPromise) return inboxStateLoadPromise;

  inboxStateLoadPromise = loadInboxStoredState(getCurrentYouTubeChatSourceUrl()).then((stored) => {
    records = stored.records;
    keywords = stored.keywords;
    refreshPreparedKeywords();
    inboxStateLoaded = true;
  });

  return inboxStateLoadPromise;
}

export function resetInboxStore(): void {
  records = [];
  keywords = [];
  preparedKeywords = [];
  preparedKeywordsKey = '';
  inboxStateLoaded = true;
  inboxStateLoadPromise = null;
}

export function getInboxRecordsSnapshot(): InboxRecord[] {
  return [...records];
}

export function getInboxKeywordsSnapshot(): string[] {
  return [...keywords];
}

export async function getLatestInboxRecord(): Promise<LatestInboxRecord | null> {
  await loadInboxState();
  const record = records[records.length - 1];
  return record ? {
    authorName: record.authorName,
    text: record.text
  } : null;
}

export async function getLatestMentionInboxRecord(): Promise<LatestInboxRecord | null> {
  await loadInboxState();
  const record = [...records].reverse().find((candidate) => candidate.mention);
  return record ? {
    authorName: record.authorName,
    text: record.text
  } : null;
}

export async function getInboxKeywords(): Promise<string[]> {
  await loadInboxState();
  return getInboxKeywordsSnapshot();
}

export function getLoadedInboxKeywords(): string[] {
  return inboxStateLoaded ? getInboxKeywordsSnapshot() : [];
}

export function addInboxKeywordsToState(values: string[]): {
  added: string[];
  duplicates: string[];
} {
  const added: string[] = [];
  const duplicates: string[] = [];

  values.forEach((value) => {
    const keyword = normalizeKeyword(value);
    if (!keyword) return;
    if (
      keywords.some((existing) => keywordsEqual(existing, keyword)) ||
      added.some((existing) => keywordsEqual(existing, keyword))
    ) {
      duplicates.push(keyword);
      return;
    }

    added.push(keyword);
  });

  if (!added.length) return { added, duplicates };

  keywords = [...keywords, ...added].slice(-MAX_INBOX_KEYWORDS);
  refreshPreparedKeywords();
  return { added, duplicates };
}

export function removeInboxKeywordsFromState(values: string[]): {
  missing: string[];
  removed: string[];
} {
  const removed: string[] = [];
  const missing: string[] = [];
  const nextKeywords = [...keywords];

  values.forEach((value) => {
    const keyword = normalizeKeyword(value);
    if (!keyword) return;

    const index = nextKeywords.findIndex((existing) => keywordsEqual(existing, keyword));
    if (index < 0) {
      missing.push(keyword);
      return;
    }

    removed.push(nextKeywords[index]);
    nextKeywords.splice(index, 1);
  });

  if (!removed.length) return { missing, removed };

  keywords = nextKeywords;
  refreshPreparedKeywords();
  return { missing, removed };
}

export function clearInboxRecords(): void {
  records = [];
}

export function markInboxRecordsRead(): boolean {
  if (!records.some((record) => !record.read)) return false;

  records = sortAndTrimRecords(records.map((record) => ({ ...record, read: true })));
  return true;
}

export function getUnreadInboxCount(): number {
  return records.reduce((count, record) => count + (record.read ? 0 : 1), 0);
}

export function upsertInboxRecord(incoming: InboxRecord, isReadNow: boolean): InboxRecordUpsertResult {
  const existingIndex = findMatchingRecordIndex(records, incoming);

  if (existingIndex >= 0) {
    const existing = records[existingIndex];
    const merged = mergeInboxRecords(existing, incoming, isReadNow, getLiveInboxMessage);
    const transientChanged = hasTransientRecordUpdate(existing, merged, getLiveInboxMessage);
    const changed = !recordsEqual(existing, merged);
    if (changed || transientChanged) {
      records[existingIndex] = merged;
    }
    return { changed, transientChanged };
  }

  records.push(incoming);
  records = sortAndTrimRecords(records);
  return {
    changed: true,
    transientChanged: false
  };
}

export function getLiveInboxMessage(record: InboxRecord): HTMLElement | null {
  const message = record.messageRef?.deref() || null;
  return message?.isConnected ? message : null;
}

export function saveInboxRecords(): Promise<void> {
  records = sortAndTrimRecords(records);
  return saveInboxRecordsToStorage(records, getCurrentYouTubeChatSourceUrl());
}

export function saveInboxKeywords(): Promise<void> {
  return saveInboxKeywordsToStorage(keywords);
}

export function getMatchedMentionHandles(text: string): string[] {
  return getMatchedMentionHandlesFromCandidates(text, getCurrentMentionCandidates());
}

export function getMatchingKeywords(...values: string[]): string[] {
  return getMatchingPreparedKeywords(values, preparedKeywords);
}

export function getKeywordCheckKeyFromValues(values: string[]): string {
  return `${preparedKeywordsKey}\n${getKeywordValuesKey(values)}`;
}

function refreshPreparedKeywords(): void {
  preparedKeywords = prepareKeywords(keywords);
  preparedKeywordsKey = getPreparedKeywordsKey(preparedKeywords);
}
