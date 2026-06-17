/**
 * Channel popup helpers.
 *
 * Builds stable YouTube channel URLs and opens them in a small window positioned
 * near the live chat instead of navigating away from the stream.
 */
import { getAuthorHandleForUrl } from '../youtube/authors';
import { getChatAdjacentWindowFeatures } from './chat-adjacent-window';

const CHANNEL_WINDOW_WIDTH = 486;
const CHANNEL_WINDOW_HEIGHT = 680;

export function getChannelUrl(channelId: string | undefined, authorName: string): string {
  if (channelId) {
    return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
  }

  const authorHandle = getAuthorHandleForUrl(authorName);
  if (authorHandle) {
    return `https://www.youtube.com/${authorHandle}`;
  }

  return '';
}

export function openChannelWindow(url: string): void {
  if (!url) return;

  window.open(url, 'ytcq-profile', getChannelWindowFeatures());
}

function getChannelWindowFeatures(): string {
  return getChatAdjacentWindowFeatures({
    height: CHANNEL_WINDOW_HEIGHT,
    width: CHANNEL_WINDOW_WIDTH
  });
}
