/**
 * YouTube chat source identity helpers.
 *
 * Features that store per-stream state use this adapter so watch pages, live
 * chat iframes, and replay iframes resolve to the same stable source when
 * YouTube exposes enough URL/referrer data.
 */
import { cleanText } from '../shared/text';

export function getCurrentYouTubeChatSourceUrl(): string {
  return getCanonicalWatchSourceUrl(window.location.href) ||
    getCanonicalWatchSourceUrl(getAccessibleWindowHref(window.top)) ||
    getCanonicalWatchSourceUrl(getAccessibleWindowHref(window.parent)) ||
    getCanonicalWatchSourceUrl(document.referrer) ||
    getLiveChatSourceUrl(window.location.href) ||
    getStablePageUrl(window.location.href);
}

export function getCurrentYouTubeChatSourceTitle(): string {
  return getAccessibleDocumentTitle(window.top) ||
    getAccessibleDocumentTitle(window.parent) ||
    getDocumentTitle(document);
}

export function getCurrentYouTubeChatStreamKey(): string {
  const sourceUrl = getCurrentYouTubeChatSourceUrl();
  return getVideoIdFromUrl(sourceUrl) ||
    `source-${hashStorageKey(sourceUrl || window.location.href || 'unknown')}`;
}

export function getYouTubeChatSourceStorageKey(sourceUrl: string): string {
  const cleanSourceUrl = cleanText(sourceUrl);
  const videoId = getVideoIdFromUrl(cleanSourceUrl);
  if (videoId) return `video:${videoId}`;

  return `source:${hashStorageKey(cleanSourceUrl || 'unknown')}`;
}

function getCanonicalWatchSourceUrl(value: string): string {
  if (!value) return '';

  const videoId = getVideoIdFromUrl(value);
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '';
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

function getAccessibleWindowHref(context: Window | null): string {
  if (!context || context === window) return '';

  try {
    return context.location.href;
  } catch {
    return '';
  }
}

function getDocumentTitle(sourceDocument: Document): string {
  return cleanYouTubeTitle(sourceDocument.title) ||
    cleanYouTubeTitle(getMetaContent(sourceDocument, 'meta[property="og:title"]')) ||
    cleanYouTubeTitle(getMetaContent(sourceDocument, 'meta[name="title"]'));
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
    return cleanText(url.searchParams.get('v') || url.searchParams.get('video_id') || getVideoIdFromLiveChatContinuation(url));
  } catch {
    return '';
  }
}

function getVideoIdFromLiveChatContinuation(url: URL): string {
  if (!/\/live_chat(?:_replay)?$/.test(url.pathname)) return '';

  const continuation = url.searchParams.get('continuation') || '';
  if (!continuation) return '';

  return getMostRepeatedVideoIdCandidate(decodeContinuationStrings(continuation));
}

function decodeContinuationStrings(value: string): string[] {
  const decoded = new Set<string>();
  const pending = [value];

  while (pending.length && decoded.size < 20) {
    const current = pending.shift() || '';
    const normalized = current.trim();
    if (!normalized || decoded.has(normalized)) continue;

    decoded.add(normalized);
    const uriDecoded = safeDecodeURIComponent(normalized);
    if (uriDecoded && uriDecoded !== normalized) pending.push(uriDecoded);

    const binaryDecoded = safeBase64Decode(uriDecoded || normalized);
    if (!binaryDecoded) continue;

    decoded.add(binaryDecoded);
    getAsciiRuns(binaryDecoded)
      .filter((run) => run.length >= 12)
      .forEach((run) => pending.push(run));
  }

  return [...decoded];
}

function getMostRepeatedVideoIdCandidate(values: string[]): string {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    getAsciiRuns(value)
      .filter((run) => /^[a-zA-Z0-9_-]{11}$/.test(run))
      .forEach((candidate) => counts.set(candidate, (counts.get(candidate) || 0) + 1));
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function getAsciiRuns(value: string): string[] {
  return value.match(/[a-zA-Z0-9_%-]{4,}/g) || [];
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return '';
  }
}

function safeBase64Decode(value: string): string {
  let normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .replace(/\s/g, '');
  const paddingIndex = normalized.indexOf('=');
  if (paddingIndex !== -1) {
    normalized = normalized.slice(0, paddingIndex + (normalized[paddingIndex + 1] === '=' ? 2 : 1));
  }
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(normalized) || normalized.length < 8) return '';

  try {
    return atob(normalized);
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
