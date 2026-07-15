/** Runtime validation for the page-world YouTube chat feed event boundary. */
import {
  YOUTUBE_CHAT_FEED_PROTOCOL_VERSION,
  type YouTubeChatAuthor,
  type YouTubeChatAuthorBadge,
  type YouTubeChatFeedAction,
  type YouTubeChatFeedTransportBatch,
  type YouTubeChatGiftMetadata,
  type YouTubeChatMembershipMetadata,
  type YouTubeChatMessageColors,
  type YouTubeChatMessageRecord,
  type YouTubeChatPaidMetadata,
  type YouTubeChatRichRun,
  type YouTubeChatStickerMetadata
} from './protocol';

export const MAX_YOUTUBE_CHAT_FEED_BATCH_DETAIL_LENGTH = 2_000_000;
export const MAX_YOUTUBE_CHAT_FEED_BATCH_ACTIONS = 500;
const MAX_DIAGNOSTIC_VALUES = 50;
const MAX_MESSAGE_ID_LENGTH = 240;
const MAX_CHANNEL_ID_LENGTH = 240;
const MAX_TEXT_LENGTH = 20_000;
const MAX_URL_LENGTH = 4_096;
const MAX_RUNS = 500;
const MAX_BADGES = 24;
const MAX_SHORTCUTS = 24;
export const MAX_YOUTUBE_CHAT_FEED_CONTINUATION_TIMEOUT_MS = 600_000;

export function parseYouTubeChatFeedBatchDetail(
  detail: unknown
): YouTubeChatFeedTransportBatch | null {
  if (
    typeof detail !== 'string' ||
    !detail ||
    detail.length > MAX_YOUTUBE_CHAT_FEED_BATCH_DETAIL_LENGTH
  ) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== YOUTUBE_CHAT_FEED_PROTOCOL_VERSION) return null;
  if (!Number.isSafeInteger(parsed.sequence) || Number(parsed.sequence) <= 0) return null;
  if (!Number.isFinite(parsed.receivedAt) || Number(parsed.receivedAt) < 0) return null;
  if (!isBatchSource(parsed.source)) return null;
  if (
    !Array.isArray(parsed.actions) ||
    parsed.actions.length > MAX_YOUTUBE_CHAT_FEED_BATCH_ACTIONS
  ) return null;
  if (!parsed.actions.every(isYouTubeChatFeedAction)) return null;
  if (
    parsed.continuationTimeoutMs !== undefined &&
    (!Number.isFinite(parsed.continuationTimeoutMs) ||
      Number(parsed.continuationTimeoutMs) < 0 ||
      Number(parsed.continuationTimeoutMs) > MAX_YOUTUBE_CHAT_FEED_CONTINUATION_TIMEOUT_MS)
  ) {
    return null;
  }
  if (
    parsed.replayPlayerOffsetMs !== undefined &&
    (!Number.isSafeInteger(parsed.replayPlayerOffsetMs) || Number(parsed.replayPlayerOffsetMs) < 0)
  ) {
    return null;
  }
  if (
    !isDiagnosticList(parsed.compatibilityWarnings) ||
    !isDiagnosticList(parsed.fatalErrors)
  ) {
    return null;
  }
  if (parsed.snapshot !== undefined && typeof parsed.snapshot !== 'boolean') return null;
  if (parsed.startup !== undefined && typeof parsed.startup !== 'boolean') return null;
  if (parsed.unreadableFeed !== undefined && typeof parsed.unreadableFeed !== 'boolean') return null;
  return parsed as unknown as YouTubeChatFeedTransportBatch;
}

function isDiagnosticList(value: unknown): boolean {
  return value === undefined || (
    Array.isArray(value) &&
    value.length <= MAX_DIAGNOSTIC_VALUES &&
    value.every((entry) => isBoundedString(entry, 240))
  );
}

function isBatchSource(value: unknown): value is YouTubeChatFeedTransportBatch['source'] {
  return value === 'initial' || value === 'live' || value === 'replay' || value === 'send';
}

function isYouTubeChatFeedAction(value: unknown): value is YouTubeChatFeedAction {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (
    value.replayOffsetMs !== undefined &&
    (!Number.isSafeInteger(value.replayOffsetMs) || Number(value.replayOffsetMs) < 0)
  ) {
    return false;
  }
  if (value.type === 'reset') return true;
  if (value.type === 'remove') return isBoundedString(value.id, MAX_MESSAGE_ID_LENGTH);
  if (value.type === 'remove-author') return isBoundedString(value.channelId, MAX_CHANNEL_ID_LENGTH);
  return value.type === 'upsert' && isYouTubeChatMessageRecord(value.record);
}

