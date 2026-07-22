/**
 * Focus mode type definitions.
 *
 * Shared record and focused-user identity contracts used by the focus panel
 * and command integrations.
 */
import type { RichTextSegment } from '../../youtube/rich-text';
import type { MessageTranslationRecord } from '../translation/types';

export interface FocusSource {
  authorName: string;
  avatarSrc?: string;
  channelId?: string;
}

export interface FocusRecord {
  authorName: string;
  avatarSrc?: string;
  channelId?: string;
  contentParts: RichTextSegment[];
  id: number;
  historyKey: string;
  messageId?: string;
  messageRef?: WeakRef<HTMLElement>;
  side: 'them' | 'us';
  text: string;
  timestamp: number;
  timestampText: string;
  translation?: MessageTranslationRecord;
}
