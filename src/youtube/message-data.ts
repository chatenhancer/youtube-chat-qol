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

const DATA_CACHE_LIMIT = 800;

interface PendingMessageDataRequest {
  promise: Promise<YouTubeMessageData | null>;
  resolve: (data: YouTubeMessageData | null) => void;
}

const messageDataById = new Map<string, YouTubeMessageData>();
const cachedMessageIds: string[] = [];
const pendingMessageDataById = new Map<string, PendingMessageDataRequest>();
let started = false;

export type { YouTubeMessageData };

export function getYouTubeMessageData(message: HTMLElement): YouTubeMessageData | null {
  const messageId = getMessageStableId(message);
  return messageId ? messageDataById.get(messageId) || null : null;
}

export function requestYouTubeMessageData(message: HTMLElement): Promise<YouTubeMessageData | null> {
  ensureYouTubeMessageDataStarted();
  const messageId = getMessageStableId(message);
  const cachedData = messageId ? messageDataById.get(messageId) : null;
  if (cachedData) return Promise.resolve(cachedData);

  if (!messageId) {
    dispatchYouTubeMessageDataRequest(message);
    return Promise.resolve(null);
  }

  const existingRequest = pendingMessageDataById.get(messageId);
  if (existingRequest) return existingRequest.promise;

  const request = createPendingMessageDataRequest(messageId);
  dispatchYouTubeMessageDataRequest(message);
  return request.promise;
}

function ensureYouTubeMessageDataStarted(): void {
  if (started) return;

  started = true;
  window.addEventListener(YOUTUBE_MESSAGE_DATA_EVENT, handleYouTubeMessageDataEvent);
}

function handleYouTubeMessageDataEvent(event: Event): void {
  if (!(event instanceof CustomEvent)) return;
  const data = parseYouTubeMessageData(event.detail);
  if (!data) return;

  const message = getYouTubeMessageFromDataEvent(event, data.messageId);
  if (!message) return;
  rememberYouTubeMessageData(data);
  resolvePendingMessageDataRequest(data);
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

function getYouTubeMessageFromDataEvent(event: Event, messageId: string): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  const message = target.matches(CHAT_MESSAGE_SELECTOR) && target instanceof HTMLElement
    ? target
    : target.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
  if (!message || getMessageStableId(message) !== messageId) return null;
  return message;
}

function dispatchYouTubeMessageDataRequest(message: HTMLElement): void {
  message.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, {
    bubbles: true,
    composed: true
  }));
}

function createPendingMessageDataRequest(messageId: string): PendingMessageDataRequest {
  let resolveRequest: (data: YouTubeMessageData | null) => void = () => undefined;
  const promise = new Promise<YouTubeMessageData | null>((resolve) => {
    resolveRequest = resolve;
  });
  const request: PendingMessageDataRequest = {
    promise,
    resolve: resolveRequest
  };
  pendingMessageDataById.set(messageId, request);
  return request;
}

function resolvePendingMessageDataRequest(data: YouTubeMessageData): void {
  const request = pendingMessageDataById.get(data.messageId);
  if (!request) return;
  pendingMessageDataById.delete(data.messageId);
  request.resolve(data);
}
