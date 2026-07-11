/** Runtime validation for the page-world Lite chat event boundary. */
import {
  LITE_CHAT_PROTOCOL_VERSION,
  type LiteChatAction,
  type LiteChatAuthor,
  type LiteChatAuthorBadge,
  type LiteChatBatch,
  type LiteChatGiftMetadata,
  type LiteChatMembershipMetadata,
  type LiteChatMessageColors,
  type LiteChatMessageRecord,
  type LiteChatPaidMetadata,
  type LiteChatRichRun,
  type LiteChatStickerMetadata
} from './protocol';

const MAX_BATCH_DETAIL_LENGTH = 2_000_000;
const MAX_BATCH_ACTIONS = 500;
const MAX_DIAGNOSTIC_VALUES = 50;
const MAX_MESSAGE_ID_LENGTH = 240;
const MAX_CHANNEL_ID_LENGTH = 240;
const MAX_TEXT_LENGTH = 20_000;
const MAX_URL_LENGTH = 4_096;
const MAX_RUNS = 500;
const MAX_BADGES = 24;
const MAX_SHORTCUTS = 24;
export const MAX_LITE_CHAT_CONTINUATION_TIMEOUT_MS = 600_000;

export function parseLiteChatBatchDetail(detail: unknown): LiteChatBatch | null {
  if (typeof detail !== 'string' || !detail || detail.length > MAX_BATCH_DETAIL_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== LITE_CHAT_PROTOCOL_VERSION) return null;
  if (!Number.isSafeInteger(parsed.sequence) || Number(parsed.sequence) <= 0) return null;
  if (!Number.isFinite(parsed.receivedAt) || Number(parsed.receivedAt) < 0) return null;
  if (!isBatchSource(parsed.source)) return null;
  if (!Array.isArray(parsed.actions) || parsed.actions.length > MAX_BATCH_ACTIONS) return null;
  if (!parsed.actions.every(isLiteChatAction)) return null;
  if (
    parsed.continuationTimeoutMs !== undefined &&
    (!Number.isFinite(parsed.continuationTimeoutMs) ||
      Number(parsed.continuationTimeoutMs) < 0 ||
      Number(parsed.continuationTimeoutMs) > MAX_LITE_CHAT_CONTINUATION_TIMEOUT_MS)
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
  if (parsed.unreadableFeed !== undefined && typeof parsed.unreadableFeed !== 'boolean') return null;
  return parsed as unknown as LiteChatBatch;
}

function isDiagnosticList(value: unknown): boolean {
  return value === undefined || (
    Array.isArray(value) &&
    value.length <= MAX_DIAGNOSTIC_VALUES &&
    value.every((entry) => isBoundedString(entry, 240))
  );
}

function isBatchSource(value: unknown): value is LiteChatBatch['source'] {
  return value === 'initial' || value === 'live' || value === 'replay' || value === 'send';
}

function isLiteChatAction(value: unknown): value is LiteChatAction {
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
  return value.type === 'upsert' && isLiteChatMessageRecord(value.record);
}

function isLiteChatMessageRecord(value: unknown): value is LiteChatMessageRecord {
  if (!isRecord(value)) return false;
  if (!isBoundedString(value.id, MAX_MESSAGE_ID_LENGTH)) return false;
  if (!isMessageKind(value.kind)) return false;
  if (!isStringWithin(value.plainText, MAX_TEXT_LENGTH)) return false;
  if (!Array.isArray(value.runs) || value.runs.length > MAX_RUNS || !value.runs.every(isLiteChatRun)) {
    return false;
  }
  if (value.author !== undefined && !isLiteChatAuthor(value.author)) return false;
  if (value.colors !== undefined && !isLiteChatColors(value.colors)) return false;
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

function isLiteChatRun(value: unknown): value is LiteChatRichRun {
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

function isLiteChatAuthor(value: unknown): value is LiteChatAuthor {
  if (!isRecord(value) || !isBoundedString(value.name, 500)) return false;
  if (value.channelId !== undefined && !isStringWithin(value.channelId, MAX_CHANNEL_ID_LENGTH)) {
    return false;
  }
  if (value.avatarUrl !== undefined && !isSafeTransportUrl(value.avatarUrl)) return false;
  if (value.isOwner !== undefined && typeof value.isOwner !== 'boolean') return false;
  return Array.isArray(value.badges) &&
    value.badges.length <= MAX_BADGES &&
    value.badges.every(isLiteChatBadge);
}

function isLiteChatBadge(value: unknown): value is LiteChatAuthorBadge {
  return isRecord(value) &&
    isBoundedString(value.label, 500) &&
    (value.kind === undefined || value.kind === 'moderator' || value.kind === 'verified') &&
    (value.iconUrl === undefined || isSafeTransportUrl(value.iconUrl));
}

function isLiteChatColors(value: unknown): value is LiteChatMessageColors {
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

function isPaidMetadata(value: unknown): value is LiteChatPaidMetadata {
  return isRecord(value) && isBoundedString(value.amountText, 500);
}

function isStickerMetadata(value: unknown): value is LiteChatStickerMetadata {
  return isRecord(value) &&
    isBoundedString(value.alt, 500) &&
    isStringWithin(value.amountText, 500) &&
    isSafeTransportUrl(value.imageUrl);
}

function isMembershipMetadata(value: unknown): value is LiteChatMembershipMetadata {
  return isRecord(value) &&
    isBoundedString(value.headerText, 2_000) &&
    (value.subtext === undefined || isStringWithin(value.subtext, 2_000));
}

function isGiftMetadata(value: unknown): value is LiteChatGiftMetadata {
  return isRecord(value) &&
    (value.giftType === 'purchase' || value.giftType === 'redemption') &&
    isBoundedString(value.headerText, 2_000) &&
    (value.alt === undefined || isStringWithin(value.alt, 500)) &&
    (value.imageUrl === undefined || isSafeTransportUrl(value.imageUrl)) &&
    (value.count === undefined || (
      Number.isSafeInteger(value.count) && Number(value.count) >= 0 && Number(value.count) <= 10_000
    ));
}

function isMessageKind(value: unknown): value is LiteChatMessageRecord['kind'] {
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
