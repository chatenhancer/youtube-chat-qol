import type { ReplayTriviaTranscriptSegment } from '../../../../shared/playground/trivia';
import { getCurrentYouTubeChatStreamKey } from '../../../../youtube/source-url';

const DEFAULT_LANGUAGE_CODES = ['en'] as const;
const DEFAULT_WINDOW_SECONDS = 5 * 60;
const MAX_COMPACT_SEGMENT_GAP_SECONDS = 1.5;
const MAX_COMPACT_SEGMENT_TEXT_LENGTH = 480;
const INNERTUBE_ANDROID_CONTEXT = {
  client: {
    clientName: 'ANDROID',
    clientVersion: '20.10.38'
  }
};
const INNERTUBE_WEB_CLIENT_NAME = '1';
const INNERTUBE_WEB_CLIENT_VERSION_FALLBACK = '2.20260611.01.00';
const TRANSCRIPT_PANEL_ID = 'PAmodern_transcript_view';
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

interface YouTubeCaptionTrack {
  baseUrl?: string;
  isTranslatable?: boolean;
  kind?: string;
  languageCode?: string;
  name?: {
    runs?: { text?: string }[];
    simpleText?: string;
  };
}

interface YouTubePlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: YouTubeCaptionTrack[];
    };
  };
}

export interface FetchReplayTriviaTranscriptOptions {
  endSeconds?: number;
  languageCodes?: readonly string[];
  startSeconds?: number;
  videoId?: string;
}

export interface ReplayTriviaTranscriptWindow {
  endSeconds: number;
  languageCode?: string;
  segments: ReplayTriviaTranscriptSegment[];
  startSeconds: number;
  videoId: string;
}

interface CompactTranscriptSegmentDraft {
  endSeconds: number;
  startSeconds: number;
  text: string;
}

export async function fetchReplayTriviaTranscriptWindow(
  options: FetchReplayTriviaTranscriptOptions = {}
): Promise<ReplayTriviaTranscriptWindow> {
  const videoId = normalizeVideoId(options.videoId || getCurrentYouTubeChatStreamKey());
  if (!videoId) throw new Error('A YouTube video ID is required for Replay Trivia.');

  const languageCodes = options.languageCodes?.length ? options.languageCodes : DEFAULT_LANGUAGE_CODES;
  const playerResponse = await fetchYouTubePlayerResponse(videoId);
  const tracks = getCaptionTracks(playerResponse);
  const hasRequestedWindow = options.startSeconds !== undefined || options.endSeconds !== undefined;
  const startSeconds = Math.max(0, Math.floor(options.startSeconds || 0));
  const transcriptWindow = await fetchFirstUsableTranscriptWindow({
    endSeconds: options.endSeconds,
    hasRequestedWindow,
    languageCodes,
    startSeconds,
    tracks
  }) || await fetchTranscriptPanelWindow({
    endSeconds: options.endSeconds,
    hasRequestedWindow,
    startSeconds,
    videoId
  });
  if (!transcriptWindow) {
    throw new Error('No transcript text was found in this replay window.');
  }

  return {
    endSeconds: transcriptWindow.endSeconds,
    languageCode: transcriptWindow.track.languageCode || languageCodes[0],
    segments: compactTranscriptSegments(transcriptWindow.segments),
    startSeconds,
    videoId
  };
}

export function getTranscriptEndSeconds(segments: ReplayTriviaTranscriptSegment[]): number {
  return Math.max(1, ...segments.map((segment) => (
    segment.startSeconds + Math.max(0, segment.durationSeconds || 0)
  )));
}

