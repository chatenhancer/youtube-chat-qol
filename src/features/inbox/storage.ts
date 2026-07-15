/**
 * Inbox storage adapter.
 *
 * Serializes records and keywords to chrome.storage.local, scopes records per
 * stream, and preserves stable ordering for messages sharing a timestamp.
 */
import { cleanText } from '../../shared/text';
import { normalizeRichTextSegments } from '../../youtube/rich-text';
import { getYouTubeChatSourceStorageKey } from '../../youtube/source-url';
import { getChatTimestampValue, isLiveChatReplayUrl } from '../../youtube/timestamps';
import {
  normalizeMentionHandles,
  normalizeStoredKeywords
} from './matching';
import type { InboxRecord } from './types';

const INBOX_RECORDS_STORAGE_KEY_PREFIX = 'ytcqInboxRecords';
const INBOX_KEYWORDS_STORAGE_KEY = 'ytcqInboxKeywords';
const MAX_INBOX_RECORDS = 100;

export interface InboxStoredState {
  keywords: string[];
  records: InboxRecord[];
}

export function loadInboxStoredState(sourceUrl: string): Promise<InboxStoredState> {
  const recordsStorageKey = getInboxRecordsStorageKey(sourceUrl);

  return new Promise((resolve) => {
    chrome.storage.local.get({
      [recordsStorageKey]: [],
      [INBOX_KEYWORDS_STORAGE_KEY]: []
    }, (stored) => {
      const storedState = stored || {};
      const storedRecords = storedState[recordsStorageKey];
      resolve({
        records: normalizeStoredRecords(storedRecords),
        keywords: normalizeStoredKeywords(storedState[INBOX_KEYWORDS_STORAGE_KEY])
      });
    });
  });
}

export function saveInboxRecords(records: InboxRecord[], sourceUrl: string): Promise<void> {
  const sortedRecords = sortAndTrimRecords(records);
  const recordsStorageKey = getInboxRecordsStorageKey(sourceUrl);

  return new Promise((resolve) => {
    chrome.storage.local.set({
      [recordsStorageKey]: sortedRecords.map(serializeInboxRecord)
    }, resolve);
  });
}

export function saveInboxKeywords(keywords: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [INBOX_KEYWORDS_STORAGE_KEY]: keywords }, resolve);
  });
}

export function serializeInboxRecord(record: InboxRecord): Omit<InboxRecord, 'messageRef'> {
  return {
    id: record.id,
    authorName: record.authorName,
    avatarSrc: record.avatarSrc,
    channelId: record.channelId,
    contentParts: record.contentParts,
    matchedKeywords: record.matchedKeywords,
    mention: record.mention,
    mentionHandles: record.mentionHandles,
    messageId: record.messageId,
    read: record.read,
    sourceUrl: record.sourceUrl,
    text: record.text,
    timestamp: record.timestamp,
    timestampText: record.timestampText
  };
}

export function sortAndTrimRecords(nextRecords: InboxRecord[]): InboxRecord[] {
  return [...nextRecords]
    .sort((first, second) => first.timestamp - second.timestamp || first.id.localeCompare(second.id))
    .slice(-MAX_INBOX_RECORDS);
}

function normalizeStoredRecords(value: unknown): InboxRecord[] {
  if (!Array.isArray(value)) return [];

  const normalizedRecords = value
    .map(normalizeStoredRecord)
    .filter((record): record is InboxRecord => Boolean(record));

  return sortAndTrimRecords(normalizedRecords);
}

function normalizeStoredRecord(value: unknown): InboxRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<InboxRecord>;
  const id = cleanText(candidate.id);
  const authorName = cleanText(candidate.authorName);
  const text = cleanText(candidate.text);
  const timestampText = cleanText(candidate.timestampText);
  const sourceUrl = cleanText(candidate.sourceUrl);
  const storedTimestamp = Number(candidate.timestamp);
  const contentParts = normalizeRichTextSegments(candidate.contentParts);
  if (
    !id ||
    !authorName ||
    !text ||
    !timestampText ||
    !sourceUrl ||
    !Number.isFinite(storedTimestamp) ||
    !Array.isArray(candidate.contentParts) ||
    !contentParts.length ||
    !Array.isArray(candidate.matchedKeywords) ||
    !Array.isArray(candidate.mentionHandles) ||
    typeof candidate.mention !== 'boolean' ||
    typeof candidate.read !== 'boolean'
  ) {
    return null;
  }

  const timestamp = getChatTimestampValue(timestampText, storedTimestamp, {
    preferElapsed: isLiveChatReplayUrl(sourceUrl)
  }) ?? storedTimestamp;

  return {
    id,
    authorName,
    avatarSrc: cleanText(candidate.avatarSrc) || undefined,
    channelId: cleanText(candidate.channelId) || undefined,
    contentParts,
    matchedKeywords: normalizeStoredKeywords(candidate.matchedKeywords),
    mention: candidate.mention,
    mentionHandles: normalizeMentionHandles(candidate.mentionHandles),
    messageId: cleanText(candidate.messageId),
    read: candidate.read,
    sourceUrl,
    text,
    timestamp,
    timestampText
  };
}

function getInboxRecordsStorageKey(sourceUrl: string): string {
  return `${INBOX_RECORDS_STORAGE_KEY_PREFIX}:${getYouTubeChatSourceStorageKey(sourceUrl)}`;
}
