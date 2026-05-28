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
