/** Builds Focus mode rows from the canonical current-page message history. */
import { cleanText } from '../../shared/text';
import { isCurrentUserAuthorName } from '../mention-detection';
import {
  getUserKeyFromIdentity,
  type MessageRecord
} from '../user-message-history';
import {
  isSelectedFocusIdentity,
  textMentionsFocusSource
} from './source';
import type { FocusRecord, FocusSource } from './types';

export function createFocusRecordFromHistory(
  record: MessageRecord,
  source: FocusSource
): FocusRecord | null {
  const selectedAuthor = isSelectedFocusIdentity(record, source);
  const currentAuthor = isCurrentUserAuthorName(record.authorName);
  if (!selectedAuthor && !currentAuthor) return null;
  if (currentAuthor && !textMentionsFocusSource(record.text, source)) return null;

  return {
    authorName: record.authorName,
    contentParts: record.contentParts,
    historyKey: getUserKeyFromIdentity(record),
    id: record.id,
    messageId: cleanText(record.messageId) || undefined,
    messageRef: record.messageRef,
    side: currentAuthor ? 'us' : 'them',
    text: record.text,
    timestampText: record.timestampText,
    translation: record.translation
  };
}
