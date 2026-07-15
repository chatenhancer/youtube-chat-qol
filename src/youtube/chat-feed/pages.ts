/** Supported YouTube chat documents for the normalized feed transport. */
const YOUTUBE_CHAT_FEED_HOSTNAMES = new Set([
  'studio.youtube.com',
  'www.youtube.com',
  'youtube.com'
]);

export function isYouTubeChatFeedLocation(
  locationValue: Pick<Location, 'hostname' | 'pathname'> = window.location
): boolean {
  return YOUTUBE_CHAT_FEED_HOSTNAMES.has(locationValue.hostname) &&
    isYouTubeChatFeedPath(locationValue.pathname);
}

export function isYouTubeChatFeedPath(pathname: string): boolean {
  return pathname === '/live_chat' || pathname === '/live_chat_replay';
}
