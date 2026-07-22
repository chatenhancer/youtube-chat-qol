/**
 * Shared bookmark storage helpers.
 *
 * Bookmarks are stored per message and retain the message's author and stream
 * context. Records written by older releases contained only an author; those
 * normalize into the same shape with `message: null` so no user data is
 * discarded or attributed to a message the user did not save.
 */
import { cleanText, normalizeComparableText } from './text';
import { normalizeRichTextSegments, type RichTextSegment } from '../youtube/rich-text';

export const BOOKMARKS_STORAGE_KEY = 'ytcqBookmarks';
export const LEGACY_BOOKMARKS_STORAGE_KEY = 'ytcqMarkedUsers';

export interface BookmarkAuthorIdentity {
  authorName?: string;
  avatarUrl?: string;
  channelId?: string;
}

export interface BookmarkContent {
  contentParts: RichTextSegment[];
  messageId: string;
  text: string;
  timestamp: number;
  timestampText: string;
}

export interface BookmarkRecord {
  authorName: string;
  avatarUrl?: string;
  channelId?: string;
  message: BookmarkContent | null;
  savedAt: number;
  sourceKey: string;
  sourceTitle?: string;
  sourceUrl?: string;
}

export type StoredBookmarks = Record<string, BookmarkRecord>;

export function getBookmarkAuthorKey(identity: BookmarkAuthorIdentity): string {
  const channelId = cleanText(identity.channelId);
  if (channelId) return `channel:${channelId}`;

  const normalizedAuthorName = normalizeComparableText(identity.authorName || '');
  return normalizedAuthorName ? `author:${normalizedAuthorName}` : '';
}

export function getBookmarkKey(sourceKey: string, messageId: string): string {
  const normalizedSourceKey = cleanText(sourceKey);
  const normalizedMessageId = cleanText(messageId);
  return normalizedSourceKey && normalizedMessageId
    ? `message:${normalizedSourceKey}:${normalizedMessageId}`
    : '';
}

export function bookmarkAuthorsMatch(
  first: BookmarkAuthorIdentity,
  second: BookmarkAuthorIdentity
): boolean {
  const firstChannelId = cleanText(first.channelId);
  const secondChannelId = cleanText(second.channelId);
  if (firstChannelId && secondChannelId) return firstChannelId === secondChannelId;

  const firstAuthorKey = getBookmarkAuthorKey({ authorName: first.authorName });
  return Boolean(
    firstAuthorKey && firstAuthorKey === getBookmarkAuthorKey({ authorName: second.authorName })
  );
}

export function getBookmarkAuthorColor(identity: BookmarkAuthorIdentity): string {
  const seed = cleanText(identity.authorName) || cleanText(identity.channelId) || 'bookmark-author';
  const hue = hashString(seed) % 360;
  return `hsl(${hue} 86% 58%)`;
}

export function normalizeBookmarkAuthor(
  identity: BookmarkAuthorIdentity
): BookmarkAuthorIdentity | null {
  const authorName = cleanText(identity.authorName);
  const channelId = cleanText(identity.channelId);
  if (!authorName && !channelId) return null;

  return {
    authorName,
    avatarUrl: normalizeBookmarkAvatarUrl(identity.avatarUrl) || undefined,
    channelId: channelId || undefined
  };
}

export function normalizeStoredBookmarks(value: unknown): Map<string, BookmarkRecord> {
  const next = new Map<string, BookmarkRecord>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next;

  Object.entries(value as Record<string, unknown>).forEach(([storedKey, record]) => {
    const normalized = normalizeStoredBookmark(storedKey, record);
    if (!normalized) return;
    next.set(normalized.key, normalized.record);
  });

  return next;
}

export function serializeBookmarks(records: Map<string, BookmarkRecord>): StoredBookmarks {
  return Object.fromEntries(records.entries());
}

export function normalizeBookmarkAvatarUrl(value: unknown): string {
  const avatarUrl = cleanText(value);
  if (!avatarUrl || avatarUrl.startsWith('data:') || avatarUrl.startsWith('blob:')) return '';
  return avatarUrl;
}

function normalizeStoredBookmark(
  storedKey: string,
  value: unknown
): { key: string; record: BookmarkRecord } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const identity = normalizeBookmarkAuthor({
    authorName: cleanText(candidate.authorName),
    avatarUrl: normalizeBookmarkAvatarUrl(candidate.avatarUrl),
    channelId: cleanText(candidate.channelId)
  });
  if (!identity) return null;

  const legacy = !Object.hasOwn(candidate, 'message');
  const message = legacy ? null : normalizeBookmarkContent(candidate.message);
  if (!legacy && candidate.message !== null && !message) return null;

  const savedAtCandidate = Number(legacy ? candidate.markedAt : candidate.savedAt);
  const savedAt = Number.isFinite(savedAtCandidate) ? savedAtCandidate : 0;
  const sourceKey = cleanText(candidate.sourceKey);
  const sourceTitle = cleanText(
    legacy ? candidate.markedSourceTitle : candidate.sourceTitle
  ) || undefined;
  const sourceUrl = cleanText(
    legacy ? candidate.markedSourceUrl : candidate.sourceUrl
  ) || undefined;
  const authorKey = getBookmarkAuthorKey(identity);
  const expectedKey = message
    ? getBookmarkKey(sourceKey, message.messageId)
    : authorKey;
  if (!expectedKey || expectedKey !== storedKey) return null;

  return {
    key: expectedKey,
    record: {
      authorName: identity.authorName || '',
      avatarUrl: identity.avatarUrl,
      channelId: identity.channelId,
      message,
      savedAt,
      sourceKey,
      sourceTitle,
      sourceUrl
    }
  };
}

function normalizeBookmarkContent(value: unknown): BookmarkContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const messageId = cleanText(candidate.messageId);
  const text = cleanText(candidate.text);
  const contentParts = normalizeRichTextSegments(candidate.contentParts);
  if (!messageId || (!text && !contentParts.length)) return null;

  const timestampCandidate = Number(candidate.timestamp);
  return {
    contentParts,
    messageId,
    text,
    timestamp: Number.isFinite(timestampCandidate) ? timestampCandidate : 0,
    timestampText: cleanText(candidate.timestampText)
  };
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return Math.abs(hash);
}
