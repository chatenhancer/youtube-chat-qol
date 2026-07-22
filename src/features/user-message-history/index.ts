/**
 * In-memory recent user message history.
 *
 * Stores bounded message history for the current chat page. Nothing is
 * persisted to extension storage; recent-message consumers choose their own
 * smaller display limits while Focus can use the complete retained history.
 */
import { cleanText, normalizeComparableText } from '../../shared/text';
import { getMessageStableId } from '../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import { requestRenderedYouTubeChatFeedRecord } from '../../youtube/chat-feed/records';
import { registerFeature } from '../../content/dispatcher';
import {
  onMessageTranslationCleared,
  onMessageTranslationRendered,
  onMessageTranslationsCleared,
  type MessageTranslationRenderedEvent
} from '../translation/events';
import { cloneProtectedTokens } from '../translation/protected-placeholders';
import {
  startUserMessageFeed,
  type UserMessageFeedRecord,
  type UserMessageFeedUpdate
} from './feed';
import {
  getAuthorKey,
  getIdentityFromUserKey,
  getNormalizedHandle,
  getUserKeyFromIdentity
} from './identity';
import type {
  MessageRecord,
  RecentUserMatch,
  UserIdentity
} from './types';
export type {
  MessageRecord,
  MessageTranslationRecord,
  RecentUserMatch,
  UserIdentity
} from './types';
export { getUserKeyFromIdentity } from './identity';

const RECENT_MESSAGE_LIMIT = 12;
const RECENT_USER_LIMIT = 160;
const MAX_HISTORY_RECORDS = RECENT_MESSAGE_LIMIT * RECENT_USER_LIMIT;

interface ElementRecord {
  key: string;
  id: number;
}

interface FeedMessageLocation {
  key: string;
  record: MessageRecord;
}

type UserMessageListener = (key: string) => void;

const recordsByUser = new Map<string, MessageRecord[]>();
const feedMessagesById = new Map<string, FeedMessageLocation>();
let recordsByElement = new WeakMap<HTMLElement, ElementRecord>();
const userMessageListeners = new Set<UserMessageListener>();
const pendingUserMessageNotificationKeys = new Set<string>();
let nextRecordId = 1;
let userMessageNotificationBatchDepth = 0;
let storedRecordCount = 0;
let unsubscribeChatFeed: (() => void) | null = null;
let translationListenerCleanups: Array<() => void> = [];
let pendingTranslationEvents = new WeakMap<HTMLElement, MessageTranslationRenderedEvent>();

registerFeature({
  page: {
    init: initUserMessageHistory,
    cleanup: cleanupUserMessageHistory
  },
  message: recordUserMessage
});

function initUserMessageHistory(): void {
  if (!translationListenerCleanups.length) {
    translationListenerCleanups = [
      onMessageTranslationRendered(recordUserMessageTranslation),
      onMessageTranslationCleared(({ message }) => clearUserMessageTranslation(message)),
      onMessageTranslationsCleared(clearUserMessageTranslations)
    ];
  }
  startUserMessageHistoryFeed();
}

export function recordUserMessage(message: HTMLElement): void {
  bindFeedMessageElement(message);
}

function startUserMessageHistoryFeed(): void {
  if (unsubscribeChatFeed) return;
  unsubscribeChatFeed = startUserMessageFeed(applyUserMessageFeedUpdates);
}

function applyUserMessageFeedUpdates(updates: readonly UserMessageFeedUpdate[]): void {
  runUserMessageNotificationBatch(() => {
    updates.forEach((update) => {
      if (update.type === 'reset') {
        clearUserMessageHistory();
      } else if (update.type === 'remove') {
        removeFeedMessage(update.messageId);
      } else if (update.type === 'remove-author') {
        removeFeedMessagesByAuthor(update.channelId);
      } else {
        upsertFeedMessage(update.record);
      }
    });
  });
}

function stopUserMessageHistoryFeed(): void {
  unsubscribeChatFeed?.();
  unsubscribeChatFeed = null;
}

function cleanupUserMessageHistory(): void {
  stopUserMessageHistoryFeed();
  translationListenerCleanups.forEach((cleanup) => cleanup());
  translationListenerCleanups = [];
  clearUserMessageHistory();
}

function upsertFeedMessage(source: UserMessageFeedRecord): void {
  const key = getUserKeyFromIdentity(source);
  if (!key) return;

  const existingLocation = feedMessagesById.get(source.messageId);
  const existingRecord = existingLocation?.record;

  if (existingLocation && existingRecord && existingLocation.key !== key) {
    removeRecord(existingLocation.key, existingRecord.id);
  }

  const record: MessageRecord = existingRecord || {
    id: nextRecordId++,
    ...source
  };
  Object.assign(record, source, {
    avatarSrc: source.avatarSrc || record.avatarSrc
  });

  if (!existingLocation || existingLocation.key !== key) {
    setUserRecords(key, [...(recordsByUser.get(key) || []), record]);
  } else {
    setUserRecords(key, recordsByUser.get(key) || []);
  }
  if (!recordsByUser.get(key)?.includes(record)) return;
  feedMessagesById.set(source.messageId, { key, record });

  notifyPrunedUserMessageKeys(pruneOldMessages(), key);
  notifyUserMessageListeners(key);
}

