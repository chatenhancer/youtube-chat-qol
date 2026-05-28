import type { RichTextSegment } from '../../youtube/rich-text';
import type { ProtectedToken } from '../translation/protected-placeholders';
import type { TranslationResult } from '../translation/render';

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

export interface MessageTranslationRecord {
  result: TranslationResult;
  sourceText: string;
  originalText: string;
  protectedTokens: ProtectedToken[];
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