export async function fetchYouTubePlayerResponse(videoId: string): Promise<YouTubePlayerResponse> {
  const watchHtml = await fetchWatchHtml(videoId);
  const initialResponse = extractInitialPlayerResponse(watchHtml);
  if (getCaptionTracks(initialResponse).length) return initialResponse;

  const apiKey = extractInnertubeApiKey(watchHtml);
  if (!apiKey) throw new Error('Could not find YouTube Innertube API key.');

  const response = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`, {
    body: JSON.stringify({
      context: INNERTUBE_ANDROID_CONTEXT,
      videoId
    }),
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  });
  if (!response.ok) throw new Error(`YouTube player request failed with ${response.status}.`);
  return response.json() as Promise<YouTubePlayerResponse>;
}

export function extractInitialPlayerResponse(html: string): YouTubePlayerResponse {
  return parseJsonObjectAfterMarker(html, 'ytInitialPlayerResponse') as YouTubePlayerResponse;
}

export function extractInnertubeApiKey(html: string): string {
  return /"INNERTUBE_API_KEY"\s*:\s*"([a-zA-Z0-9_-]+)"/.exec(html)?.[1] || '';
}

export function extractInnertubeClientVersion(html: string): string {
  return /"INNERTUBE_CLIENT_VERSION"\s*:\s*"([^"]+)"/.exec(html)?.[1] || '';
}

export function extractVisitorData(html: string): string {
  return /"VISITOR_DATA"\s*:\s*"([^"]+)"/.exec(html)?.[1] || '';
}

export function getCaptionTracks(playerResponse: YouTubePlayerResponse): YouTubeCaptionTrack[] {
  return playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
}

export function pickCaptionTrack(
  tracks: YouTubeCaptionTrack[],
  languageCodes: readonly string[] = DEFAULT_LANGUAGE_CODES
): YouTubeCaptionTrack | null {
  return getCaptionTrackCandidates(tracks, languageCodes)[0] || null;
}

function getCaptionTrackCandidates(
  tracks: YouTubeCaptionTrack[],
  languageCodes: readonly string[] = DEFAULT_LANGUAGE_CODES
): YouTubeCaptionTrack[] {
  const usableTracks = tracks.filter((track) => track.baseUrl && track.languageCode);
  const candidates: YouTubeCaptionTrack[] = [];
  const addTrack = (track: YouTubeCaptionTrack | undefined): void => {
    if (!track?.baseUrl) return;
    if (candidates.some((candidate) => candidate.baseUrl === track.baseUrl)) return;
    candidates.push(track);
  };

  for (const languageCode of languageCodes) {
    addTrack(usableTracks.find((track) => track.languageCode === languageCode && track.kind !== 'asr'));
    addTrack(usableTracks.find((track) => track.languageCode === languageCode));
  }

  for (const track of usableTracks) {
    if (track.kind !== 'asr') addTrack(track);
  }
  for (const track of usableTracks) {
    addTrack(track);
  }

  return candidates;
}

async function fetchFirstUsableTranscriptWindow({
  endSeconds: requestedEndSeconds,
  hasRequestedWindow,
  languageCodes,
  startSeconds,
  tracks
}: {
  endSeconds?: number;
  hasRequestedWindow: boolean;
  languageCodes: readonly string[];
  startSeconds: number;
  tracks: YouTubeCaptionTrack[];
}): Promise<{
  endSeconds: number;
  segments: ReplayTriviaTranscriptSegment[];
  track: YouTubeCaptionTrack;
} | null> {
  const candidates = getCaptionTrackCandidates(tracks, languageCodes);
  if (!candidates.length) return null;

  for (const track of candidates) {
    if (!track.baseUrl) continue;
    const allSegments = await fetchCaptionTrackSegments(track.baseUrl);
    if (!allSegments.length) continue;

    const endSeconds = Math.max(
      startSeconds + 1,
      requestedEndSeconds || (
        hasRequestedWindow ? startSeconds + DEFAULT_WINDOW_SECONDS : getTranscriptEndSeconds(allSegments)
      )
    );
    const segments = createTranscriptWindow(allSegments, startSeconds, endSeconds);
    if (segments.length) return { endSeconds, segments, track };
  }

  return null;
}

async function fetchTranscriptPanelWindow({
  endSeconds: requestedEndSeconds,
  hasRequestedWindow,
  startSeconds,
  videoId
}: {
  endSeconds?: number;
  hasRequestedWindow: boolean;
  startSeconds: number;
  videoId: string;
}): Promise<{
  endSeconds: number;
  segments: ReplayTriviaTranscriptSegment[];
  track: YouTubeCaptionTrack;
} | null> {
  const allSegments = await fetchTranscriptPanelSegments(videoId);
  if (!allSegments.length) return null;

  const endSeconds = Math.max(
    startSeconds + 1,
    requestedEndSeconds || (
      hasRequestedWindow ? startSeconds + DEFAULT_WINDOW_SECONDS : getTranscriptEndSeconds(allSegments)
    )
  );
  const segments = createTranscriptWindow(allSegments, startSeconds, endSeconds);
  if (!segments.length) return null;

  return {
    endSeconds,
    segments,
    track: {
      languageCode: DEFAULT_LANGUAGE_CODES[0]
    }
  };
}

export async function fetchTranscriptPanelSegments(videoId: string): Promise<ReplayTriviaTranscriptSegment[]> {
  const watchHtml = await fetchWatchHtml(videoId);
  const apiKey = extractInnertubeApiKey(watchHtml);
  const clientVersion = extractInnertubeClientVersion(watchHtml) || INNERTUBE_WEB_CLIENT_VERSION_FALLBACK;
  const visitorData = extractVisitorData(watchHtml);
  const authorization = await createYouTubeAuthorizationHeader();
  const url = new URL('https://www.youtube.com/youtubei/v1/get_panel');
  url.searchParams.set('prettyPrint', 'false');
  if (apiKey && !authorization) url.searchParams.set('key', apiKey);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Origin': 'https://www.youtube.com',
    'X-Goog-AuthUser': '0',
    'X-YouTube-Client-Name': INNERTUBE_WEB_CLIENT_NAME,
    'X-YouTube-Client-Version': clientVersion
  };
  if (authorization) headers.Authorization = authorization;
  if (apiKey && !authorization) headers['X-Goog-Api-Key'] = apiKey;
  if (visitorData) headers['X-Goog-Visitor-Id'] = visitorData;

  const response = await fetch(url.toString(), {
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion,
          gl: 'US',
          hl: 'en',
          originalUrl: `https://www.youtube.com/watch?v=${videoId}`,
          platform: 'DESKTOP',
          userAgent: getNavigatorUserAgent()
        },
        request: {
          consistencyTokenJars: [],
          internalExperimentFlags: [],
          useSsl: true
        },
        user: {
          lockedSafetyMode: false
        }
      },
      panelId: TRANSCRIPT_PANEL_ID,
      params: createTranscriptPanelParams(videoId)
    }),
    credentials: 'include',
    headers,
    method: 'POST'
  });
  if (!response.ok) return [];

  return parseTranscriptPanelSegments(await response.json());
}

