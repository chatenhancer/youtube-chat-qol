/** Converts normalized feed runs into the shared rich-text shape used by extension UI. */
import type { RichTextSegment } from '../rich-text';
import type { YouTubeChatMessageRecord } from './protocol';

const YOUTUBE_EMOJI_CLASS =
  'emoji yt-formatted-string style-scope yt-live-chat-text-message-renderer';

export function getYouTubeChatFeedRichTextSegments(
  record: Pick<YouTubeChatMessageRecord, 'plainText' | 'runs'>
): RichTextSegment[] {
  const segments = record.runs.flatMap<RichTextSegment>((run) => {
    if (run.type === 'text') {
      return run.text ? [{ text: run.text, type: 'text' }] : [];
    }
    if (!run.imageUrl || !run.alt) {
      return run.alt ? [{ text: run.alt, type: 'text' }] : [];
    }
    return [{
      alt: run.alt,
      className: YOUTUBE_EMOJI_CLASS,
      emojiId: run.emojiId || '',
      src: run.imageUrl,
      tooltip: run.shortcuts[0] || run.alt,
      type: 'emoji'
    }];
  });

  return segments.length || !record.plainText
    ? segments
    : [{ text: record.plainText, type: 'text' }];
}
