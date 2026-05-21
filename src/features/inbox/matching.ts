import { cleanText } from '../../shared/text';

export const MAX_INBOX_KEYWORDS = 30;
export const MAX_KEYWORD_LENGTH = 60;

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

export function getMatchingKeywords(text: string, keywords: string[]): string[] {
  const normalizedText = normalizeComparableText(text);
  return keywords
    .filter((keyword) => normalizedText.includes(normalizeComparableText(keyword)));
}

export function getKeywordCheckKey(keywords: string[], text: string): string {
  return `${getKeywordsKey(keywords)}\n${normalizeComparableText(text)}`;
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
  sourceUrl: string;
  text: string;
  timestampText: string;
}): string {
  return [
    record.authorName,
    record.text,
    record.timestampText,
    record.sourceUrl
  ].join('\n');
}

function getKeywordsKey(keywords: string[]): string {
  return keywords.map(normalizeComparableText).join('\n');
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
