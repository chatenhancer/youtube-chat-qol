/**
 * Sanitized protocol shared by the page-world Lite chat transport and the
 * isolated extension world.
 *
 * Raw InnerTube responses, continuations, request bodies, authentication
 * values, and service endpoints must never cross this boundary.
 */

export const LITE_CHAT_PROTOCOL_VERSION = 1 as const;
export const LITE_CHAT_CONTROL_EVENT = 'ytcq:lite-chat-control';
export const LITE_CHAT_BATCH_EVENT = 'ytcq:lite-chat-batch';
export const LITE_MODE_BOOTSTRAP_INTENT_ATTRIBUTE = 'data-ytcq-lite-mode-intent';

export type LiteChatBatchSource = 'initial' | 'live' | 'replay' | 'send';
export type LiteChatMessageKind = 'text' | 'paid' | 'sticker' | 'membership' | 'gift';

export interface LiteChatControl {
  enabled: boolean;
  requestInitial?: boolean;
  version: typeof LITE_CHAT_PROTOCOL_VERSION;
}

export interface LiteChatTextRun {
  href?: string;
  text: string;
  type: 'text';
}

export interface LiteChatEmojiRun {
  alt: string;
  emojiId?: string;
  imageUrl: string;
  shortcuts: string[];
  type: 'emoji';
}

export type LiteChatRichRun = LiteChatTextRun | LiteChatEmojiRun;

export interface LiteChatAuthorBadge {
  iconUrl?: string;
  kind?: 'moderator' | 'verified';
  label: string;
}

export interface LiteChatAuthor {
  avatarUrl?: string;
  badges: LiteChatAuthorBadge[];
  channelId?: string;
  isOwner?: boolean;
  name: string;
}

/**
 * YouTube supplies colors as unsigned ARGB integers. Keeping them numeric
 * prevents response data from becoming arbitrary CSS text.
 */
export interface LiteChatMessageColors {
  authorName?: number;
  background?: number;
  bodyBackground?: number;
  headerBackground?: number;
  headerText?: number;
  text?: number;
  timestamp?: number;
}

export interface LiteChatPaidMetadata {
  amountText: string;
}

export interface LiteChatStickerMetadata {
  alt: string;
  amountText: string;
  imageUrl: string;
}

export interface LiteChatMembershipMetadata {
  headerText: string;
  subtext?: string;
}

export interface LiteChatGiftMetadata {
  alt?: string;
  count?: number;
  giftType: 'purchase' | 'redemption';
  headerText: string;
  imageUrl?: string;
}

export interface LiteChatMessageRecord {
  author?: LiteChatAuthor;
  colors?: LiteChatMessageColors;
  gift?: LiteChatGiftMetadata;
  id: string;
  kind: LiteChatMessageKind;
  membership?: LiteChatMembershipMetadata;
  paid?: LiteChatPaidMetadata;
  plainText: string;
  runs: LiteChatRichRun[];
  sticker?: LiteChatStickerMetadata;
  timestampText?: string;
  timestampUsec?: string;
}

interface LiteChatActionTiming {
  /** Video time supplied by replayChatItemAction, in milliseconds. */
  replayOffsetMs?: number;
}

export type LiteChatAction = (
  | {
      type: 'reset';
    }
  | {
      record: LiteChatMessageRecord;
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
) & LiteChatActionTiming;

export interface LiteChatBatch {
  actions: LiteChatAction[];
  compatibilityWarnings?: string[];
  continuationTimeoutMs?: number;
  fatalErrors?: string[];
  receivedAt: number;
  /** Sanitized target time from a replay request; continuation tokens never cross. */
  replayPlayerOffsetMs?: number;
  sequence: number;
  source: LiteChatBatchSource;
  unreadableFeed?: boolean;
  version: typeof LITE_CHAT_PROTOCOL_VERSION;
}