function removeFeedMessagesByAuthor(channelId: string): void {
  [...feedMessagesById.entries()].forEach(([messageId, location]) => {
    if (location.record.channelId === channelId) removeFeedMessage(messageId);
  });
}

function bindFeedMessageElement(message: HTMLElement): void {
  const messageId = cleanText(getMessageStableId(message));
  if (!messageId) return;

  const location = feedMessagesById.get(messageId);
  if (location) {
    bindKnownFeedMessageElement(message, location);
    return;
  }

  void requestRenderedYouTubeChatFeedRecord(message).then((record) => {
    if (!record || record.id !== messageId) return;
    if (!message.isConnected || cleanText(getMessageStableId(message)) !== messageId) return;

    const pendingLocation = feedMessagesById.get(messageId);
    if (pendingLocation) bindKnownFeedMessageElement(message, pendingLocation);
  });
}

function bindKnownFeedMessageElement(
  message: HTMLElement,
  location: FeedMessageLocation
): void {
  const { key, record } = location;
  const previousRecord = recordsByElement.get(message);
  if (previousRecord?.id === record.id && record.messageRef?.deref() === message) {
    return;
  }
  if (previousRecord && previousRecord.id !== record.id) {
    detachRecycledFeedMessageElement(message, previousRecord);
  }

  record.messageRef = new WeakRef(message);
  recordsByElement.set(message, {
    key,
    id: record.id
  });
  notifyUserMessageListeners(key);
}

function detachRecycledFeedMessageElement(
  message: HTMLElement,
  elementRecord: ElementRecord
): void {
  const previous = recordsByUser.get(elementRecord.key)
    ?.find((record) => record.id === elementRecord.id);
  if (previous?.messageRef?.deref() === message) delete previous.messageRef;
}

function removeFeedMessage(messageId: string): void {
  const location = feedMessagesById.get(messageId);
  if (!location) return;
  feedMessagesById.delete(messageId);
  removeRecord(location.key, location.record.id);
  notifyUserMessageListeners(location.key);
}

export function recordVisibleUserMessages(): void {
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach(recordUserMessage);
}

export function getRecentMessagesForKey(key: string, limit = RECENT_MESSAGE_LIMIT): MessageRecord[] {
  return sortRecentRecords(recordsByUser.get(key) || []).slice(-limit);
}

export function getUserMessageHistorySnapshot(): MessageRecord[] {
  const seenRecords = new Set<MessageRecord>();
  const records: MessageRecord[] = [];
  recordsByUser.forEach((userRecords) => {
    userRecords.forEach((record) => {
      if (seenRecords.has(record)) return;
      seenRecords.add(record);
      records.push(record);
    });
  });
  return sortRecentRecords(records);
}

export function getRecentMessagesForIdentity(identity: UserIdentity, limit = RECENT_MESSAGE_LIMIT): MessageRecord[] {
  return getUserMessagesForIdentity(identity).slice(-limit);
}

export function getUserMessagesForIdentity(identity: UserIdentity): MessageRecord[] {
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

  return sortRecentRecords(records.values());
}

export function getLatestMessageForIdentity(identity: UserIdentity): MessageRecord | null {
  return getRecentMessagesForIdentity(identity, 1)[0] || null;
}

export function findRecentUsersByHandle(query: string): RecentUserMatch[] {
  const normalizedQuery = getNormalizedHandle(query);
  if (!normalizedQuery) return [];

  const users = collectRecentUsers();
  const exactMatches = users.filter((user) => getNormalizedHandle(user.authorName) === normalizedQuery);
  if (exactMatches.length) return exactMatches;

  return users.filter((user) => getNormalizedHandle(user.authorName).startsWith(normalizedQuery));
}

export function getAvatarSrcForIdentity(identity: UserIdentity): string {
  const records = getRecentMessagesForIdentity(identity, RECENT_MESSAGE_LIMIT);
  return [...records].reverse().find((record) => record.avatarSrc)?.avatarSrc || '';
}

export function getLiveMessageForRecord(record: MessageRecord): HTMLElement | null {
  const message = record.messageRef?.deref() || null;
  return message?.isConnected ? message : null;
}

function recordUserMessageTranslation(event: MessageTranslationRenderedEvent): void {
  const { message } = event;
  const record = getRecordForMessage(message);
  if (record) {
    pendingTranslationEvents.delete(message);
    applyUserMessageTranslation(message, record, event);
    return;
  }

  const messageId = cleanText(getMessageStableId(message));
  if (!messageId) return;
  pendingTranslationEvents.set(message, event);
  void requestRenderedYouTubeChatFeedRecord(message).then((feedRecord) => {
    if (pendingTranslationEvents.get(message) !== event) return;
    pendingTranslationEvents.delete(message);
    if (!feedRecord) return;

    const pendingRecord = getRecordForMessage(message);
    if (pendingRecord) applyUserMessageTranslation(message, pendingRecord, event);
  });
}

