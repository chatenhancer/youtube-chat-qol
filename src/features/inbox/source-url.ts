/**
 * Inbox source scoping.
 *
 * Derives a stable per-stream storage URL so saved Inbox records stay scoped to
 * the current livestream or replay instead of leaking across pages.
 */
export function getCurrentInboxSourceUrl(): string {
  return getWatchSourceUrl(window.location.href) ||
    getWatchSourceUrl(document.referrer) ||
    getLiveChatSourceUrl(window.location.href) ||
    getStablePageUrl(window.location.href);
}

function getWatchSourceUrl(value: string): string {
  if (!value) return '';

  try {
    const url = new URL(value);
    const videoId = url.searchParams.get('v');
    return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '';
  } catch {
    return '';
  }
}

function getLiveChatSourceUrl(value: string): string {
  if (!value) return '';

  try {
    const url = new URL(value);
    const continuation = url.searchParams.get('continuation');
    if (!continuation || !/\/live_chat(?:_replay)?$/.test(url.pathname)) return '';

    return `${url.origin}${url.pathname}?continuation=${encodeURIComponent(continuation)}`;
  } catch {
    return '';
  }
}

function getStablePageUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}
