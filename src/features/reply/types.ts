/**
 * Reply type definitions.
 *
 * Shared contracts for rich quote content and options that control focus-mode
 * prompts during mention or quote insertion.
 */
import type { RichTextSegment } from '../../youtube/rich-text';

export interface RichQuoteContent {
  nodes?: Node[];
  segments?: RichTextSegment[];
}

export interface ReplyInsertOptions {
  focusSource?: {
    authorName: string;
    avatarSrc?: string;
    channelId?: string;
  };
  skipFocusPrompt?: boolean;
}
