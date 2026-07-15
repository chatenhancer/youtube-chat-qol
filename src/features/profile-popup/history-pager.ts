/**
 * Keeps profile message rendering bounded while exposing the full retained
 * current-page history in both directions.
 */
import type { MessageRecord } from '../user-message-history';

export const PROFILE_MESSAGE_PAGE_SIZE = 12;

export interface ProfileMessagePager {
  getOriginRecordId(): number | null;
  getVisibleMessages(): readonly MessageRecord[];
  hasEarlier(): boolean;
  hasLater(): boolean;
  loadEarlier(): boolean;
  loadLater(): boolean;
  updateMessages(messages: readonly MessageRecord[], options?: { followLatest?: boolean }): void;
}

export function createProfileMessagePager(
  originMessageId = '',
  pageSize = PROFILE_MESSAGE_PAGE_SIZE
): ProfileMessagePager {
  const normalizedOriginMessageId = originMessageId.trim();
  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  let messages: readonly MessageRecord[] = [];
  let startIndex = 0;
  let endIndex = 0;
  let initialized = false;
  let originRecordId: number | null = null;

  function updateMessages(
    nextMessages: readonly MessageRecord[],
    { followLatest = false }: { followLatest?: boolean } = {}
  ): void {
    const previousStartId = messages[startIndex]?.id;
    const previousEndId = messages[endIndex - 1]?.id;
    const previousCount = Math.max(1, endIndex - startIndex);
    messages = nextMessages;

    if (!messages.length) {
      startIndex = 0;
      endIndex = 0;
      initialized = false;
      originRecordId = null;
      return;
    }

    const unresolvedOriginIndex = originRecordId === null && normalizedOriginMessageId
      ? findOriginIndex(messages, normalizedOriginMessageId)
      : -1;
    if (!initialized || unresolvedOriginIndex >= 0) {
      initializeRange(unresolvedOriginIndex);
      return;
    }

    if (followLatest) {
      endIndex = messages.length;
      startIndex = Math.max(0, endIndex - Math.min(previousCount, messages.length));
      return;
    }

    const nextStartIndex = findRecordIndex(messages, previousStartId);
    const nextEndIndex = findRecordIndex(messages, previousEndId);
    if (nextStartIndex >= 0 && nextEndIndex >= nextStartIndex) {
      setPreservedRange(nextStartIndex, nextEndIndex + 1, previousCount);
      return;
    }
    if (nextStartIndex >= 0) {
      setPreservedRange(
        nextStartIndex,
        Math.min(messages.length, nextStartIndex + previousCount),
        previousCount
      );
      return;
    }
    if (nextEndIndex >= 0) {
      setPreservedRange(
        Math.max(0, nextEndIndex - previousCount + 1),
        nextEndIndex + 1,
        previousCount
      );
      return;
    }

    initializeRange(findOriginIndex(messages, normalizedOriginMessageId));
  }

  function initializeRange(originIndex: number): void {
    initialized = true;
    if (originIndex >= 0) {
      originRecordId = messages[originIndex]?.id ?? null;
      startIndex = originIndex - Math.floor(normalizedPageSize / 2);
      startIndex = Math.max(0, Math.min(startIndex, messages.length - normalizedPageSize));
      endIndex = Math.min(messages.length, startIndex + normalizedPageSize);
      return;
    }

    originRecordId = null;
    endIndex = messages.length;
    startIndex = Math.max(0, endIndex - normalizedPageSize);
  }

  function setPreservedRange(start: number, end: number, requestedCount: number): void {
    startIndex = start;
    endIndex = end;
    let missingCount = Math.min(requestedCount, messages.length) - (endIndex - startIndex);
    if (missingCount <= 0) return;

    const earlierCount = Math.min(startIndex, missingCount);
    startIndex -= earlierCount;
    missingCount -= earlierCount;
    endIndex = Math.min(messages.length, endIndex + missingCount);
  }

  function loadEarlier(): boolean {
    if (startIndex <= 0) return false;
    startIndex = Math.max(0, startIndex - normalizedPageSize);
    return true;
  }

  function loadLater(): boolean {
    if (endIndex >= messages.length) return false;
    endIndex = Math.min(messages.length, endIndex + normalizedPageSize);
    return true;
  }

  return {
    getOriginRecordId: () => originRecordId,
    getVisibleMessages: () => messages.slice(startIndex, endIndex),
    hasEarlier: () => startIndex > 0,
    hasLater: () => endIndex < messages.length,
    loadEarlier,
    loadLater,
    updateMessages
  };
}

function findOriginIndex(messages: readonly MessageRecord[], messageId: string): number {
  if (!messageId) return -1;
  return messages.findIndex((message) => message.messageId === messageId);
}

function findRecordIndex(
  messages: readonly MessageRecord[],
  recordId: number | undefined
): number {
  if (recordId === undefined) return -1;
  return messages.findIndex((message) => message.id === recordId);
}
