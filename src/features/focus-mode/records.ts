/**
 * Focus mode record builder.
 *
 * Converts visible YouTube chat messages into local focus-panel records and
 * dedupes them against stable message IDs or live renderer references.
 */
import { cleanText } from '../../shared/text';
import { findMatchingLiveMessageRecordIndex } from '../../youtube/message-dedupe';
import {
  getAuthorName,
  getMessageContentSourceNodes,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText
} from '../../youtube/messages';
import { serializeRichMessageNodes } from '../../youtube/rich-text';
import { isCurrentUserAuthorName } from '../mention-detection';
import { getUserMessageRecordForMessage } from '../user-message-history';
import {
  isSelectedFocusAuthor,
  textMentionsFocusSource
} from './source';
import type { FocusRecord, FocusSource } from './types';

export function createFocusRecord(
  message: HTMLElement,
  source: FocusSource,
  records: FocusRecord[],
  nextId: () => number
): FocusRecord | null {
  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!authorName || !text) return null;

  const selectedAuthor = isSelectedFocusAuthor(message, source);
  const currentAuthor = isCurrentUserAuthorName(authorName);
  if (!selectedAuthor && !currentAuthor) return null;

  const side = currentAuthor ? 'us' : 'them';
  if (currentAuthor && !textMentionsFocusSource(text, source)) return null;

  const timestampText = getMessageTimestampText(message);
  const messageId = cleanText(getMessageStableId(message));
  const messageRef = new WeakRef(message);
  if (findMatchingLiveMessageRecordIndex(records, { messageId, messageRef }) >= 0) {
    return null;
  }

  return {
    authorName,
    contentParts: serializeRichMessageNodes(getMessageContentSourceNodes(message)),
    id: nextId(),
    messageId: messageId || undefined,
    messageRef,
    side,
    text,
    timestampText,
    translation: getUserMessageRecordForMessage(message)?.translation
  };
}

export function findFocusRecordForMessage(records: FocusRecord[], message: HTMLElement): FocusRecord | null {
  const messageId = cleanText(getMessageStableId(message));
  const messageRef = new WeakRef(message);
  const index = findMatchingLiveMessageRecordIndex(records, { messageId, messageRef });
  return index >= 0 ? records[index] : null;
}