export function createTranscriptPanelParams(videoId: string): string {
  const videoIdBytes = Array.from(new TextEncoder().encode(videoId));
  const innerLength = 2 + videoIdBytes.length + 2;
  return base64UrlEncodeBytes([
    0xaa,
    0x09,
    ...encodeVarint(innerLength),
    0x0a,
    ...encodeVarint(videoIdBytes.length),
    ...videoIdBytes,
    0x18,
    0x01
  ]);
}

export async function fetchCaptionTrackSegments(baseUrl: string): Promise<ReplayTriviaTranscriptSegment[]> {
  const url = new URL(baseUrl);
  url.searchParams.set('fmt', 'json3');

  const response = await fetch(url.toString(), {
    credentials: 'include'
  });
  if (!response.ok) throw new Error(`Transcript request failed with ${response.status}.`);

  const rawText = await response.text();
  try {
    return parseJson3Transcript(JSON.parse(rawText));
  } catch {
    return parseXmlTranscript(rawText);
  }
}

export function parseJson3Transcript(value: unknown): ReplayTriviaTranscriptSegment[] {
  if (!value || typeof value !== 'object') return [];
  const events = (value as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];

  return events
    .map((event): ReplayTriviaTranscriptSegment | null => {
      if (!event || typeof event !== 'object') return null;
      const candidate = event as {
        dDurationMs?: unknown;
        segs?: { utf8?: unknown }[];
        tStartMs?: unknown;
      };
      if (!Array.isArray(candidate.segs) || typeof candidate.tStartMs !== 'number') return null;

      const text = cleanTranscriptText(candidate.segs.map((segment) => (
        typeof segment.utf8 === 'string' ? segment.utf8 : ''
      )).join(''));
      if (!text) return null;

      const segment: ReplayTriviaTranscriptSegment = {
        startSeconds: candidate.tStartMs / 1000,
        text
      };
      if (typeof candidate.dDurationMs === 'number') segment.durationSeconds = candidate.dDurationMs / 1000;
      return segment;
    })
    .filter((segment): segment is ReplayTriviaTranscriptSegment => Boolean(segment));
}

export function parseXmlTranscript(value: string): ReplayTriviaTranscriptSegment[] {
  const document = new DOMParser().parseFromString(value, 'text/xml');
  return Array.from(document.querySelectorAll('text'))
    .map((element): ReplayTriviaTranscriptSegment | null => {
      const startSeconds = Number(element.getAttribute('start'));
      const durationSeconds = Number(element.getAttribute('dur') || '0');
      const text = cleanTranscriptText(element.textContent || '');
      if (!Number.isFinite(startSeconds) || !text) return null;

      const segment: ReplayTriviaTranscriptSegment = {
        startSeconds,
        text
      };
      if (Number.isFinite(durationSeconds)) segment.durationSeconds = durationSeconds;
      return segment;
    })
    .filter((segment): segment is ReplayTriviaTranscriptSegment => Boolean(segment));
}

