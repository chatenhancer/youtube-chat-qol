/**
 * In-memory recent user message history.
 *
 * Stores a small rolling list of recent messages per author for the current
 * chat page. Nothing is persisted to extension storage; this only powers the
 * avatar profile card while the livestream page is open.
 */
import { cleanText, normalizeComparableText } from '../shared/text';
import {
  getAuthorName,
  getMessageContentSourceNodes,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText,
  getRendererData
} from '../youtube/messages';
import { serializeRichMessageNodes, type RichTextSegment } from '../youtube/richText';
import { CHAT_MESSAGE_SELECTOR } from '../youtube/selectors';
import type { ProtectedToken } from './translation/protectedPlaceholders';
import type { TranslationResult } from './translation/render';

const MAX_USERS = 160;
const MAX_MESSAGES_PER_USER = 12;
const CHAT_TIMESTAMP_FUTURE_TOLERANCE_MS = 10 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface MessageRecord {
  id: number;
  authorName: string;
  contentParts: RichTextSegment[];
  messageId?: string;
  messageRef?: WeakRef<HTMLElement>;
  text: string;
  timestamp: number;
  timestampText: string;
  translation?: MessageTranslationRecord;
}

export interface MessageTranslationRecord {
  result: TranslationResult;
  sourceText: string;
  originalText: string;
  protectedTokens: ProtectedToken[];
}

export interface UserIdentity {
  authorName?: string;
  channelId?: string;
}

interface ElementRecord {
  key: string;
  id: number;
  signature: string;
}

type UserMessageListener = (key: string) => void;

const recordsByUser = new Map<string, MessageRecord[]>();
const latestByUser = new Map<string, number>();
const recordsByElement = new WeakMap<HTMLElement, ElementRecord>();
const userMessageListeners = new Set<UserMessageListener>();
let nextRecordId = 1;

export function recordUserMessage(message: HTMLElement): void {
  const key = getUserKey(message);
  if (!key) return;

  const authorName = getAuthorName(message);
  const text = getMessageText(message);
  if (!authorName || !text) return;

  const messageId = getMessageStableId(message);
  const signature = `${messageId || 'message-content'}\n${authorName}\n${text}`;
  const previousRecord = recordsByElement.get(message);
  if (previousRecord?.signature === signature) return;

  const existingRecord = messageId ? findRecordByMessageId(key, messageId) : null;
  if (previousRecord && previousRecord.id !== existingRecord?.id) {
    removeRecord(previousRecord.key, previousRecord.id);
  }

  if (existingRecord) {
    const timestampText = getMessageTimestampText(message, existingRecord.timestamp);
    existingRecord.authorName = authorName;
    existingRecord.contentParts = serializeRichMessageNodes(getMessageContentSourceNodes(message));
    existingRecord.messageId = messageId;
    existingRecord.messageRef = new WeakRef(message);
    existingRecord.text = text;
    existingRecord.timestamp = getMessageHistoryTimestamp(timestampText, existingRecord.timestamp);
    existingRecord.timestampText = timestampText;
    recordsByElement.set(message, {
      key,
      id: existingRecord.id,
      signature
    });
    setUserRecords(key, recordsByUser.get(key) || []);
    notifyUserMessageListeners(key);
    return;
  }

  const recordedAt = Date.now();
  const timestampText = getMessageTimestampText(message, recordedAt);
  const timestamp = getMessageHistoryTimestamp(timestampText, recordedAt);
  const record: MessageRecord = {
    id: previousRecord?.id || nextRecordId++,
    authorName,
    contentParts: serializeRichMessageNodes(getMessageContentSourceNodes(message)),
    messageId,
    messageRef: new WeakRef(message),
    text,
    timestamp,
    timestampText
  };

  const records = recordsByUser.get(key) || [];
  records.push(record);
  setUserRecords(key, records);
  recordsByElement.set(message, {
    key,
    id: record.id,
    signature
  });

  pruneOldUsers();
  notifyUserMessageListeners(key);
}

export function recordVisibleUserMessages(): void {
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach(recordUserMessage);
}

export function getRecentMessagesForKey(key: string, limit = MAX_MESSAGES_PER_USER): MessageRecord[] {
  return sortRecentRecords(recordsByUser.get(key) || []).slice(-limit);
}

export function getRecentMessagesForIdentity(identity: UserIdentity, limit = MAX_MESSAGES_PER_USER): MessageRecord[] {
  const key = getUserKeyFromIdentity(identity);
  const records = createUniqueRecordCollector();
  if (key) records.add(recordsByUser.get(key) || []);

  const normalizedAuthorName = normalizeComparableText(identity.authorName || '');
  if (normalizedAuthorName) {
    records.add(
      Array.from(recordsByUser.values())
        .flat()
        .filter((record) => normalizeComparableText(record.authorName) === normalizedAuthorName)
    );
  }

  return sortRecentRecords(records.values())
    .slice(-limit);
}

export function getLiveMessageForRecord(record: MessageRecord): HTMLElement | null {
  const message = record.messageRef?.deref() || null;
  return message?.isConnected ? message : null;
}

