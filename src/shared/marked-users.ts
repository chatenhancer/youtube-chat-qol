/**
 * Shared marked-user storage helpers.
 *
 * Content scripts use this to mark users and render avatar rings. The popup
 * uses the same storage shape to show and manage the saved list.
 */
import { cleanText, normalizeComparableText } from './text';

export const MARKED_USERS_STORAGE_KEY = 'ytcqMarkedUsers';

export interface MarkedUserIdentity {
  authorName?: string;
  avatarUrl?: string;
  channelId?: string;
}

export interface MarkedUserRecord {
  authorName: string;
  avatarUrl?: string;
  channelId?: string;
  markedAt: number;
  markedSourceTitle?: string;
  markedSourceUrl?: string;
}

export type StoredMarkedUsers = Record<string, MarkedUserRecord>;

export function getMarkedUserKey(identity: MarkedUserIdentity): string {
  const channelId = cleanText(identity.channelId);
  if (channelId) return `channel:${channelId}`;

  const normalizedAuthorName = normalizeComparableText(identity.authorName || '');
  return normalizedAuthorName ? `author:${normalizedAuthorName}` : '';
}

export function getMarkedUserColor(identity: MarkedUserIdentity): string {
  const seed = cleanText(identity.authorName) || cleanText(identity.channelId) || 'marked-user';
  const hue = hashString(seed) % 360;
  return `hsl(${hue} 86% 58%)`;
}

export function normalizeMarkedIdentity(identity: MarkedUserIdentity): MarkedUserRecord | null {
  const authorName = cleanText(identity.authorName);
  const channelId = cleanText(identity.channelId);
  if (!authorName && !channelId) return null;

  return {
    authorName,
    avatarUrl: normalizeMarkedUserAvatarUrl(identity.avatarUrl) || undefined,
    channelId: channelId || undefined,
    markedAt: 0
  };
}

export function normalizeStoredMarkedUsers(value: unknown): Map<string, MarkedUserRecord> {
  const next = new Map<string, MarkedUserRecord>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next;

  Object.entries(value as Record<string, unknown>).forEach(([key, record]) => {
    if (!record || typeof record !== 'object') return;
    const candidate = record as Partial<MarkedUserRecord>;
    const normalized = normalizeMarkedIdentity({
      authorName: cleanText(candidate.authorName),
      channelId: cleanText(candidate.channelId)
    });
    if (!normalized) return;

    const normalizedKey = getMarkedUserKey(normalized);
    if (!normalizedKey || normalizedKey !== key) return;

    const markedAt = Number(candidate.markedAt);
    next.set(normalizedKey, {
      authorName: normalized.authorName || '',
      avatarUrl: normalizeMarkedUserAvatarUrl(candidate.avatarUrl) || undefined,
      channelId: normalized.channelId,
      markedAt: Number.isFinite(markedAt) ? markedAt : 0,
      markedSourceTitle: cleanText(candidate.markedSourceTitle) || undefined,
      markedSourceUrl: cleanText(candidate.markedSourceUrl) || undefined
    });
  });

  return next;
}

export function serializeMarkedUsers(records: Map<string, MarkedUserRecord>): StoredMarkedUsers {
  return Object.fromEntries(records.entries());
}

export function normalizeMarkedUserAvatarUrl(value: unknown): string {
  const avatarUrl = cleanText(value);
  if (!avatarUrl || avatarUrl.startsWith('data:') || avatarUrl.startsWith('blob:')) return '';
  return avatarUrl;
}

export function isBetterMarkedUserAvatarUrl(nextAvatarUrl: string, currentAvatarUrl: string | undefined): boolean {
  const next = normalizeMarkedUserAvatarUrl(nextAvatarUrl);
  if (!next) return false;

  const current = normalizeMarkedUserAvatarUrl(currentAvatarUrl);
  if (!current) return true;
  if (current === next) return false;

  return getAvatarUrlSizeScore(next) > getAvatarUrlSizeScore(current);
}

function getAvatarUrlSizeScore(avatarUrl: string): number {
  const matches = Array.from(avatarUrl.matchAll(/(?:=|\/)s(\d+)(?:[-/?&]|$)/g));
  const sizes = matches
    .map((match) => Number(match[1]))
    .filter((size) => Number.isFinite(size));
  return sizes.length ? Math.max(...sizes) : 1;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return Math.abs(hash);
}
