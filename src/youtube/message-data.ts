/**
 * Isolated-world receiver for sanitized YouTube message data.
 */
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT,
  type YouTubeMessageData
} from './message-data-events';
import { getMessageStableId } from './messages';
import { CHAT_MESSAGE_SELECTOR } from './selectors';

export type YouTubeMessageDataListener = (
  message: HTMLElement,
  data: YouTubeMessageData
) => void;

const DATA_CACHE_LIMIT = 800;

const listeners = new Set<YouTubeMessageDataListener>();
const messageDataById = new Map<string, YouTubeMessageData>();
const cachedMessageIds: string[] = [];
let started = false;

export type { YouTubeMessageData };

export function initYouTubeMessageData(listener: YouTubeMessageDataListener): void {
  listeners.add(listener);
  if (started) {
    requestYouTubeMessageDataScan();
    return;
  }

  started = true;
  window.addEventListener(YOUTUBE_MESSAGE_DATA_EVENT, handleYouTubeMessageDataEvent);
  requestYouTubeMessageDataScan();
}

export function getYouTubeMessageData(message: HTMLElement): YouTubeMessageData | null {
  const messageId = getMessageStableId(message);
  return messageId ? messageDataById.get(messageId) || null : null;
}

function handleYouTubeMessageDataEvent(event: Event): void {
  if (!(event instanceof CustomEvent)) return;
  const data = parseYouTubeMessageData(event.detail);
  if (!data) return;

  rememberYouTubeMessageData(data);
  const message = findYouTubeMessageById(data.messageId);
  if (!message) return;
  listeners.forEach((listener) => listener(message, data));
}

function parseYouTubeMessageData(value: unknown): YouTubeMessageData | null {
  if (typeof value !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const messageId = cleanMessageDataText(record.messageId, 160);
  if (!messageId) return null;

  const data: YouTubeMessageData = { messageId };
  const timestampUsec = cleanMessageDataText(record.timestampUsec, 24);
  const authorExternalChannelId = cleanMessageDataText(record.authorExternalChannelId, 160);
  const authorName = cleanMessageDataText(record.authorName, 160);
  const authorPhotoUrl = cleanMessageDataText(record.authorPhotoUrl, 2_000);

  if (/^\d{1,24}$/.test(timestampUsec)) data.timestampUsec = timestampUsec;
  if (authorExternalChannelId) data.authorExternalChannelId = authorExternalChannelId;
  if (authorName) data.authorName = authorName;
  if (authorPhotoUrl) data.authorPhotoUrl = authorPhotoUrl;

  return Object.keys(data).length > 1 ? data : null;
}

function cleanMessageDataText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function rememberYouTubeMessageData(data: YouTubeMessageData): void {
  if (!messageDataById.has(data.messageId)) cachedMessageIds.push(data.messageId);
  messageDataById.set(data.messageId, data);
  while (cachedMessageIds.length > DATA_CACHE_LIMIT) {
    const oldest = cachedMessageIds.shift();
    if (oldest) messageDataById.delete(oldest);
  }
}

function findYouTubeMessageById(messageId: string): HTMLElement | null {
  for (const message of document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)) {
    if (getMessageStableId(message) === messageId) return message;
  }
  return null;
}

function requestYouTubeMessageDataScan(): void {
  window.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT));
}
