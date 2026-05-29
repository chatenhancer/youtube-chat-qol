/**
 * User message history type definitions.
 *
 * Shared record, translation, identity, and recent-user match contracts for
 * current-page message history.
 */
import type { RichTextSegment } from '../../youtube/rich-text';
import type { MessageTranslationRecord } from '../translation/types';
export type { MessageTranslationRecord } from '../translation/types';

export interface MessageRecord {
  id: number;
  authorName: string;
  avatarSrc?: string;
  contentParts: RichTextSegment[];
  messageId?: string;
  messageRef?: WeakRef<HTMLElement>;
  text: string;
  timestamp: number;
  timestampText: string;
  translation?: MessageTranslationRecord;
}

export interface UserIdentity {
  authorName?: string;
  channelId?: string;
}

export interface RecentUserMatch {
  authorName: string;
  avatarSrc?: string;
  identity: UserIdentity;
  latestMessage: MessageRecord;
}
