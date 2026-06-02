/**
 * Inbox record creation and merging.
 *
 * Converts live YouTube messages into stored Inbox records and merges mention
 * plus keyword matches for the same live message.
 */
import {
  getAuthorName,
  getMessageContentSourceNodes,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText
} from '../../youtube/messages';
import { serializeRichMessageNodes } from '../../youtube/rich-text';
import { mergeStrings } from './matching';
import { getInboxTimestamp } from './storage';
import type { InboxMatch, InboxRecord } from './types';

export function createInboxRecord(
  message: HTMLElement,
  match: InboxMatch,
  options: {
    getMentionHandles: (text: string) => string[];
    sourceUrl: string;
  }
): InboxRecord | null {
  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!authorName || !text) return null;

  const now = Date.now();
  const timestampText = getMessageTimestampText(message, now);
  const timestamp = getInboxTimestamp(message, timestampText, now);
  const matchedKeywords = mergeStrings([], match.keywords || []);
  const mentionHandles = match.mention
    ? mergeStrings([], match.mentionHandles?.length ? match.mentionHandles : options.getMentionHandles(text))
    : [];

  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    authorName,
    contentParts: serializeRichMessageNodes(getMessageContentSourceNodes(message)),
    matchedKeywords,
    messageRef: new WeakRef(message),
    mention: match.mention === true,
    mentionHandles,
    messageId: getMessageStableId(message),
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
