/**
 * Inbox record creation and merging.
 *
 * Converts normalized feed messages into stored Inbox records and merges
 * mention plus keyword matches for the same message.
 */
import { formatMessageTimestamp } from '../../youtube/messages';
import { getChatTimestampValue } from '../../youtube/timestamps';
import type { YouTubeChatMessageRecord } from '../../youtube/chat-feed/protocol';
import { getYouTubeChatFeedRichTextSegments } from '../../youtube/chat-feed/rich-text';
import { mergeStrings } from './matching';
import type { InboxMatch, InboxRecord } from './types';

export interface InboxChatFeedRecordOptions {
  receivedAt: number;
  replayOffsetMs?: number;
  source: 'live' | 'replay';
  sourceUrl: string;
}

export function createInboxRecordFromChatFeed(
  sourceRecord: YouTubeChatMessageRecord,
  match: InboxMatch,
  options: InboxChatFeedRecordOptions
): InboxRecord | null {
  const authorName = sourceRecord.author?.name?.trim() || '';
  const text = sourceRecord.plainText.trim();
  if (!sourceRecord.id || !authorName || !text) return null;

  const timestampText = sourceRecord.timestampText || getChatFeedTimestampText(options);
  const timestamp = getChatFeedTimestamp(sourceRecord, timestampText, options);
  const matchedKeywords = mergeStrings([], match.keywords || []);
  const mentionHandles = match.mention
    ? mergeStrings([], match.mentionHandles || [])
    : [];

  return {
    id: `feed:${sourceRecord.id}`,
    authorName,
    avatarSrc: sourceRecord.author?.avatarUrl || undefined,
    channelId: sourceRecord.author?.channelId || undefined,
    contentParts: getYouTubeChatFeedRichTextSegments(sourceRecord),
    matchedKeywords,
    mention: match.mention === true,
    mentionHandles,
    messageId: sourceRecord.id,
    read: false,
    sourceUrl: options.sourceUrl,
    text,
    timestamp,
    timestampText
  };
}

export function mergeInboxRecords(
  existing: InboxRecord,
  incoming: InboxRecord,
  isReadNow: boolean,
  getLiveMessage: (record: InboxRecord) => HTMLElement | null
): InboxRecord {
  const nextMention = existing.mention || incoming.mention;
  const nextKeywords = mergeStrings(existing.matchedKeywords, incoming.matchedKeywords);
  const nextMentionHandles = mergeStrings(existing.mentionHandles, incoming.mentionHandles);
  const hasNewMatch = (
    nextMention !== existing.mention ||
    nextKeywords.length !== existing.matchedKeywords.length ||
    nextMentionHandles.length !== existing.mentionHandles.length
  );

  return {
    ...existing,
    contentParts: existing.contentParts.length ? existing.contentParts : incoming.contentParts,
    avatarSrc: existing.avatarSrc || incoming.avatarSrc,
    channelId: existing.channelId || incoming.channelId,
    matchedKeywords: nextKeywords,
    messageRef: getLiveMessage(incoming) ? incoming.messageRef : existing.messageRef,
    mention: nextMention,
    mentionHandles: nextMentionHandles,
    messageId: existing.messageId || incoming.messageId,
    read: hasNewMatch && !isReadNow ? false : existing.read
  };
}

export function recordsEqual(first: InboxRecord, second: InboxRecord): boolean {
  return first.read === second.read &&
    first.avatarSrc === second.avatarSrc &&
    first.channelId === second.channelId &&
    first.messageId === second.messageId &&
    first.mention === second.mention &&
    first.matchedKeywords.join('\n') === second.matchedKeywords.join('\n') &&
    first.mentionHandles.join('\n') === second.mentionHandles.join('\n');
}

export function hasTransientRecordUpdate(
  existing: InboxRecord,
  merged: InboxRecord,
  getLiveMessage: (record: InboxRecord) => HTMLElement | null
): boolean {
  return getLiveMessage(existing) !== getLiveMessage(merged);
}

function getChatFeedTimestamp(
  record: YouTubeChatMessageRecord,
  timestampText: string,
  options: InboxChatFeedRecordOptions
): number {
  if (options.source === 'live' && /^\d+$/.test(record.timestampUsec || '')) {
    const timestamp = Number(record.timestampUsec) / 1_000;
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }

  return getChatTimestampValue(timestampText, options.receivedAt, {
    preferElapsed: options.source === 'replay'
  }) ?? options.receivedAt;
}

function getChatFeedTimestampText(options: InboxChatFeedRecordOptions): string {
  if (options.source === 'replay' && options.replayOffsetMs !== undefined) {
    const totalSeconds = Math.max(0, Math.floor(options.replayOffsetMs / 1_000));
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  return formatMessageTimestamp(options.receivedAt);
}