export function parseTranscriptPanelSegments(value: unknown): ReplayTriviaTranscriptSegment[] {
  const markerItems = findMacroMarkerItems(value);
  const segments = markerItems
    .map(parseMacroMarkerItem)
    .filter((segment): segment is ReplayTriviaTranscriptSegment => Boolean(segment))
    .sort((left, right) => left.startSeconds - right.startSeconds);

  const uniqueSegments = segments.filter((segment, index) => {
    const previous = segments[index - 1];
    return !previous || previous.startSeconds !== segment.startSeconds || previous.text !== segment.text;
  });

  return uniqueSegments.map((segment, index) => {
    if (segment.durationSeconds !== undefined) return segment;

    const nextStartSeconds = uniqueSegments[index + 1]?.startSeconds;
    const durationSeconds = nextStartSeconds !== undefined && nextStartSeconds > segment.startSeconds
      ? nextStartSeconds - segment.startSeconds
      : 3;
    return {
      ...segment,
      durationSeconds
    };
  });
}

export function createTranscriptWindow(
  segments: ReplayTriviaTranscriptSegment[],
  startSeconds: number,
  endSeconds: number
): ReplayTriviaTranscriptSegment[] {
  return segments.filter((segment) => {
    const segmentEnd = segment.durationSeconds !== undefined
      ? segment.startSeconds + Math.max(0, segment.durationSeconds)
      : segment.startSeconds;
    return segment.startSeconds < endSeconds && segmentEnd > startSeconds;
  });
}

export function compactTranscriptSegments(
  segments: ReplayTriviaTranscriptSegment[]
): ReplayTriviaTranscriptSegment[] {
  const compacted: ReplayTriviaTranscriptSegment[] = [];
  let current: CompactTranscriptSegmentDraft | null = null;

  const flushCurrent = (): void => {
    if (!current) return;
    compacted.push(createCompactSegment(current.startSeconds, current.endSeconds, current.text));
    current = null;
  };

  for (const segment of segments) {
    const text = segment.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const startSeconds = segment.startSeconds;
    const endSeconds = getSegmentEndSeconds(segment);
    if (!current) {
      current = { endSeconds, startSeconds, text };
      continue;
    }

    const nextText: string = `${current.text} ${text}`;
    const gapSeconds = startSeconds - current.endSeconds;
    if (gapSeconds <= MAX_COMPACT_SEGMENT_GAP_SECONDS && nextText.length <= MAX_COMPACT_SEGMENT_TEXT_LENGTH) {
      current = {
        endSeconds: Math.max(current.endSeconds, endSeconds),
        startSeconds: current.startSeconds,
        text: nextText
      };
      continue;
    }

    flushCurrent();
    current = { endSeconds, startSeconds, text };
  }

  flushCurrent();
  return compacted;
}

function createCompactSegment(startSeconds: number, endSeconds: number, text: string): ReplayTriviaTranscriptSegment {
  const durationSeconds = Math.max(0, endSeconds - startSeconds);
  return durationSeconds > 0
    ? { durationSeconds, startSeconds, text }
    : { startSeconds, text };
}

function getSegmentEndSeconds(segment: ReplayTriviaTranscriptSegment): number {
  return segment.durationSeconds !== undefined
    ? segment.startSeconds + Math.max(0, segment.durationSeconds)
    : segment.startSeconds;
}

function fetchWatchHtml(videoId: string): Promise<string> {
  return fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
    credentials: 'include'
  }).then((response) => {
    if (!response.ok) throw new Error(`YouTube watch request failed with ${response.status}.`);
    return response.text();
  });
}

function getNavigatorUserAgent(): string {
  return typeof navigator === 'undefined' ? 'Mozilla/5.0' : navigator.userAgent;
}

async function createYouTubeAuthorizationHeader(): Promise<string> {
  const cookieMap = getCookieMap();
  const timestamp = Math.floor(Date.now() / 1000);
  const origin = 'https://www.youtube.com';
  const parts = await Promise.all([
    createSapSidAuthPart('SAPISIDHASH', cookieMap.get('SAPISID'), timestamp, origin),
    createSapSidAuthPart('SAPISID1PHASH', cookieMap.get('__Secure-1PAPISID'), timestamp, origin),
    createSapSidAuthPart('SAPISID3PHASH', cookieMap.get('__Secure-3PAPISID'), timestamp, origin)
  ]);
  return parts.filter(Boolean).join(' ');
}

