import { cleanText } from '../../shared/text';
import type { InboxRecord } from './types';

export const MAX_INBOX_KEYWORDS = 30;
export const MAX_KEYWORD_LENGTH = 60;

export interface PreparedKeyword {
  normalized: string;
  value: string;
}

export function normalizeStoredKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return mergeStrings([], value.map((item) => normalizeKeyword(item)))
    .slice(-MAX_INBOX_KEYWORDS);
}

export function normalizeMentionHandles(
  value: unknown,
  text: string,
  mention: boolean,
  getCurrentHandles: () => string[]
): string[] {
  if (Array.isArray(value)) {
    const storedHandles = mergeStrings([], value.map((item) => cleanText(item)));
    if (storedHandles.length) return storedHandles;
  }

  return mention ? getMatchedMentionHandles(text, getCurrentHandles()) : [];
}

export function getMatchedMentionHandles(text: string, candidates: string[]): string[] {
  const normalizedText = normalizeComparableText(text);
  return candidates
    .filter((candidate) => textContainsHandle(normalizedText, normalizeComparableText(candidate)));
}

export function getMatchingKeywords(values: string | string[], keywords: string[]): string[] {
  return getMatchingPreparedKeywords(values, prepareKeywords(keywords));
}

export function prepareKeywords(keywords: string[]): PreparedKeyword[] {
  return keywords
    .map((value) => ({
      normalized: normalizeComparableText(value),
      value
    }))
    .filter((keyword) => Boolean(keyword.normalized));
}

export function getMatchingPreparedKeywords(values: string | string[], keywords: PreparedKeyword[]): string[] {
  const normalizedValues = (Array.isArray(values) ? values : [values])
    .map(normalizeComparableText)
    .filter(Boolean);

  return keywords
    .filter((keyword) => {
      return normalizedValues.some((value) => value.includes(keyword.normalized));
    })
    .map((keyword) => keyword.value);
}

export function getKeywordCheckKey(keywords: string[], values: string | string[]): string {
  return `${getKeywordsKey(prepareKeywords(keywords))}\n${getKeywordValuesKey(values)}`;
}

export function getKeywordValuesKey(values: string | string[]): string {
  return (Array.isArray(values) ? values : [values])
    .map(normalizeComparableText)
    .join('\n');
}

export function normalizeKeyword(value: unknown): string {
  return cleanText(String(value || '')).slice(0, MAX_KEYWORD_LENGTH);
}

export function keywordsEqual(first: string, second: string): boolean {
  return normalizeComparableText(first) === normalizeComparableText(second);
}

export function mergeStrings(first: string[], second: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  [...first, ...second].forEach((value) => {
    const clean = cleanText(value);
    const key = normalizeComparableText(clean);
    if (!clean || seen.has(key)) return;
    seen.add(key);
    result.push(clean);
  });

  return result;
}

export function getRecordSignature(record: {
  authorName: string;
  messageId?: string;
  sourceUrl: string;
  text: string;
  timestampText: string;
}): string {
  const messageId = cleanText(record.messageId);
  if (messageId) {
    return [
      'message-id',
      messageId
    ].join('\n');
  }

  return [
    'message-content',
    normalizeComparableText(record.authorName),
    normalizeComparableText(record.text),
    normalizeComparableText(record.timestampText),
    normalizeSourceUrl(record.sourceUrl)
  ].join('\n');
}

export function findMatchingRecordIndex(records: InboxRecord[], incoming: InboxRecord): number {
  const exactSignature = getRecordSignature(incoming);
  const exactIndex = records.findIndex((record) => getRecordSignature(record) === exactSignature);
  if (exactIndex >= 0) return exactIndex;

  const looseSignature = getLooseRecordSignature(incoming);
  return records.findIndex((record) => getLooseRecordSignature(record) === looseSignature);
}

function getLooseRecordSignature(record: {
  authorName: string;
  sourceUrl: string;
  text: string;
}): string {
  return [
    normalizeComparableText(record.authorName),
    normalizeComparableText(record.text),
    normalizeSourceUrl(record.sourceUrl)
  ].join('\n');
}

function normalizeSourceUrl(value: string): string {
  const clean = cleanText(value);
  if (!clean) return '';

  try {
    const url = new URL(clean);
    const videoId = url.searchParams.get('v');
    if (videoId) return `${url.origin}/watch?v=${videoId}`;

    return `${url.origin}${url.pathname}`;
  } catch {
    return normalizeComparableText(clean);
  }
}

export function getPreparedKeywordsKey(keywords: PreparedKeyword[]): string {
  return getKeywordsKey(keywords);
}

function getKeywordsKey(keywords: PreparedKeyword[]): string {
  return keywords.map((keyword) => keyword.normalized).join('\n');
}

function normalizeComparableText(value: string): string {
  return cleanText(value)
    .toLocaleLowerCase()
    .normalize('NFKC');
}

function textContainsHandle(text: string, handle: string): boolean {
  if (!handle) return false;
  let index = text.indexOf(handle);

  while (index >= 0) {
    const before = index > 0 ? text[index - 1] : '';
    const after = text[index + handle.length] || '';
    if (!isHandleCharacter(before) && !isHandleCharacter(after)) return true;
    index = text.indexOf(handle, index + handle.length);
  }

  return false;
}

function isHandleCharacter(value: string): boolean {
  return Boolean(value && /[\p{L}\p{N}._-]/u.test(value));
}
