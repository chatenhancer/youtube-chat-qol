/** Adapts the normalized YouTube feed into recent-history records and actions. */
import { cleanText } from '../../shared/text';
import {
  formatMessageTimestamp,
  formatMessageTimestampUsec
} from '../../youtube/messages';
import { getChatTimestampValue, isLiveChatReplayUrl } from '../../youtube/timestamps';
import { getYouTubeChatFeedRecordState } from '../../youtube/chat-feed/records';
import { getYouTubeChatFeedRichTextSegments } from '../../youtube/chat-feed/rich-text';
import {
  subscribeYouTubeChatFeed,
  type YouTubeChatFeedBatch
} from '../../youtube/chat-feed/source';
import type { YouTubeChatMessageRecord } from '../../youtube/chat-feed/protocol';
import type { RichTextSegment } from '../../youtube/rich-text';

export interface UserMessageFeedRecord {
  authorName: string;
  avatarSrc?: string;
  channelId?: string;
  contentParts: RichTextSegment[];
  messageId: string;
  text: string;
  timestamp: number;
  timestampText: string;
}

export type UserMessageFeedUpdate =
  | { type: 'reset' }
  | { messageId: string; type: 'remove' }
  | { channelId: string; type: 'remove-author' }
  | { record: UserMessageFeedRecord; type: 'upsert' };

export function startUserMessageFeed(
  onBatch: (updates: readonly UserMessageFeedUpdate[]) => void
): () => void {
  const receivedAt = Date.now();
  const initialUpdates = getYouTubeChatFeedRecordState().records.flatMap((record) => {
    const normalized = normalizeFeedRecord(record, {
      receivedAt,
      replay: isLiveChatReplayUrl()
    });
    return normalized ? [{ record: normalized, type: 'upsert' as const }] : [];
  });
  if (initialUpdates.length) onBatch(initialUpdates);
  return subscribeYouTubeChatFeed({
    consumer: 'records',
    onBatch: (batch) => applyFeedBatch(batch, onBatch)
  });
}

function applyFeedBatch(
  batch: YouTubeChatFeedBatch,
  onBatch: (updates: readonly UserMessageFeedUpdate[]) => void
): void {
  const updates = batch.actions.flatMap((action): UserMessageFeedUpdate[] => {
    if (action.type === 'reset') {
      return [{ type: 'reset' }];
    }
    if (action.type === 'remove') {
      return [{ messageId: action.id, type: 'remove' }];
    }
    if (action.type === 'remove-author') {
      return [{ channelId: action.channelId, type: 'remove-author' }];
    }

    const record = normalizeFeedRecord(action.record, {
      receivedAt: batch.receivedAt,
      replay: action.replayOffsetMs !== undefined ||
        batch.source === 'replay' ||
        isLiveChatReplayUrl(),
      replayOffsetMs: action.replayOffsetMs
    });
    return record ? [{ record, type: 'upsert' }] : [];
  });
  if (updates.length) onBatch(updates);
}

function normalizeFeedRecord(
  source: YouTubeChatMessageRecord,
  context: {
    receivedAt: number;
    replay: boolean;
    replayOffsetMs?: number;
  }
): UserMessageFeedRecord | null {
  const messageId = cleanText(source.id);
  const authorName = cleanText(source.author?.name || '');
  const text = cleanText(source.plainText);
  if (!messageId || !authorName || !text) return null;

  const timestampText = context.replayOffsetMs === undefined
    ? cleanText(source.timestampText || '') ||
      formatMessageTimestampUsec(source.timestampUsec) ||
      formatMessageTimestamp(context.receivedAt)
    : formatReplayOffset(context.replayOffsetMs);

  return {
    authorName,
    avatarSrc: cleanText(source.author?.avatarUrl || '') || undefined,
    channelId: cleanText(source.author?.channelId || '') || undefined,
    contentParts: getYouTubeChatFeedRichTextSegments(source),
    messageId,
    text,
    timestamp: getFeedTimestamp(source, timestampText, context),
    timestampText
  };
}

function getFeedTimestamp(
  source: YouTubeChatMessageRecord,
  timestampText: string,
  context: { receivedAt: number; replay: boolean }
): number {
  if (!context.replay && /^\d+$/.test(source.timestampUsec || '')) {
    const timestamp = Number(source.timestampUsec) / 1_000;
    if (Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }

  return getChatTimestampValue(timestampText, context.receivedAt, {
    preferElapsed: context.replay
  }) ?? context.receivedAt;
}

function formatReplayOffset(offsetMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(offsetMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