export function recordUserMessageTranslation(
  message: HTMLElement,
  result: TranslationResult,
  originalText: string,
  protectedTokens: ProtectedToken[],
  sourceText: string
): void {
  const record = getRecordForMessage(message);
  if (!record) return;

  record.translation = {
    result,
    originalText,
    sourceText,
    protectedTokens: cloneProtectedTokens(protectedTokens)
  };

  const elementRecord = recordsByElement.get(message);
  if (elementRecord) notifyUserMessageListeners(elementRecord.key);
}

export function clearUserMessageTranslation(message: HTMLElement): void {
  const record = getRecordForMessage(message);
  if (!record?.translation) return;

  delete record.translation;
  const elementRecord = recordsByElement.get(message);
  if (elementRecord) notifyUserMessageListeners(elementRecord.key);
}

export function clearUserMessageTranslations(): void {
  const changedKeys: string[] = [];
  recordsByUser.forEach((records, key) => {
    let changed = false;
    records.forEach((record) => {
      if (!record.translation) return;
      delete record.translation;
      changed = true;
    });
    if (changed) changedKeys.push(key);
  });

  changedKeys.forEach(notifyUserMessageListeners);
}

export function getUserKey(message: HTMLElement): string {
  const data = getRendererData(message);
  return getUserKeyFromIdentity({
    channelId: data?.authorExternalChannelId || data?.authorChannelId,
    authorName: getAuthorName(message)
  });
}

export function getUserKeyFromIdentity(identity: UserIdentity): string {
  if (identity.channelId) return `channel:${identity.channelId}`;

  const authorName = normalizeComparableText(identity.authorName || '');
  return authorName ? `author:${authorName}` : '';
}

export function onUserMessagesChanged(listener: UserMessageListener): () => void {
  userMessageListeners.add(listener);
  return () => {
    userMessageListeners.delete(listener);
  };
}

function removeRecord(key: string, id: number): void {
  const records = recordsByUser.get(key);
  if (!records) return;

  const nextRecords = records.filter((record) => record.id !== id);
  setUserRecords(key, nextRecords);
}

function findRecordByMessageId(key: string, messageId: string): MessageRecord | null {
  return recordsByUser.get(key)?.find((record) => record.messageId === messageId) || null;
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

function notifyUserMessageListeners(key: string): void {
  userMessageListeners.forEach((listener) => {
    listener(key);
  });
}

function setUserRecords(key: string, records: MessageRecord[]): void {
  const nextRecords = sortRecentRecords(records).slice(-MAX_MESSAGES_PER_USER);
  if (!nextRecords.length) {
    recordsByUser.delete(key);
    latestByUser.delete(key);
    return;
  }

  recordsByUser.set(key, nextRecords);
  latestByUser.set(key, nextRecords[nextRecords.length - 1].timestamp);
}

function sortRecentRecords(records: MessageRecord[]): MessageRecord[] {
  return [...records].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
}

function createUniqueRecordCollector(): {
  add: (records: MessageRecord[]) => void;
  values: () => MessageRecord[];
} {
  const records: MessageRecord[] = [];
  const seenMessageIds = new Set<string>();
  const seenElements = new WeakSet<HTMLElement>();

  return {
    add(nextRecords) {
      nextRecords.forEach((record) => {
        const messageId = cleanText(record.messageId);
        if (messageId) {
          if (seenMessageIds.has(messageId)) return;
          seenMessageIds.add(messageId);
        }

        const element = record.messageRef?.deref();
        if (element) {
          if (seenElements.has(element)) return;
          seenElements.add(element);
        }

        records.push(record);
      });
    },
    values() {
      return records;
    }
  };
}

function getMessageHistoryTimestamp(timestampText: string, fallbackTimestamp: number): number {
  return parseMessageHistoryTimestamp(timestampText, fallbackTimestamp) ?? fallbackTimestamp;
}

function parseMessageHistoryTimestamp(timestampText: string, referenceTimestamp: number): number | null {
  const normalized = cleanText(timestampText)
    .replace(/\./g, '')
    .toLocaleUpperCase();
  const match = normalized.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;
  const meridiem = match[4];

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || !Number.isFinite(second)) return null;
  if (minute > 59 || second > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (hour === 12) hour = 0;
    if (meridiem === 'PM') hour += 12;
  } else if (hour > 23) {
    return null;
  }

  const date = new Date(referenceTimestamp);
  date.setHours(hour, minute, second, 0);
  let parsedTimestamp = date.getTime();

  if (parsedTimestamp > referenceTimestamp + CHAT_TIMESTAMP_FUTURE_TOLERANCE_MS) {
    parsedTimestamp -= ONE_DAY_MS;
  }

  return parsedTimestamp;
}

function getRecordForMessage(message: HTMLElement): MessageRecord | null {
  let elementRecord = recordsByElement.get(message);
  if (!elementRecord) {
    recordUserMessage(message);
    elementRecord = recordsByElement.get(message);
  }
  if (!elementRecord) return null;

  return recordsByUser.get(elementRecord.key)?.find((record) => record.id === elementRecord.id) || null;
}

function cloneProtectedTokens(protectedTokens: ProtectedToken[]): ProtectedToken[] {
  return protectedTokens.map((token) => ({
    placeholder: token.placeholder,
    fallbackText: token.fallbackText,
    node: token.node ? token.node.cloneNode(true) : null,
    nodes: token.nodes.map((node) => node.cloneNode(true))
  }));
}