function applyUserMessageTranslation(
  message: HTMLElement,
  record: MessageRecord,
  { result, originalText, protectedTokens, sourceText }: MessageTranslationRenderedEvent
): void {

  record.translation = {
    result,
    originalText,
    sourceText,
    protectedTokens: cloneProtectedTokens(protectedTokens)
  };

  const elementRecord = recordsByElement.get(message);
  if (elementRecord) notifyUserMessageListeners(elementRecord.key);
}

function clearUserMessageTranslation(message: HTMLElement): void {
  pendingTranslationEvents.delete(message);
  const record = getRecordForMessage(message);
  if (!record?.translation) return;

  delete record.translation;
  const elementRecord = recordsByElement.get(message);
  if (elementRecord) notifyUserMessageListeners(elementRecord.key);
}

function clearUserMessageTranslations(): void {
  pendingTranslationEvents = new WeakMap();
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

function pruneOldMessages(): Set<string> {
  const changedKeys = new Set<string>();
  while (storedRecordCount > MAX_HISTORY_RECORDS) {
    let oldestKey = '';
    let oldestRecord: MessageRecord | null = null;
    for (const [key, records] of recordsByUser) {
      const candidate = records[0];
      if (
        candidate &&
        (!oldestRecord ||
          candidate.timestamp < oldestRecord.timestamp ||
          (candidate.timestamp === oldestRecord.timestamp && candidate.id < oldestRecord.id))
      ) {
        oldestKey = key;
        oldestRecord = candidate;
      }
    }
    if (!oldestKey || !oldestRecord) break;
    removeRecord(oldestKey, oldestRecord.id);
    changedKeys.add(oldestKey);
  }
  return changedKeys;
}

function notifyPrunedUserMessageKeys(changedKeys: Set<string>, currentKey: string): void {
  changedKeys.forEach((key) => {
    if (key !== currentKey) notifyUserMessageListeners(key);
  });
}

function notifyUserMessageListeners(key: string): void {
  if (userMessageNotificationBatchDepth > 0) {
    pendingUserMessageNotificationKeys.add(key);
    return;
  }
  notifyUserMessageListenersNow(key);
}

function notifyUserMessageListenersNow(key: string): void {
  userMessageListeners.forEach((listener) => {
    listener(key);
  });
}

function runUserMessageNotificationBatch(callback: () => void): void {
  userMessageNotificationBatchDepth += 1;
  try {
    callback();
  } finally {
    userMessageNotificationBatchDepth -= 1;
    if (userMessageNotificationBatchDepth === 0) {
      const changedKeys = [...pendingUserMessageNotificationKeys];
      pendingUserMessageNotificationKeys.clear();
      changedKeys.forEach(notifyUserMessageListenersNow);
    }
  }
}

function setUserRecords(key: string, records: MessageRecord[]): void {
  const previousRecords = recordsByUser.get(key) || [];
  const nextRecords = sortRecentRecords(records);
  const retainedRecords = new Set(nextRecords);
  [...previousRecords, ...records].forEach((record) => {
    if (!retainedRecords.has(record)) unindexFeedMessageRecord(record);
  });
  storedRecordCount += nextRecords.length - previousRecords.length;
  if (!nextRecords.length) {
    recordsByUser.delete(key);
    return;
  }

  recordsByUser.set(key, nextRecords);
}

function unindexFeedMessageRecord(record: MessageRecord): void {
  const messageId = cleanText(record.messageId);
  if (!messageId) return;
  const location = feedMessagesById.get(messageId);
  if (location?.record === record) feedMessagesById.delete(messageId);
}

function sortRecentRecords(records: MessageRecord[]): MessageRecord[] {
  return [...records].sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
}

function collectRecentUsers(): RecentUserMatch[] {
  const users = new Map<string, RecentUserMatch>();

  recordsByUser.forEach((records, key) => {
    const sortedRecords = sortRecentRecords(records);
    const latestMessage = sortedRecords[sortedRecords.length - 1];
    if (!latestMessage) return;

    const identity = getIdentityFromUserKey(key, latestMessage.authorName);
    const userKey = getUserKeyFromIdentity(identity);
    if (!userKey || users.has(userKey)) return;

    users.set(userKey, {
      authorName: latestMessage.authorName,
      avatarSrc: latestMessage.avatarSrc,
      identity,
      latestMessage
    });
  });

  const seenHandles = new Set<string>();
  return Array.from(users.values())
    .sort((a, b) => b.latestMessage.timestamp - a.latestMessage.timestamp)
    .slice(0, RECENT_USER_LIMIT)
    .filter((user) => {
      const handle = getNormalizedHandle(user.authorName);
      if (!handle) return true;
      if (seenHandles.has(handle)) return false;
      seenHandles.add(handle);
      return true;
    });
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

function clearUserMessageHistory(): void {
  const changedKeys = [...recordsByUser.keys()];
  recordsByUser.clear();
  storedRecordCount = 0;
  feedMessagesById.clear();
  recordsByElement = new WeakMap();
  pendingTranslationEvents = new WeakMap();
  nextRecordId = 1;
  changedKeys.forEach(notifyUserMessageListeners);
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
