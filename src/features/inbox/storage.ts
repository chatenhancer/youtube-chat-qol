import { cleanText } from '../../shared/text';
import { normalizeRichTextSegments } from '../../youtube/richText';
import {
  normalizeMentionHandles,
  normalizeStoredKeywords
} from './matching';
import type { InboxRecord } from './types';

const INBOX_RECORDS_STORAGE_KEY_PREFIX = 'ytcqInboxRecords';
const INBOX_KEYWORDS_STORAGE_KEY = 'ytcqInboxKeywords';
const MAX_INBOX_RECORDS = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CHAT_TIMESTAMP_FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const MAX_TIMESTAMP_ORDER_OFFSET = 59_999;
const MAX_TRACKED_TIMESTAMP_BASES = 720;

const messageTimestampOffsets = new WeakMap<HTMLElement, number>();
const nextTimestampOffsetByBase = new Map<number, number>();

export interface InboxStoredState {
  keywords: string[];
  records: InboxRecord[];
}

export function loadInboxStoredState(getCurrentHandles: () => string[], sourceUrl: string): Promise<InboxStoredState> {
  const recordsStorageKey = getInboxRecordsStorageKey(sourceUrl);

  return new Promise((resolve) => {
    chrome.storage.local.get({
      [recordsStorageKey]: [],
      [INBOX_KEYWORDS_STORAGE_KEY]: []
    }, (stored) => {
      const storedRecords = stored[recordsStorageKey];
      resolve({
        records: normalizeStoredRecords(storedRecords, getCurrentHandles),
        keywords: normalizeStoredKeywords(stored[INBOX_KEYWORDS_STORAGE_KEY])
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
    contentParts: record.contentParts || [],
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

export function getInboxTimestamp(message: HTMLElement, timestampText: string, fallbackTimestamp: number): number {
  const parsedTimestamp = parseInboxTimestampText(timestampText, fallbackTimestamp);
  if (parsedTimestamp === null) return fallbackTimestamp;

  return parsedTimestamp + getMessageOrderOffset(message, parsedTimestamp);
}

function normalizeStoredRecords(value: unknown, getCurrentHandles: () => string[]): InboxRecord[] {
  if (!Array.isArray(value)) return [];

  const normalizedRecords = value
    .map((record) => normalizeStoredRecord(record, getCurrentHandles))
    .filter((record): record is InboxRecord => Boolean(record));

  return sortAndTrimRecords(normalizedRecords);
}

function normalizeStoredRecord(value: unknown, getCurrentHandles: () => string[]): InboxRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<InboxRecord>;
  const authorName = cleanText(candidate.authorName);
  const text = cleanText(candidate.text);
  const storedTimestamp = Number(candidate.timestamp);
  if (!authorName || !text || !Number.isFinite(storedTimestamp)) return null;

  const timestampText = cleanText(candidate.timestampText) || new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(storedTimestamp);
  const timestamp = parseInboxTimestampText(timestampText, storedTimestamp) ?? storedTimestamp;
  const mention = candidate.mention !== false;

  return {
    id: cleanText(candidate.id) || `${timestamp}`,
    authorName,
    contentParts: normalizeRichTextSegments(candidate.contentParts),
    matchedKeywords: normalizeStoredKeywords(candidate.matchedKeywords),
    mention,
    mentionHandles: normalizeMentionHandles(candidate.mentionHandles, text, mention, getCurrentHandles),
    messageId: cleanText(candidate.messageId),
    read: candidate.read === true,
    sourceUrl: cleanText(candidate.sourceUrl),
    text,
    timestamp,
    timestampText
  };
}

function parseInboxTimestampText(timestampText: string, referenceTimestamp: number): number | null {
  const normalized = cleanText(timestampText).replace(/\./g, '').toLocaleUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4];

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (minute > 59 || second > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
  } else if (hour > 23) {
    return null;
  }

  const date = new Date(referenceTimestamp);
  date.setHours(hour, minute, second, 0);
  let parsedTimestamp = date.getTime();

  if (parsedTimestamp > referenceTimestamp + CHAT_TIMESTAMP_FUTURE_TOLERANCE_MS) {
    parsedTimestamp -= ONE_DAY_MS;
  }

  return parsedTimestamp;
}

function getMessageOrderOffset(message: HTMLElement, baseTimestamp: number): number {
  const existingOffset = messageTimestampOffsets.get(message);
  if (existingOffset !== undefined) return existingOffset;

  const nextOffset = Math.min(
    nextTimestampOffsetByBase.get(baseTimestamp) || 0,
    MAX_TIMESTAMP_ORDER_OFFSET
  );
  messageTimestampOffsets.set(message, nextOffset);

  if (nextOffset < MAX_TIMESTAMP_ORDER_OFFSET) {
    nextTimestampOffsetByBase.set(baseTimestamp, nextOffset + 1);
    pruneTimestampOffsetBases();
  }

  return nextOffset;
}

function pruneTimestampOffsetBases(): void {
  while (nextTimestampOffsetByBase.size > MAX_TRACKED_TIMESTAMP_BASES) {
    const oldestBase = nextTimestampOffsetByBase.keys().next().value;
    if (oldestBase === undefined) return;
    nextTimestampOffsetByBase.delete(oldestBase);
  }
}

function getInboxRecordsStorageKey(sourceUrl: string): string {
  const cleanSourceUrl = cleanText(sourceUrl);
  const videoId = getVideoIdFromUrl(cleanSourceUrl);
  if (videoId) return `${INBOX_RECORDS_STORAGE_KEY_PREFIX}:video:${videoId}`;

  return `${INBOX_RECORDS_STORAGE_KEY_PREFIX}:source:${hashStorageKey(cleanSourceUrl || 'unknown')}`;
}

function getVideoIdFromUrl(value: string): string {
  if (!value) return '';

  try {
    const url = new URL(value);
    return cleanText(url.searchParams.get('v') || url.searchParams.get('video_id') || '');
  } catch {
    return '';
  }
}

function hashStorageKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}
