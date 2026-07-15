/**
 * User message identity helpers.
 *
 * Builds stable in-memory keys for recent-message records from channel IDs,
 * handles, and author-name fallbacks.
 */
import { normalizeComparableText } from '../../shared/text';
import type { UserIdentity } from './types';

export function getUserKeyFromIdentity(identity: UserIdentity): string {
  if (identity.channelId) return `channel:${identity.channelId}`;
  return getAuthorKey(identity.authorName);
}

export function getIdentityFromUserKey(key: string, authorName: string): UserIdentity {
  const channelPrefix = 'channel:';
  if (key.startsWith(channelPrefix)) {
    return {
      authorName,
      channelId: key.slice(channelPrefix.length)
    };
  }

  return { authorName };
}

export function getAuthorKey(authorName: string | undefined): string {
  const normalizedAuthorName = normalizeComparableText(authorName || '');
  return normalizedAuthorName ? `author:${normalizedAuthorName}` : '';
}

export function getNormalizedHandle(value: string): string {
  return normalizeComparableText(value).replace(/^@+/, '');
}
