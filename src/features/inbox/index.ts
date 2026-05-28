/**
 * Inbox.
 *
 * Stores chat messages that need the user's attention: direct mentions and
 * locally configured keyword/phrase matches. This file coordinates detection
 * and persistence while the button, card, keyword panel, and mutable state
 * live in focused sibling modules.
 */
import {
  getAuthorName,
  getMessageText
} from '../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import {
  applyChatKeywordHighlights,
  clearChatKeywordHighlights
} from './highlights';
import {
  initMentionDetection,
  isCurrentUserAuthorName,
  processPotentialMentionForConsumer,
  registerMentionProcessor
} from '../mention-detection';
import {
  clearInboxTabAlert,
  initInboxTabAlert,
  isCurrentTabActive,
  showInboxTabAlert
} from '../tab-alert';
import { playAlertSound } from './sound';
import {
  closeInboxCard,
  isInboxCardOpen,
  openInboxCardView,
  refreshOpenInboxCard
} from './card';
import {
  refreshInboxSurfaces,
  scheduleInboxButtonWire as scheduleInboxButtonWireInternal
} from './button';
import { createInboxRecord } from './records';
import { getCurrentInboxSourceUrl } from './source-url';
import {
  addInboxKeywordsToState,
  clearInboxRecords,
  getInboxKeywords,
  getInboxKeywordsSnapshot,
  getKeywordCheckKeyFromValues,
  getLatestInboxRecord,
  getLatestMentionInboxRecord,
  getLoadedInboxKeywords,
  getMatchedMentionHandles,
  getMatchingKeywords,
  getUnreadInboxCount,
  isInboxStateLoaded,
  loadInboxState,
  markInboxRecordsRead,
  removeInboxKeywordsFromState,
  resetInboxStore,
  saveInboxKeywords,
  saveInboxRecords,
  upsertInboxRecord
} from './state';
import type { InboxMatch, LatestInboxRecord } from './types';

export type { LatestInboxRecord };
export {
  getInboxKeywords,
  getLatestInboxRecord,
  getLatestMentionInboxRecord,
  getLoadedInboxKeywords
};

const MAX_PENDING_INBOX_MESSAGES = 60;
const pendingInboxMessages = new Set<HTMLElement>();

let registeredInbox = false;

const inboxButtonOptions = {
  getUnreadCount: getUnreadInboxCount,
  onToggle(anchor: HTMLElement): void {
    if (isInboxCardOpen()) {
      closeInboxCard();
      return;
    }

    openInboxCard(anchor);
  }
};

const inboxCardCallbacks = {
  onClearRecords: clearOpenInboxRecords,
  onKeywordsChanged: handleInboxKeywordsChanged,
  onMarkRead: markInboxRead
};

export function initInbox(): void {
  initMentionDetection();
  initInboxTabAlert();
  if (!registeredInbox) {
    registeredInbox = true;
    registerMentionProcessor(handlePotentialInbox);
  }

  void loadInboxState().then(() => {
    scheduleInboxButtonWire();
    refreshInboxSurfaces(getUnreadInboxCount);
    refreshVisibleChatKeywordHighlights();
    flushPendingInboxMessages();
  });
}

export function handlePotentialInbox(message: HTMLElement): void {
  if (!message.isConnected || !getMessageText(message)) return;
  if (!isInboxStateLoaded()) {
    trackPendingInboxMessage(message);
    void loadInboxState().then(flushPendingInboxMessages);
    return;
  }

  processPotentialMentionForConsumer(message, 'ytcqInboxMentionChecked', () => {
    const text = getMessageText(message);
    recordInboxMatch(message, {
      mention: true,
      mentionHandles: getMatchedMentionHandles(text)
    });
  });

  processPotentialKeywordInbox(message);
}

export function highlightPotentialInboxKeywords(message: HTMLElement): void {
  if (!message.isConnected) return;
  if (!isInboxStateLoaded()) {
    void loadInboxState().then(() => highlightPotentialInboxKeywords(message));
    return;
  }

  applyCurrentChatKeywordHighlights(message);
}

export function scheduleInboxButtonWire(): void {
  scheduleInboxButtonWireInternal(inboxButtonOptions);
}

export function resetInboxState(): void {
  pendingInboxMessages.clear();
  resetInboxStore();
  closeInboxCard();
  clearInboxTabAlert();
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    clearChatKeywordHighlights(message);
    delete message.dataset.ytcqInboxKeywordChecked;
    delete message.dataset.ytcqInboxKeywordHighlightKey;
  });
  refreshInboxSurfaces(getUnreadInboxCount);
}

export function openInboxCard(anchor?: HTMLElement): void {
  void loadInboxState().then(() => {
    openInboxCardView(anchor, inboxCardCallbacks);
  });
}

