import type { RichTextSegment } from '../../youtube/rich-text';
import type { MessageTranslationRecord } from '../user-message-history';

export interface FocusSource {
  authorName: string;
  avatarSrc?: string;
  channelId?: string;
}

export interface FocusRecord {
  authorName: string;
  contentParts: RichTextSegment[];
  id: number;
  messageId?: string;
  messageRef?: WeakRef<HTMLElement>;
  side: 'them' | 'us';
  text: string;
  timestampText: string;
  translation?: MessageTranslationRecord;
}