async function createSapSidAuthPart(
  label: string,
  cookieValue: string | undefined,
  timestamp: number,
  origin: string
): Promise<string> {
  if (!cookieValue) return '';
  const digest = await sha1Hex(`${timestamp} ${cookieValue} ${origin}`);
  return digest ? `${label} ${timestamp}_${digest}_u` : '';
}

function getCookieMap(): Map<string, string> {
  const cookieSource = typeof document === 'undefined' ? '' : document.cookie;
  const cookieMap = new Map<string, string>();
  for (const cookie of cookieSource.split(';')) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) continue;
    const name = cookie.slice(0, separatorIndex).trim();
    const value = cookie.slice(separatorIndex + 1).trim();
    if (name) cookieMap.set(name, value);
  }
  return cookieMap;
}

async function sha1Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';

  const digest = await subtle.digest('SHA-1', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function findMacroMarkerItems(value: unknown, items: unknown[] = []): unknown[] {
  if (!value || typeof value !== 'object') return items;
  if ('macroMarkersPanelItemViewModel' in value) {
    items.push((value as { macroMarkersPanelItemViewModel?: unknown }).macroMarkersPanelItemViewModel);
    return items;
  }

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) findMacroMarkerItems(item, items);
    } else {
      findMacroMarkerItems(child, items);
    }
  }

  return items;
}

function parseMacroMarkerItem(value: unknown): ReplayTriviaTranscriptSegment | null {
  if (!value || typeof value !== 'object') return null;
  const text = findTranscriptPanelText(value);
  if (!text) return null;

  const startSeconds = findStartSeconds(value);
  if (startSeconds === null) return null;

  return {
    startSeconds,
    text
  };
}

function findTranscriptPanelText(value: unknown): string {
  const transcriptSegment = findFirstObjectWithKey(value, 'transcriptSegmentViewModel') as {
    transcriptSegmentViewModel?: {
      runs?: { text?: unknown }[];
      simpleText?: unknown;
    };
  } | null;
  const model = transcriptSegment?.transcriptSegmentViewModel;
  if (!model) return '';
  if (typeof model.simpleText === 'string') return cleanTranscriptText(model.simpleText);
  if (Array.isArray(model.runs)) {
    return cleanTranscriptText(model.runs.map((run) => (
      typeof run.text === 'string' ? run.text : ''
    )).join(''));
  }
  return '';
}

function findStartSeconds(value: unknown): number | null {
  const watchEndpoint = findFirstObjectWithKey(value, 'watchEndpoint') as {
    watchEndpoint?: {
      startTimeSeconds?: unknown;
    };
  } | null;
  const startTimeSeconds = watchEndpoint?.watchEndpoint?.startTimeSeconds;
  if (typeof startTimeSeconds === 'number' && Number.isFinite(startTimeSeconds)) return startTimeSeconds;
  if (typeof startTimeSeconds === 'string') {
    const parsed = Number(startTimeSeconds);
    if (Number.isFinite(parsed)) return parsed;
  }

  const transcriptSegment = findFirstObjectWithKey(value, 'transcriptSegmentViewModel') as {
    transcriptSegmentViewModel?: {
      timestamp?: unknown;
    };
  } | null;
  const timestamp = transcriptSegment?.transcriptSegmentViewModel?.timestamp;
  return typeof timestamp === 'string' ? parseTimestampSeconds(timestamp) : null;
}

function findFirstObjectWithKey(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  if (key in value) return value as Record<string, unknown>;

  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findFirstObjectWithKey(item, key);
        if (found) return found;
      }
    } else {
      const found = findFirstObjectWithKey(child, key);
      if (found) return found;
    }
  }

  return null;
}

function parseTimestampSeconds(value: string): number | null {
  const parts = value.split(':').map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;

  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds;
}

function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  while (remaining >= 0x80) {
    bytes.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 0x80);
  }
  bytes.push(remaining);
  return bytes;
}

function base64UrlEncodeBytes(bytes: number[]): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function normalizeVideoId(value: string): string {
  const trimmed = value.trim();
  return YOUTUBE_VIDEO_ID_PATTERN.test(trimmed) ? trimmed : '';
}

function parseJsonObjectAfterMarker(source: string, marker: string): Record<string, unknown> {
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) return {};

  const objectStart = source.indexOf('{', markerIndex + marker.length);
  if (objectStart === -1) return {};

  const objectEnd = findJsonObjectEnd(source, objectStart);
  if (objectEnd === -1) return {};

  try {
    const parsed = JSON.parse(source.slice(objectStart, objectEnd + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function findJsonObjectEnd(source: string, objectStart: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function cleanTranscriptText(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim();
}
