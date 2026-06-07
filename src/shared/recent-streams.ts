/**
 * Browser-local recent stream records.
 *
 * Recent streams are keyed by YouTube video ID so a watch page, live chat
 * frame, replay frame, and short youtu.be URL all update the same record.
 */
import { cleanText } from './text';

export const RECENT_STREAMS_STORAGE_KEY = 'ytcqRecentStreams';
export const MAX_RECENT_STREAMS = 30;

export interface RecentStreamVisit {
  channelName?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  visitedAt?: number;
}

export interface RecentStreamRecord {
  channelName?: string;
  lastVisitedAt: number;
  title: string;
  url: string;
  visitCount: number;
}

export type StoredRecentStreams = Record<string, RecentStreamRecord>;

export function getRecentStreamKey(sourceUrl: string): string {
  const videoId = getYouTubeVideoIdFromUrl(sourceUrl);
  return videoId ? `video:${videoId}` : '';
}

export function getCanonicalYouTubeWatchUrl(sourceUrl: string): string {
  const videoId = getYouTubeVideoIdFromUrl(sourceUrl);
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : '';
}

export function getRecentStreamThumbnailUrl(sourceUrl: string): string {
  const videoId = getYouTubeVideoIdFromUrl(sourceUrl);
  return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg` : '';
}

export function getYouTubeVideoIdFromUrl(sourceUrl: string): string {
  const cleanSourceUrl = cleanText(sourceUrl);
  if (!cleanSourceUrl) return '';

  try {
    const url = new URL(cleanSourceUrl);
    if (!isYouTubeHost(url.hostname)) return '';

    const pathParts = url.pathname.split('/').filter(Boolean);
    const host = url.hostname.toLowerCase();
    const rawVideoId = host === 'youtu.be'
      ? pathParts[0]
      : url.searchParams.get('v') || url.searchParams.get('video_id') || getPathVideoId(pathParts);

    return normalizeVideoId(rawVideoId || '');
  } catch {
    return '';
  }
}

export function cleanRecentStreamTitle(value: unknown): string {
  const title = cleanText(value)
    .replace(/^\(\d+\)\s+/, '')
    .replace(/\s+-\s+YouTube$/i, '');

  return /^(youtube|live chat|live chat replay)$/i.test(title) ? '' : title;
}

export function normalizeStoredRecentStreams(value: unknown): Map<string, RecentStreamRecord> {
  const next = new Map<string, RecentStreamRecord>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next;

  Object.entries(value as Record<string, unknown>).forEach(([key, record]) => {
    if (!record || typeof record !== 'object') return;

    const candidate = record as Partial<RecentStreamRecord>;
    const url = getCanonicalYouTubeWatchUrl(candidate.url || '');
    const normalizedKey = getRecentStreamKey(url);
    if (!url || !normalizedKey || normalizedKey !== key) return;

    const lastVisitedAt = Number(candidate.lastVisitedAt);
    const visitCount = Number(candidate.visitCount);
    next.set(normalizedKey, {
      channelName: cleanText(candidate.channelName) || undefined,
      lastVisitedAt: Number.isFinite(lastVisitedAt) && lastVisitedAt > 0 ? lastVisitedAt : 0,
      title: cleanRecentStreamTitle(candidate.title) || url,
      url,
      visitCount: Number.isFinite(visitCount) && visitCount > 0 ? Math.floor(visitCount) : 1
    });
  });

  trimRecentStreams(next);
  return next;
}

export function serializeRecentStreams(records: Map<string, RecentStreamRecord>): StoredRecentStreams {
  return Object.fromEntries(getSortedRecentStreamEntries(records));
}

export function upsertRecentStreamVisit(
  records: Map<string, RecentStreamRecord>,
  visit: RecentStreamVisit,
  maxRecords = MAX_RECENT_STREAMS
): string {
  const url = getCanonicalYouTubeWatchUrl(visit.sourceUrl || '');
  const key = getRecentStreamKey(url);
  if (!url || !key) return '';

  const existing = records.get(key);
  const visitedAt = Number(visit.visitedAt);
  const title = cleanRecentStreamTitle(visit.sourceTitle) || existing?.title || url;
  const channelName = cleanText(visit.channelName) || existing?.channelName;

  records.set(key, {
    channelName: channelName || undefined,
    lastVisitedAt: Number.isFinite(visitedAt) && visitedAt > 0 ? visitedAt : Date.now(),
    title,
    url,
    visitCount: (existing?.visitCount || 0) + 1
  });
  trimRecentStreams(records, maxRecords);
  return key;
}

export function getSortedRecentStreamEntries(
  records: Map<string, RecentStreamRecord>
): Array<[string, RecentStreamRecord]> {
  return Array.from(records.entries()).sort((firstEntry, secondEntry) => {
    const first = firstEntry[1];
    const second = secondEntry[1];
    return second.lastVisitedAt - first.lastVisitedAt || first.title.localeCompare(second.title);
  });
}

function trimRecentStreams(records: Map<string, RecentStreamRecord>, maxRecords = MAX_RECENT_STREAMS): void {
  if (records.size <= maxRecords) return;

  const entries = getSortedRecentStreamEntries(records).slice(0, maxRecords);
  records.clear();
  entries.forEach(([key, record]) => records.set(key, record));
}

function getPathVideoId(pathParts: string[]): string {
  const prefixedVideoIdIndex = pathParts.findIndex((part) => /^(embed|live|shorts)$/i.test(part));
  return prefixedVideoIdIndex >= 0 ? pathParts[prefixedVideoIdIndex + 1] || '' : '';
}

function normalizeVideoId(value: string): string {
  const videoId = cleanText(value);
  return /^[A-Za-z0-9_-]+$/.test(videoId) ? videoId : '';
}

function isYouTubeHost(hostname: string): boolean {
  return /(^|\.)youtube\.com$/i.test(hostname) || /^youtu\.be$/i.test(hostname);
}
