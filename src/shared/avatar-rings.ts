/** Browser-local identities selected for avatar rings. */
import { cleanText, normalizeComparableText } from './text';

export const AVATAR_RINGS_STORAGE_KEY = 'ytcqAvatarRings';

export interface AvatarRingIdentity {
  authorName?: string;
  channelId?: string;
}

export interface AvatarRingSource extends AvatarRingIdentity {
  avatarUrl?: string;
}

export interface AvatarRingRecord {
  addedAt: number;
  authorName: string;
  avatarUrl?: string;
  channelId?: string;
  sourceTitle?: string;
  sourceUrl: string;
}

export type NormalizedAvatarRingIdentity = Pick<AvatarRingRecord, 'authorName' | 'channelId'>;

export type StoredAvatarRings = Record<string, AvatarRingRecord>;

export function getAvatarRingKey(identity: AvatarRingIdentity): string {
  const channelId = cleanText(identity.channelId);
  if (channelId) return `channel:${channelId}`;

  const authorName = normalizeComparableText(identity.authorName || '');
  return authorName ? `author:${authorName}` : '';
}

export function getAvatarRingColor(identity: AvatarRingIdentity): string {
  const seed = cleanText(identity.authorName) || cleanText(identity.channelId) || 'avatar-ring';
  return `hsl(${hashString(seed) % 360} 86% 58%)`;
}

export function normalizeAvatarRingIdentity(
  identity: AvatarRingIdentity
): NormalizedAvatarRingIdentity | null {
  const authorName = cleanText(identity.authorName);
  const channelId = cleanText(identity.channelId);
  if (!authorName && !channelId) return null;

  return {
    authorName,
    channelId: channelId || undefined
  };
}

export function normalizeStoredAvatarRings(value: unknown): Map<string, AvatarRingRecord> {
  const records = new Map<string, AvatarRingRecord>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return records;

  Object.entries(value as Record<string, unknown>).forEach(([storedKey, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const candidate = value as Partial<AvatarRingRecord>;
    const record = normalizeAvatarRingIdentity(candidate);
    if (!record || getAvatarRingKey(record) !== storedKey) return;
    const addedAtCandidate = Number(candidate.addedAt);
    const sourceUrl = cleanText(candidate.sourceUrl);
    if (!Number.isFinite(addedAtCandidate) || addedAtCandidate <= 0 || !sourceUrl) return;

    records.set(storedKey, {
      ...record,
      addedAt: addedAtCandidate,
      avatarUrl: normalizeAvatarRingAvatarUrl(candidate.avatarUrl) || undefined,
      sourceTitle: cleanText(candidate.sourceTitle) || undefined,
      sourceUrl
    });
  });

  return records;
}

export function serializeAvatarRings(records: Map<string, AvatarRingRecord>): StoredAvatarRings {
  return Object.fromEntries(records.entries());
}

export function normalizeAvatarRingAvatarUrl(value: unknown): string {
  const avatarUrl = cleanText(value);
  if (!avatarUrl || avatarUrl.startsWith('data:') || avatarUrl.startsWith('blob:')) return '';
  return avatarUrl;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return Math.abs(hash);
}
