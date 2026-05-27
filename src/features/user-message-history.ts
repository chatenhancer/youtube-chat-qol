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
  getMessageAvatarSrc,
  getMessageStableId,
  getMessageText,
  getMessageTimestampText,
  getRendererData
} from '../youtube/messages';
import { serializeRichMessageNodes, type RichTextSegment } from '../youtube/rich-text';
import { CHAT_MESSAGE_SELECTOR } from '../youtube/selectors';
import { getChatTimestampValue, isLiveChatReplayUrl } from '../youtube/timestamps';
import type { ProtectedToken } from './translation/protected-placeholders';
import type { TranslationResult } from './translation/render';

const MAX_USERS = 160;
const MAX_MESSAGES_PER_USER = 12;

export interface MessageRecord {
  id: number;
  authorName: string;
  avatarSrc?: string;
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

  const avatarSrc = getMessageAvatarSrc(message);
  const messageId = getMessageStableId(message);
  const recordedAt = Date.now();
  const timestampText = getMessageTimestampText(message, recordedAt);
  const timestamp = getMessageHistoryTimestamp(timestampText, recordedAt);
  const signature = `${messageId || 'message-content'}\n${authorName}\n${text}`;
  const previousRecord = recordsByElement.get(message);
  if (previousRecord?.signature === signature) return;

  const existingRecord = messageId
    ? findRecordByMessageId(key, messageId) ||
      findDuplicateRecordAcrossLiveSurfaces(key, message, authorName, text, timestampText) ||
      findDisconnectedRecordByContent(key, authorName, text, timestampText)
    : findDuplicateRecordAcrossLiveSurfaces(key, message, authorName, text, timestampText) ||
      findDisconnectedRecordByContent(key, authorName, text, timestampText);
  if (previousRecord && previousRecord.id !== existingRecord?.id) {
    removeRecord(previousRecord.key, previousRecord.id);
  }

  if (existingRecord) {
    const nextTimestampText = getMessageTimestampText(message, existingRecord.timestamp);
    existingRecord.authorName = authorName;
    existingRecord.avatarSrc = avatarSrc || existingRecord.avatarSrc;
    existingRecord.contentParts = serializeRichMessageNodes(getMessageContentSourceNodes(message));
    existingRecord.messageId = existingRecord.messageId || messageId;
    existingRecord.messageRef = new WeakRef(message);
    existingRecord.text = text;
    existingRecord.timestamp = getMessageHistoryTimestamp(nextTimestampText, existingRecord.timestamp);
    existingRecord.timestampText = nextTimestampText;
    recordsByElement.set(message, {
      key,
      id: existingRecord.id,
      signature
    });
    setUserRecords(key, recordsByUser.get(key) || []);
    notifyUserMessageListeners(key);
    return;
  }

  const record: MessageRecord = {
    id: previousRecord?.id || nextRecordId++,
    authorName,
    avatarSrc: avatarSrc || undefined,
    contentParts: serializeRichMessageNodes(getMessageContentSourceNodes(message)),
    messageId: messageId || undefined,
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
  const authorKey = getAuthorKey(identity.authorName);
  const records = createUniqueRecordCollector();
  if (key) records.add(recordsByUser.get(key) || []);
  if (authorKey && authorKey !== key) {
    records.add(recordsByUser.get(authorKey) || []);
  }
  if (!identity.channelId && authorKey) {
    records.add(getRecordsByAuthorName(identity.authorName));
  }

  return sortRecentRecords(records.values())
    .slice(-limit);
}

export function getAvatarSrcForIdentity(identity: UserIdentity): string {
  const records = getRecentMessagesForIdentity(identity, MAX_MESSAGES_PER_USER);
  return [...records].reverse().find((record) => record.avatarSrc)?.avatarSrc || '';
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
  return getAuthorKey(identity.authorName);
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

function findDuplicateRecordAcrossLiveSurfaces(
  key: string,
  message: HTMLElement,
  authorName: string,
  text: string,
  timestampText: string
): MessageRecord | null {
  const incomingSurface = getLiveChatSurfaceKey(message);
  if (!incomingSurface) return null;

  const authorSignature = normalizeComparableText(authorName);
  const textSignature = normalizeComparableText(text);
  const timestampSignature = normalizeComparableText(timestampText);
  if (!authorSignature || !textSignature || !timestampSignature) return null;

  return recordsByUser.get(key)?.find((record) => {
    const liveMessage = getLiveMessageForRecord(record);
    if (!liveMessage) return false;

    const liveSurface = getLiveChatSurfaceKey(liveMessage);
    return liveSurface &&
      liveSurface !== incomingSurface &&
      normalizeComparableText(record.authorName) === authorSignature &&
      normalizeComparableText(record.text) === textSignature &&
      normalizeComparableText(record.timestampText) === timestampSignature;
  }) || null;
}

function getRecordsByAuthorName(authorName: string | undefined): MessageRecord[] {
  const authorSignature = normalizeComparableText(authorName || '');
  if (!authorSignature) return [];

  const records: MessageRecord[] = [];
  recordsByUser.forEach((userRecords) => {
    userRecords.forEach((record) => {
      if (normalizeComparableText(record.authorName) === authorSignature) {
        records.push(record);
      }
    });
  });
  return records;
}

function findDisconnectedRecordByContent(
  key: string,
  authorName: string,
  text: string,
  timestampText: string
): MessageRecord | null {
  const authorSignature = normalizeComparableText(authorName);
  const textSignature = normalizeComparableText(text);
  const timestampSignature = normalizeComparableText(timestampText);
  if (!authorSignature || !textSignature || !timestampSignature) return null;

  return recordsByUser.get(key)?.find((record) => {
    const liveMessage = getLiveMessageForRecord(record);
    return !liveMessage &&
      normalizeComparableText(record.authorName) === authorSignature &&
      normalizeComparableText(record.text) === textSignature &&
      normalizeComparableText(record.timestampText) === timestampSignature;
  }) || null;
}

function getLiveChatSurfaceKey(message: HTMLElement): string {
  const list = message.closest<HTMLElement>([
    '#items.style-scope.yt-live-chat-item-list-renderer',
    '#items.style-scope.yt-live-chat-item-display-list-renderer'
  ].join(','));
  return list?.className || '';
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

function getAuthorKey(authorName: string | undefined): string {
  const normalizedAuthorName = normalizeComparableText(authorName || '');
  return normalizedAuthorName ? `author:${normalizedAuthorName}` : '';
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
  return getChatTimestampValue(timestampText, fallbackTimestamp, {
    preferElapsed: isLiveChatReplayUrl()
  }) ?? fallbackTimestamp;
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
