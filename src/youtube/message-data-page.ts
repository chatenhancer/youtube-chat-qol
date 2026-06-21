/**
 * Page-world YouTube message data adapter.
 *
 * This runs in the page's MAIN world so it can read YouTube's renderer-owned
 * `data` property for message elements requested by the isolated extension
 * world. It emits only a small sanitized allowlist back.
 */
import {
  YOUTUBE_MESSAGE_DATA_EVENT,
  YOUTUBE_MESSAGE_DATA_REQUEST_EVENT,
  type YouTubeMessageData
} from './message-data-events';
import { CHAT_MESSAGE_SELECTOR } from './selectors';

type DataRecord = Record<string, unknown>;
type MessageRenderer = HTMLElement & { data?: unknown };

const MAX_DATA_RETRIES = 10;
const RETRY_MS = 50;
const SENT_CACHE_LIMIT = 800;

const retryCounts = new WeakMap<Element, number>();
const retryTimers = new WeakMap<Element, number>();
const sentPayloads = new Map<string, string>();
const sentMessageIds: string[] = [];

startYouTubeMessageDataAdapter();

function startYouTubeMessageDataAdapter(): void {
  document.addEventListener(YOUTUBE_MESSAGE_DATA_REQUEST_EVENT, handleYouTubeMessageDataRequest);
}

function handleYouTubeMessageDataRequest(event: Event): void {
  const message = getRequestedYouTubeMessage(event.target);
  if (!message) return;
  processYouTubeMessageData(message, { force: false, retry: true });
}

function getRequestedYouTubeMessage(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.matches(CHAT_MESSAGE_SELECTOR) && target instanceof HTMLElement) return target;
  return target.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR);
}

function processYouTubeMessageData(
  message: HTMLElement,
  options: { force: boolean; retry: boolean }
): void {
  if (emitYouTubeMessageData(message, options.force)) return;
  if (options.retry) scheduleYouTubeMessageDataRetry(message, options.force);
}

function scheduleYouTubeMessageDataRetry(message: HTMLElement, force: boolean): void {
  const count = retryCounts.get(message) || 0;
  if (count >= MAX_DATA_RETRIES || retryTimers.has(message)) return;

  retryCounts.set(message, count + 1);
  const timer = window.setTimeout(() => {
    retryTimers.delete(message);
    if (!message.isConnected) return;
    processYouTubeMessageData(message, { force, retry: true });
  }, count === 0 ? 0 : RETRY_MS);
  retryTimers.set(message, timer);
}

function emitYouTubeMessageData(message: HTMLElement, force: boolean): boolean {
  const payload = getYouTubeMessageDataPayload(message);
  if (!payload) return false;

  const serialized = JSON.stringify(payload);
  if (!force && sentPayloads.get(payload.messageId) === serialized) return true;
  rememberSentPayload(payload.messageId, serialized);
  window.dispatchEvent(new CustomEvent(YOUTUBE_MESSAGE_DATA_EVENT, {
    detail: serialized
  }));
  return true;
}

function rememberSentPayload(messageId: string, serialized: string): void {
  if (!sentPayloads.has(messageId)) sentMessageIds.push(messageId);
  sentPayloads.set(messageId, serialized);
  while (sentMessageIds.length > SENT_CACHE_LIMIT) {
    const oldest = sentMessageIds.shift();
    if (oldest) sentPayloads.delete(oldest);
  }
}

function getYouTubeMessageDataPayload(message: HTMLElement): YouTubeMessageData | null {
  const messageId = getMessageId(message);
  if (!messageId) return null;

  const rendererData = (message as MessageRenderer).data;
  if (!rendererData || typeof rendererData !== 'object' || Array.isArray(rendererData)) return null;
  const data = rendererData as DataRecord;

  const payload: YouTubeMessageData = { messageId };
  const timestampUsec = getTextValue(data.timestampUsec);
  const authorExternalChannelId = getTextValue(data.authorExternalChannelId);
  const authorName = getFormattedText(data.authorName);
  const authorPhotoUrl = getThumbnailUrl(data.authorPhoto);

  if (timestampUsec) payload.timestampUsec = timestampUsec;
  if (authorExternalChannelId) payload.authorExternalChannelId = authorExternalChannelId;
  if (authorName) payload.authorName = authorName;
  if (authorPhotoUrl) payload.authorPhotoUrl = authorPhotoUrl;

  return Object.keys(payload).length > 1 ? payload : null;
}

function getMessageId(message: HTMLElement): string {
  return cleanText(message.getAttribute('data-message-id') || message.id || '');
}

function getTextValue(value: unknown): string {
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value));
  if (typeof value === 'bigint') return value.toString();
  return '';
}

function getFormattedText(value: unknown): string {
  if (typeof value === 'string') return cleanText(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as DataRecord;
  const simpleText = getTextValue(record.simpleText);
  if (simpleText) return simpleText;
  if (!Array.isArray(record.runs)) return '';
  return cleanText(record.runs
    .map((run) => run && typeof run === 'object' && !Array.isArray(run)
      ? getTextValue((run as DataRecord).text)
      : '')
    .join(''));
}

function getThumbnailUrl(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const thumbnails = (value as DataRecord).thumbnails;
  if (!Array.isArray(thumbnails)) return '';
  for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
    const thumbnail = thumbnails[index];
    if (!thumbnail || typeof thumbnail !== 'object' || Array.isArray(thumbnail)) continue;
    const url = getTextValue((thumbnail as DataRecord).url);
    if (url) return url;
  }
  return '';
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}
