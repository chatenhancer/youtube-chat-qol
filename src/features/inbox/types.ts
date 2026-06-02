/**
 * Inbox type definitions.
 *
 * Shared contracts for saved Inbox records, match metadata, latest-record
 * command lookups, and inline highlight planning.
 */
import type { RichTextSegment } from '../../youtube/rich-text';

export interface InboxRecord {
  id: string;
  authorName: string;
  contentParts: RichTextSegment[];
  matchedKeywords: string[];
  messageRef?: WeakRef<HTMLElement>;
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
  normalizedText?: string;
  priority: number;
  text: string;
}

export interface InlineHighlightMatch {
  className: string;
  index: number;
  length: number;
  priority: number;
}