function isYouTubeChatMessageRecord(value: unknown): value is YouTubeChatMessageRecord {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id, MAX_MESSAGE_ID_LENGTH)) return false;
  if (!isMessageKind(value.kind)) return false;
  if (!isStringWithin(value.plainText, MAX_TEXT_LENGTH)) return false;
  if (!Array.isArray(value.runs) || value.runs.length > MAX_RUNS || !value.runs.every(isYouTubeChatRun)) {
    return false;
  }
  if (value.author !== undefined && !isYouTubeChatAuthor(value.author)) return false;
  if (value.colors !== undefined && !isYouTubeChatColors(value.colors)) return false;
  if (value.timestampText !== undefined && !isStringWithin(value.timestampText, 120)) return false;
  if (
    value.timestampUsec !== undefined &&
    (!isStringWithin(value.timestampUsec, 24) || !/^\d{1,24}$/.test(value.timestampUsec))
  ) {
    return false;
  }
  if (value.paid !== undefined && !isPaidMetadata(value.paid)) return false;
  if (value.sticker !== undefined && !isStickerMetadata(value.sticker)) return false;
  if (value.membership !== undefined && !isMembershipMetadata(value.membership)) return false;
  if (value.gift !== undefined && !isGiftMetadata(value.gift)) return false;
  if (value.kind === 'paid' && !isPaidMetadata(value.paid)) return false;
  if (value.kind === 'sticker' && !isStickerMetadata(value.sticker)) return false;
  if (value.kind === 'membership' && !isMembershipMetadata(value.membership)) return false;
  if (value.kind === 'gift' && !isGiftMetadata(value.gift)) return false;
  return true;
}

function isYouTubeChatRun(value: unknown): value is YouTubeChatRichRun {
  if (!isRecord(value)) return false;
  if (value.type === 'text') {
    return isStringWithin(value.text, MAX_TEXT_LENGTH) &&
      (value.href === undefined || isSafeTransportUrl(value.href));
  }
  return value.type === 'emoji' &&
    isStringWithin(value.alt, 500) &&
    isSafeTransportUrl(value.imageUrl) &&
    (value.emojiId === undefined || isStringWithin(value.emojiId, 500)) &&
    Array.isArray(value.shortcuts) &&
    value.shortcuts.length <= MAX_SHORTCUTS &&
    value.shortcuts.every((shortcut) => isStringWithin(shortcut, 500));
}

function isYouTubeChatAuthor(value: unknown): value is YouTubeChatAuthor {
  if (!isRecord(value) || !isBoundedString(value.name, 500)) return false;
  if (value.channelId !== undefined && !isStringWithin(value.channelId, MAX_CHANNEL_ID_LENGTH)) {
    return false;
  }
  if (value.avatarUrl !== undefined && !isSafeTransportUrl(value.avatarUrl)) return false;
  if (value.isOwner !== undefined && typeof value.isOwner !== 'boolean') return false;
  if (
    value.topFanRank !== undefined &&
    value.topFanRank !== 1 &&
    value.topFanRank !== 2 &&
    value.topFanRank !== 3
  ) {
    return false;
  }
  return Array.isArray(value.badges) &&
    value.badges.length <= MAX_BADGES &&
    value.badges.every(isYouTubeChatBadge);
}

function isYouTubeChatBadge(value: unknown): value is YouTubeChatAuthorBadge {
  return isRecord(value) &&
    isBoundedString(value.label, 500) &&
    (
      value.kind === undefined ||
      value.kind === 'member' ||
      value.kind === 'moderator' ||
      value.kind === 'verified'
    ) &&
    (value.iconUrl === undefined || isSafeTransportUrl(value.iconUrl));
}

function isYouTubeChatColors(value: unknown): value is YouTubeChatMessageColors {
  if (!isRecord(value)) return false;
  return [
    value.authorName,
    value.background,
    value.bodyBackground,
    value.headerBackground,
    value.headerText,
    value.text,
    value.timestamp
  ].every((color) => color === undefined || (
    Number.isInteger(color) && Number(color) >= 0 && Number(color) <= 0xffffffff
  ));
}

function isPaidMetadata(value: unknown): value is YouTubeChatPaidMetadata {
  return isRecord(value) && isBoundedString(value.amountText, 500);
}

function isStickerMetadata(value: unknown): value is YouTubeChatStickerMetadata {
  return isRecord(value) &&
    isBoundedString(value.alt, 500) &&
    isStringWithin(value.amountText, 500) &&
    isSafeTransportUrl(value.imageUrl);
}

function isMembershipMetadata(value: unknown): value is YouTubeChatMembershipMetadata {
  return isRecord(value) &&
    isBoundedString(value.headerText, 2_000) &&
    (value.subtext === undefined || isStringWithin(value.subtext, 2_000));
}

function isGiftMetadata(value: unknown): value is YouTubeChatGiftMetadata {
  return isRecord(value) &&
    (value.giftType === 'purchase' || value.giftType === 'redemption') &&
    isBoundedString(value.headerText, 2_000) &&
    (value.alt === undefined || isStringWithin(value.alt, 500)) &&
    (value.imageUrl === undefined || isSafeTransportUrl(value.imageUrl)) &&
    (value.count === undefined || (
      Number.isSafeInteger(value.count) && Number(value.count) >= 0 && Number(value.count) <= 10_000
    ));
}

function isMessageKind(value: unknown): value is YouTubeChatMessageRecord['kind'] {
  return value === 'text' || value === 'paid' || value === 'sticker' ||
    value === 'membership' || value === 'gift';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function isStringWithin(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

function isSafeTransportUrl(value: unknown): value is string {
  if (!isBoundedString(value, MAX_URL_LENGTH)) return false;
  try {
    const url = new URL(value, 'https://www.youtube.com');
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
