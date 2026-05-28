import { t } from '../../shared/i18n';
import { cleanText } from '../../shared/text';
import { showToast } from '../../shared/toast';
import { getLatestMentionInboxRecord } from '../inbox';
import {
  findRecentUsersByHandle,
  recordVisibleUserMessages,
  type RecentUserMatch
} from '../user-message-history';

interface ResolvedRecentUser {
  status: 'ambiguous' | 'found' | 'missing';
  matches: RecentUserMatch[];
}

export async function getLatestMentionFocusUser(): Promise<RecentUserMatch | null> {
  const latestMention = await getLatestMentionInboxRecord();
  if (!latestMention) {
    showToast(t('noRecentMentionToFocus'));
    return null;
  }

  return getSingleRecentUser(latestMention.authorName, {
    fallbackAuthorName: latestMention.authorName
  });
}

export function getSingleRecentUser(
  value: string,
  options: { fallbackAuthorName?: string } = {}
): RecentUserMatch | null {
  const resolved = resolveRecentUser(value);
  if (resolved.status === 'found') return resolved.matches[0];

  if (resolved.status === 'ambiguous') {
    showToast(t('multipleRecentUsersMatch'));
    return null;
  }

  const fallbackAuthorName = cleanText(options.fallbackAuthorName);
  if (fallbackAuthorName) {
    return {
      authorName: fallbackAuthorName,
      identity: { authorName: fallbackAuthorName },
      latestMessage: {
        id: 0,
        authorName: fallbackAuthorName,
        contentParts: [],
        text: '',
        timestamp: Date.now(),
        timestampText: ''
      }
    };
  }

  showToast(t('couldNotFindUser'));
  return null;
}

function resolveRecentUser(value: string): ResolvedRecentUser {
  recordVisibleUserMessages();
  const matches = findRecentUsersByHandle(value);
  if (!matches.length) return { status: 'missing', matches };
  if (matches.length > 1) return { status: 'ambiguous', matches };
  return { status: 'found', matches };
}
