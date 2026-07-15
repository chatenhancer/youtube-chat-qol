/**
 * Sanitized event protocol shared by the page-world YouTube chat feed transport and
 * the isolated extension world.
 *
 * Raw InnerTube responses, continuations, request bodies, authentication
 * values, and service endpoints must never cross this boundary.
 */

export const YOUTUBE_CHAT_FEED_PROTOCOL_VERSION = 1 as const;
export const YOUTUBE_CHAT_FEED_CONTROL_EVENT = 'ytcq:lite-chat-control';
export const YOUTUBE_CHAT_FEED_BATCH_EVENT = 'ytcq:lite-chat-batch';
export const YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE = 'data-ytcq-lite-mode-intent';

export type YouTubeChatFeedBatchSource = 'initial' | 'live' | 'replay' | 'send';
export type YouTubeChatFeedConsumer = 'inbox' | 'lite' | 'records';
export type YouTubeChatMessageKind = 'text' | 'paid' | 'sticker' | 'membership' | 'gift';

export interface YouTubeChatFeedControl {
  consumer: YouTubeChatFeedConsumer;
  enabled: boolean;
  requestInitial?: boolean;
  /** Capture connected native rows as additive existing-message records. */
  requestRendered?: boolean;
  version: typeof YOUTUBE_CHAT_FEED_PROTOCOL_VERSION;
}

export interface YouTubeChatTextRun {
  href?: string;
  text: string;
  type: 'text';
}

export interface YouTubeChatEmojiRun {
  alt: string;
  emojiId?: string;
  imageUrl: string;
  shortcuts: string[];
  type: 'emoji';
}

export type YouTubeChatRichRun = YouTubeChatTextRun | YouTubeChatEmojiRun;

export interface YouTubeChatAuthorBadge {
  iconUrl?: string;
  kind?: 'member' | 'moderator' | 'verified';
  label: string;
}

export interface YouTubeChatAuthor {
  avatarUrl?: string;
  badges: YouTubeChatAuthorBadge[];
  channelId?: string;
  isOwner?: boolean;
  name: string;
  topFanRank?: 1 | 2 | 3;
}

/**
 * YouTube supplies colors as unsigned ARGB integers. Keeping them numeric
 * prevents response data from becoming arbitrary CSS text.
 */
export interface YouTubeChatMessageColors {
  authorName?: number;
  background?: number;
  bodyBackground?: number;
  headerBackground?: number;
  headerText?: number;
  text?: number;
  timestamp?: number;
}

export interface YouTubeChatPaidMetadata {
  amountText: string;
}

export interface YouTubeChatStickerMetadata {
  alt: string;
  amountText: string;
  imageUrl: string;
}

export interface YouTubeChatMembershipMetadata {
  headerText: string;
  subtext?: string;
}

export interface YouTubeChatGiftMetadata {
  alt?: string;
  count?: number;
  giftType: 'purchase' | 'redemption';
  headerText: string;
  imageUrl?: string;
}

export interface YouTubeChatMessageRecord {
  author?: YouTubeChatAuthor;
  colors?: YouTubeChatMessageColors;
  gift?: YouTubeChatGiftMetadata;
  id: string;
  kind: YouTubeChatMessageKind;
  membership?: YouTubeChatMembershipMetadata;
  paid?: YouTubeChatPaidMetadata;
  plainText: string;
  runs: YouTubeChatRichRun[];
  sticker?: YouTubeChatStickerMetadata;
  timestampText?: string;
  timestampUsec?: string;
}

interface YouTubeChatFeedActionTiming {
  /** Video time supplied by replayChatItemAction, in milliseconds. */
  replayOffsetMs?: number;
}

export type YouTubeChatFeedAction = (
  | {
      type: 'reset';
    }
  | {
      record: YouTubeChatMessageRecord;
      type: 'upsert';
    }
  | {
      id: string;
      type: 'remove';
    }
  | {
      channelId: string;
      type: 'remove-author';
    }
) & YouTubeChatFeedActionTiming;

export interface YouTubeChatFeedTransportBatch {
  actions: YouTubeChatFeedAction[];
  compatibilityWarnings?: string[];
  continuationTimeoutMs?: number;
  fatalErrors?: string[];
  receivedAt: number;
  /** Sanitized target time from a replay request; continuation tokens never cross. */
  replayPlayerOffsetMs?: number;
  sequence: number;
  /** The actions replace the current chat contents instead of representing new traffic. */
  snapshot?: boolean;
  source: YouTubeChatFeedBatchSource;
  /** The response completed before the first feed consumer was ready. */
  startup?: boolean;
  unreadableFeed?: boolean;
  version: typeof YOUTUBE_CHAT_FEED_PROTOCOL_VERSION;
}