export async function addInboxKeywords(values: string[]): Promise<{
  added: string[];
  duplicates: string[];
}> {
  await loadInboxState();

  const result = addInboxKeywordsToState(values);
  if (!result.added.length) return result;

  await saveInboxKeywords();
  refreshVisibleChatKeywordHighlights();
  refreshOpenInboxCard();
  return result;
}

export async function removeInboxKeywords(values: string[]): Promise<{
  missing: string[];
  removed: string[];
}> {
  await loadInboxState();

  const result = removeInboxKeywordsFromState(values);
  if (!result.removed.length) return result;

  await saveInboxKeywords();
  refreshVisibleChatKeywordHighlights();
  refreshOpenInboxCard();
  return result;
}

function processPotentialKeywordInbox(message: HTMLElement): void {
  if (!getInboxKeywordsSnapshot().length) {
    clearChatKeywordHighlights(message);
    return;
  }

  const text = getMessageText(message);
  const authorName = getAuthorName(message);
  if (!text && !authorName) return;
  if (isCurrentUserAuthorName(authorName)) {
    applyChatKeywordHighlights(message, [], '');
    return;
  }

  const keywordValues = [authorName, text];
  const keywordKey = getKeywordCheckKeyFromValues(keywordValues);
  if (message.dataset.ytcqInboxKeywordChecked === keywordKey) return;
  message.dataset.ytcqInboxKeywordChecked = keywordKey;

  const matchedKeywords = getMatchingKeywords(...keywordValues);
  if (!matchedKeywords.length) {
    applyChatKeywordHighlights(message, [], '');
    return;
  }

  recordInboxMatch(message, {
    keywords: matchedKeywords
  });
  applyChatKeywordHighlights(message, matchedKeywords, keywordKey);
}

function recordInboxMatch(message: HTMLElement, match: InboxMatch): void {
  const record = createInboxRecord(message, match, {
    getMentionHandles: getMatchedMentionHandles,
    sourceUrl: getCurrentInboxSourceUrl()
  });
  if (!record) return;

  void loadInboxState().then(() => {
    const isReadNow = Boolean(isInboxCardOpen() && isCurrentTabActive());
    const result = upsertInboxRecord({
      ...record,
      read: isReadNow
    }, isReadNow);

    if (!result.changed && result.transientChanged) {
      refreshOpenInboxCard();
      return;
    }
    if (!result.changed) return;

    void saveInboxRecords();
    refreshOpenInboxCard();

    if (isReadNow) {
      markInboxRead();
    } else {
      playAlertSound();
      refreshInboxSurfaces(getUnreadInboxCount);
      showInboxTabAlert(getUnreadInboxCount());
    }
  });
}

function refreshVisibleChatKeywordHighlights(): void {
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR)
    .forEach(applyCurrentChatKeywordHighlights);
}

function applyCurrentChatKeywordHighlights(message: HTMLElement): string[] {
  const text = getMessageText(message);
  const authorName = getAuthorName(message);
  if (isCurrentUserAuthorName(authorName)) {
    applyChatKeywordHighlights(message, [], '');
    return [];
  }

  const keywordValues = [authorName, text];
  const matchedKeywords = getInboxKeywordsSnapshot().length ? getMatchingKeywords(...keywordValues) : [];
  applyChatKeywordHighlights(message, matchedKeywords, matchedKeywords.length ? getKeywordCheckKeyFromValues(keywordValues) : '');
  return matchedKeywords;
}

function clearOpenInboxRecords(): void {
  clearInboxRecords();
  void saveInboxRecords();
  clearInboxTabAlert();
  refreshOpenInboxCard();
  refreshInboxSurfaces(getUnreadInboxCount);
}

function markInboxRead(): void {
  const changed = markInboxRecordsRead();
  if (changed) void saveInboxRecords();
  clearInboxTabAlert();
  refreshInboxSurfaces(getUnreadInboxCount);
}

function handleInboxKeywordsChanged(): void {
  void saveInboxKeywords();
  refreshVisibleChatKeywordHighlights();
  refreshOpenInboxCard();
}

function trackPendingInboxMessage(message: HTMLElement): void {
  pendingInboxMessages.add(message);
  if (pendingInboxMessages.size <= MAX_PENDING_INBOX_MESSAGES) return;

  const oldestMessage = pendingInboxMessages.values().next().value;
  if (oldestMessage) {
    pendingInboxMessages.delete(oldestMessage);
  }
}

function flushPendingInboxMessages(): void {
  const messages = Array.from(pendingInboxMessages);
  pendingInboxMessages.clear();
  messages.forEach((message) => {
    if (message.isConnected) handlePotentialInbox(message);
  });
}
