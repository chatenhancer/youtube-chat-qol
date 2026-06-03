/**
 * User message identity helpers.
 *
 * Builds stable in-memory keys for recent-message records from channel IDs,
 * handles, and author-name fallbacks.
 */
import { normalizeComparableText } from '../../shared/text';
import {
  getAuthorChannelId,
  getAuthorName,
} from '../../youtube/messages';
import type { UserIdentity } from './types';

export function getUserKey(message: HTMLElement): string {
  return getUserKeyFromIdentity({
    channelId: getAuthorChannelId(message),
    authorName: getAuthorName(message)
  });
}

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
