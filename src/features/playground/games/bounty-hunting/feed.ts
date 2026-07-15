/** Feed-backed Bounty Hunting message facts and lifecycle. */
import {
  countBountyHuntingTextEmojis,
  isBountyHuntingAllCapsMessage
} from '../../../../shared/playground/bounty-hunting';
import { cleanText } from '../../../../shared/text';
import { getYouTubeChatFeedRecordState } from '../../../../youtube/chat-feed/records';
import {
  isYouTubeChatFeedPage,
  subscribeYouTubeChatFeed,
  type YouTubeChatFeedBatch
} from '../../../../youtube/chat-feed/source';
import type {
  YouTubeChatAuthorBadge,
  YouTubeChatMessageRecord
} from '../../../../youtube/chat-feed/protocol';
import type {
  BountyHuntingChatFeedMessage,
  BountyHuntingChatFeedObserver
} from './types';

interface BountyHuntingChatFeedCallbacks {
  onRemove(messageId: string): void;
  onReset(): void;
  onUpsert(message: BountyHuntingChatFeedMessage): void;
}

const MAX_BOUNTY_HUNTING_FEED_MESSAGES = 800;

export function createBountyHuntingChatFeed(
  callbacks: BountyHuntingChatFeedCallbacks
): BountyHuntingChatFeedObserver {
  const messages = new Map<string, BountyHuntingChatFeedMessage>();
  let unsubscribe: (() => void) | null = null;

  const forget = (messageId: string): void => {
    if (!messages.delete(messageId)) return;
    callbacks.onRemove(messageId);
  };
  const remember = (record: YouTubeChatMessageRecord, notify = true): void => {
    const message = createBountyHuntingChatFeedMessage(record);
    if (!message) {
      forget(cleanText(record.id));
      return;
    }
    messages.delete(message.messageId);
    messages.set(message.messageId, message);
    if (notify) callbacks.onUpsert(message);
    while (messages.size > MAX_BOUNTY_HUNTING_FEED_MESSAGES) {
      const oldestId = messages.keys().next().value;
      if (!oldestId) break;
      forget(oldestId);
    }
  };
  const applyBatch = (batch: YouTubeChatFeedBatch): void => {
    batch.actions.forEach((action) => {
      if (action.type === 'reset') {
        messages.clear();
        callbacks.onReset();
        return;
      }
      if (action.type === 'remove') {
        forget(action.id);
        return;
      }
      if (action.type === 'remove-author') {
        [...messages.values()]
          .filter((message) => message.channelId === action.channelId)
          .forEach((message) => forget(message.messageId));
        return;
      }
      remember(action.record, batch.activity === 'new');
    });
  };

  if (isYouTubeChatFeedPage()) {
    getYouTubeChatFeedRecordState().records.forEach((record) => remember(record));
    unsubscribe = subscribeYouTubeChatFeed({
      consumer: 'records',
      onBatch: applyBatch
    });
  }

  return {
    close() {
      unsubscribe?.();
      unsubscribe = null;
      messages.clear();
    },
    getMessage(messageId) {
      return messages.get(cleanText(messageId)) || null;
    },
    getMessages() {
      return [...messages.values()];
    }
  };
}

export function createBountyHuntingChatFeedMessage(
  record: YouTubeChatMessageRecord
): BountyHuntingChatFeedMessage | null {
  const messageId = cleanText(record.id);
  const text = cleanText(record.plainText);
  const isSuperChat = record.kind === 'paid' || record.kind === 'sticker';
  if (!messageId || (!text && !isSuperChat)) return null;

  const emojiRuns = record.runs.filter((run) => run.type === 'emoji');
  const emojiCount = Math.max(
    emojiRuns.length,
    countBountyHuntingTextEmojis(text)
  );
  const badges = record.author?.badges || [];
  const timestampUsec = /^\d{1,24}$/.test(record.timestampUsec || '')
    ? record.timestampUsec
    : undefined;

  return {
    authorName: cleanText(record.author?.name || ''),
    channelId: cleanText(record.author?.channelId || ''),
    emojiCount,
    hasAllCaps: isBountyHuntingAllCapsMessage(text),
    hasCustomEmoji: emojiRuns.some(isCustomEmojiRun),
    hasMention: /(^|\s)@[\p{L}\p{N}._-]{2,}/u.test(text),
    hasNumber: /\p{N}/u.test(text),
    hasOnlyEmojis: emojiCount > 0 && !(record.runs.length
      ? record.runs.some((run) => run.type === 'text' && hasNonEmojiText(run.text))
      : hasNonEmojiText(text)),
    hasQuestion: /[?？]/u.test(text),
    isChannelMemberAuthor: record.kind === 'membership' || hasBadge(badges, 'member', /\bmember\b/i),
    isChannelOwnerAuthor: record.author?.isOwner === true || hasBadge(badges, undefined, /\b(?:owner|creator)\b/i),
    isModeratorAuthor: hasBadge(badges, 'moderator', /\bmoderator\b/i),
    isSuperChat,
    isTopFanAuthor: Boolean(record.author?.topFanRank),
    isVerifiedAuthor: hasBadge(badges, 'verified', /\bverified\b/i),
    messageId,
    ...(timestampUsec ? { messageTimestampUsec: timestampUsec } : {})
  };
}

function hasBadge(
  badges: readonly YouTubeChatAuthorBadge[],
  kind: YouTubeChatAuthorBadge['kind'] | undefined,
  labelPattern: RegExp
): boolean {
  return badges.some((badge) => (
    (kind !== undefined && badge.kind === kind) || labelPattern.test(badge.label)
  ));
}

function isCustomEmojiRun(
  run: Extract<YouTubeChatMessageRecord['runs'][number], { type: 'emoji' }>
): boolean {
  return Boolean(
    cleanText(run.emojiId) ||
    cleanText(run.alt).startsWith(':') ||
    run.shortcuts.some((shortcut) => cleanText(shortcut).startsWith(':'))
  );
}

function hasNonEmojiText(value: string): boolean {
  return Boolean(cleanText(value.replace(/\p{Extended_Pictographic}/gu, '')).replace(/\s/g, ''));
}
