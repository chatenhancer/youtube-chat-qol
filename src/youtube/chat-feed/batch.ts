/** Runtime validation for the page-world YouTube chat feed event boundary. */
import {
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

export function parseYouTubeChatFeedBatchDetail(
  detail: unknown
): YouTubeChatFeedTransportBatch | null {
  if (typeof detail !== 'string' || !detail) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (!Number.isSafeInteger(parsed.sequence) || Number(parsed.sequence) <= 0) return null;
  if (!Number.isFinite(parsed.receivedAt) || Number(parsed.receivedAt) < 0) return null;
  if (!isBatchSource(parsed.source)) return null;
  if (!Array.isArray(parsed.actions)) return null;
  if (!parsed.actions.every(isYouTubeChatFeedAction)) return null;
  if (
    parsed.continuationTimeoutMs !== undefined &&
    (!Number.isFinite(parsed.continuationTimeoutMs) ||
      Number(parsed.continuationTimeoutMs) < 0)
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
    value.every(isString)
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
  if (value.type === 'remove') return isNonEmptyString(value.id);
  if (value.type === 'remove-author') return isNonEmptyString(value.channelId);
  return value.type === 'upsert' && isYouTubeChatMessageRecord(value.record);
}

function isYouTubeChatMessageRecord(value: unknown): value is YouTubeChatMessageRecord {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isMessageKind(value.kind)) return false;
  if (!isString(value.plainText)) return false;
  if (!Array.isArray(value.runs) || !value.runs.every(isYouTubeChatRun)) {
    return false;
  }
  if (value.author !== undefined && !isYouTubeChatAuthor(value.author)) return false;
  if (value.colors !== undefined && !isYouTubeChatColors(value.colors)) return false;
  if (value.timestampText !== undefined && !isString(value.timestampText)) return false;
  if (
    value.timestampUsec !== undefined &&
    (!isString(value.timestampUsec) || !/^\d+$/.test(value.timestampUsec))
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
    return isString(value.text) &&
      (value.href === undefined || isSafeTransportUrl(value.href));
  }
  return value.type === 'emoji' &&
    isString(value.alt) &&
    isSafeTransportUrl(value.imageUrl) &&
    (value.emojiId === undefined || isString(value.emojiId)) &&
    Array.isArray(value.shortcuts) &&
    value.shortcuts.every(isString);
}

function isYouTubeChatAuthor(value: unknown): value is YouTubeChatAuthor {
  if (!isRecord(value) || !isNonEmptyString(value.name)) return false;
  if (value.channelId !== undefined && !isString(value.channelId)) {
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
  return Array.isArray(value.badges) && value.badges.every(isYouTubeChatBadge);
}

function isYouTubeChatBadge(value: unknown): value is YouTubeChatAuthorBadge {
  return isRecord(value) &&
    isString(value.label) &&
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
  return isRecord(value) && isString(value.amountText);
}

function isStickerMetadata(value: unknown): value is YouTubeChatStickerMetadata {
  return isRecord(value) &&
    isString(value.alt) &&
    isString(value.amountText) &&
    isSafeTransportUrl(value.imageUrl);
}

function isMembershipMetadata(value: unknown): value is YouTubeChatMembershipMetadata {
  return isRecord(value) &&
    isString(value.headerText) &&
    (value.subtext === undefined || isString(value.subtext));
}

function isGiftMetadata(value: unknown): value is YouTubeChatGiftMetadata {
  return isRecord(value) &&
    (value.giftType === 'purchase' || value.giftType === 'redemption') &&
    isString(value.headerText) &&
    (value.alt === undefined || isString(value.alt)) &&
    (value.imageUrl === undefined || isSafeTransportUrl(value.imageUrl)) &&
    (value.count === undefined || (
      Number.isSafeInteger(value.count) && Number(value.count) >= 0
    ));
}

function isMessageKind(value: unknown): value is YouTubeChatMessageRecord['kind'] {
  return value === 'text' || value === 'paid' || value === 'sticker' ||
    value === 'membership' || value === 'gift';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isSafeTransportUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value, 'https://www.youtube.com');
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
