import { normalizeComparableText } from '../../shared/text';
import {
  getAuthorName,
  getRendererData
} from '../../youtube/messages';
import type { UserIdentity } from './types';

export function getUserKey(message: HTMLElement): string {
  const data = getRendererData(message);
  return getUserKeyFromIdentity({
    channelId: data?.authorExternalChannelId || data?.authorChannelId,
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
