/**
 * In-memory recent user message history.
 *
 * Stores a small rolling list of recent messages per author for the current
 * chat page. Nothing is persisted to extension storage; this only powers the
 * avatar profile card while the livestream page is open.
 */
import { normalizeComparableText } from '../shared/text';
import {
  getAuthorName,
  getMessageContentNodes,
  getMessageText,
  getMessageTimestampText,
  getRendererData
} from '../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../youtube/selectors';
import type { EmojiToken } from './translation/emojiPlaceholders';
import type { TranslationResult } from './translation/render';

const MAX_USERS = 160;
const MAX_MESSAGES_PER_USER = 12;

export interface MessageRecord {
  id: number;
  authorName: string;
  contentNodes: Node[];
  text: string;
  timestamp: number;
  timestampText: string;
  translation?: MessageTranslationRecord;
}

export interface MessageTranslationRecord {
  result: TranslationResult;
  sourceText: string;
  originalText: string;
  emojiTokens: EmojiToken[];
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
    contentNodes: getMessageContentNodes(message),
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
  notifyUserMessageListeners(key);
}

export function recordVisibleUserMessages(): void {
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach(recordUserMessage);
}

export function getRecentMessagesForKey(key: string, limit = 5): MessageRecord[] {
  return (recordsByUser.get(key) || []).slice(-limit);
}

export function getRecentMessagesForIdentity(identity: UserIdentity, limit = 5): MessageRecord[] {
  const key = getUserKeyFromIdentity(identity);
  const directRecords = key ? getRecentMessagesForKey(key, limit) : [];
  if (directRecords.length || !identity.authorName) return directRecords;

  const normalizedAuthorName = normalizeComparableText(identity.authorName);
  if (!normalizedAuthorName) return [];

  return Array.from(recordsByUser.values())
    .flat()
    .filter((record) => normalizeComparableText(record.authorName) === normalizedAuthorName)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit);
}

export function recordUserMessageTranslation(
  message: HTMLElement,
  result: TranslationResult,
  originalText: string,
  emojiTokens: EmojiToken[],
  sourceText: string
): void {
  const record = getRecordForMessage(message);
  if (!record) return;

  record.translation = {
    result,
    originalText,
    sourceText,
    emojiTokens: cloneEmojiTokens(emojiTokens)
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

function notifyUserMessageListeners(key: string): void {
  userMessageListeners.forEach((listener) => {
    listener(key);
  });
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

function cloneEmojiTokens(emojiTokens: EmojiToken[]): EmojiToken[] {
  return emojiTokens.map((token) => ({
    placeholder: token.placeholder,
    fallbackText: token.fallbackText,
    node: token.node ? token.node.cloneNode(true) : null
  }));
}
