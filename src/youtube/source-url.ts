/**
 * YouTube chat source identity helpers.
 *
 * Features that store per-stream state use this adapter so watch pages, live
 * chat iframes, and replay iframes resolve to the same stable source when
 * YouTube exposes enough URL/referrer data.
 */
import { cleanText } from '../shared/text';

export function getCurrentYouTubeChatSourceUrl(): string {
  return getWatchSourceUrl(window.location.href) ||
    getWatchSourceUrl(document.referrer) ||
    getLiveChatSourceUrl(window.location.href) ||
    getStablePageUrl(window.location.href);
}

export function getCurrentYouTubeChatSourceTitle(): string {
  return getAccessibleDocumentTitle(window.top) ||
    getAccessibleDocumentTitle(window.parent) ||
    getDocumentTitle(document);
}

export function getYouTubeChatSourceStorageKey(sourceUrl: string): string {
  const cleanSourceUrl = cleanText(sourceUrl);
  const videoId = getVideoIdFromUrl(cleanSourceUrl);
  if (videoId) return `video:${videoId}`;

  return `source:${hashStorageKey(cleanSourceUrl || 'unknown')}`;
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

function getAccessibleDocumentTitle(context: Window | null): string {
  if (!context) return '';

  try {
    return context.document === document ? '' : getDocumentTitle(context.document);
  } catch {
    return '';
  }
}

function getDocumentTitle(sourceDocument: Document): string {
  return cleanYouTubeTitle(
    getMetaContent(sourceDocument, 'meta[property="og:title"]') ||
    getMetaContent(sourceDocument, 'meta[name="title"]') ||
    sourceDocument.title
  );
}

function getMetaContent(sourceDocument: Document, selector: string): string {
  return cleanText(sourceDocument.querySelector<HTMLMetaElement>(selector)?.content);
}

function cleanYouTubeTitle(value: string): string {
  const title = cleanText(value)
    .replace(/^\(\d+\)\s+/, '')
    .replace(/\s+-\s+YouTube$/i, '');

  return /^(youtube|live chat|live chat replay)$/i.test(title) ? '' : title;
}

function getStablePageUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function getVideoIdFromUrl(value: string): string {
  if (!value) return '';

  try {
    const url = new URL(value);
    return cleanText(url.searchParams.get('v') || url.searchParams.get('video_id') || '');
  } catch {
    return '';
  }
}

function hashStorageKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}
