import type { RichTextSegment } from '../../youtube/richText';

export interface InboxRecord {
  id: string;
  authorName: string;
  contentNodes?: Node[];
  contentParts?: RichTextSegment[];
  matchedKeywords: string[];
  mention: boolean;
  mentionHandles: string[];
  messageId?: string;
  read: boolean;
  sourceUrl: string;
  text: string;
  timestamp: number;
  timestampText: string;
}

export interface InboxMatch {
  keywords?: string[];
  mention?: boolean;
  mentionHandles?: string[];
}

export interface LatestInboxRecord {
  authorName: string;
  text: string;
}

export interface InlineHighlightTerm {
  className: string;
  priority: number;
  text: string;
}

export interface InlineHighlightMatch {
  className: string;
  index: number;
  length: number;
  priority: number;
}
