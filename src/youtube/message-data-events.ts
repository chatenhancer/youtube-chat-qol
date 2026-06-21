/**
 * Event names and sanitized payload shape for YouTube-owned chat renderer data.
 *
 * The page-world adapter reads a tiny allowlist from `renderer.data` and sends
 * it to the isolated extension world. Never pass the raw YouTube data object.
 */
export const YOUTUBE_MESSAGE_DATA_EVENT = 'ytcq:youtube-message-data';
export const YOUTUBE_MESSAGE_DATA_REQUEST_EVENT = 'ytcq:youtube-message-data-request';

export interface YouTubeMessageData {
  authorExternalChannelId?: string;
  authorName?: string;
  authorPhotoUrl?: string;
  messageId: string;
  timestampUsec?: string;
}
