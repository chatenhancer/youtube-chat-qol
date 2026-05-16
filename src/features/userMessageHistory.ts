/**
 * In-memory recent user message history.
 *
 * Stores a small rolling list of recent messages per author for the current
 * chat page. Nothing is persisted to extension storage; this only powers the
 * avatar profile card while the livestream page is open.
 */
import { normalizeComparableText } from '../shared/text';
import { getAuthorName, getMessageText, getRendererData } from '../youtube/messages';

const MAX_USERS = 160;
const MAX_MESSAGES_PER_USER = 12;

export interface MessageRecord {
  id: number;
  authorName: string;
  text: string;
  timestamp: number;
  timestampText: string;
}

interface ElementRecord {
  key: string;
  id: number;
  signature: string;
}

const recordsByUser = new Map<string, MessageRecord[]>();
const latestByUser = new Map<string, number>();
const recordsByElement = new WeakMap<HTMLElement, ElementRecord>();
let nextRecordId = 1;

export function recordUserMessage(message: HTMLElement): void {
  const key = getUserKey(message);
  if (!key) return;

  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!authorName || !text) return;

  const signature = `${authorName}\n${text}`;
  const previousRecord = recordsByElement.get(message);
  if (previousRecord?.signature === signature) return;

  if (previousRecord) {
    removeRecord(previousRecord.key, previousRecord.id);
  }

  const timestamp = Date.now();
  const record: MessageRecord = {
    id: previousRecord?.id || nextRecordId++,
    authorName,
    text,
    timestamp,
    timestampText: getMessageTimestampText(message, timestamp)
  };

  const records = recordsByUser.get(key) || [];
  records.push(record);
  recordsByUser.set(key, records.slice(-MAX_MESSAGES_PER_USER));
  latestByUser.set(key, record.timestamp);
  recordsByElement.set(message, {
    key,
    id: record.id,
    signature
  });

  pruneOldUsers();
}

export function getRecentMessagesForUser(message: HTMLElement, limit = 5): MessageRecord[] {
  const key = getUserKey(message);
  if (!key) return [];

  return (recordsByUser.get(key) || []).slice(-limit);
}

export function getUserKey(message: HTMLElement): string {
  const data = getRendererData(message);
  const channelId = data?.authorExternalChannelId || data?.authorChannelId;
  if (channelId) return `channel:${channelId}`;

  const authorName = normalizeComparableText(getAuthorName(message));
  return authorName ? `author:${authorName}` : '';
}

function removeRecord(key: string, id: number): void {
  const records = recordsByUser.get(key);
  if (!records) return;

  const nextRecords = records.filter((record) => record.id !== id);
  if (nextRecords.length) {
    recordsByUser.set(key, nextRecords);
    latestByUser.set(key, nextRecords[nextRecords.length - 1].timestamp);
  } else {
    recordsByUser.delete(key);
    latestByUser.delete(key);
  }
}

function pruneOldUsers(): void {
  if (recordsByUser.size <= MAX_USERS) return;

  const oldestUsers = Array.from(latestByUser.entries())
    .sort((a, b) => a[1] - b[1])
    .slice(0, recordsByUser.size - MAX_USERS);

  oldestUsers.forEach(([key]) => {
    recordsByUser.delete(key);
    latestByUser.delete(key);
  });
}

function getMessageTimestampText(message: HTMLElement, timestamp: number): string {
  const youtubeTimestamp = message.querySelector('#timestamp')?.textContent;
  if (youtubeTimestamp) {
    const cleanTimestamp = youtubeTimestamp.replace(/\s+/g, ' ').trim();
    if (cleanTimestamp) return cleanTimestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(timestamp);
}
