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
import { CHAT_HEADER_SELECTOR, CHAT_MESSAGE_SELECTOR } from '../../youtube/selectors';
import {
  applyChatKeywordHighlights,
  clearChatKeywordHighlights
} from './highlights';
import {
  getCurrentMentionCandidates,
  isCurrentUserAuthorName,
  onMentionCandidatesChanged
} from '../mention-detection';
import { registerFeature, type FeatureMessageContext } from '../../content/dispatcher';
import {
  cleanupInboxTabAlertListeners,
  clearInboxTabAlert,
  initInboxTabAlert,
  isCurrentTabActive,
  showInboxTabAlert
} from '../tab-alert';
import { playAlertSound } from '../../shared/sounds/alert-sounds';
import {
  cleanupStaleInboxCards,
  closeInboxCard,
  isInboxCardOpen,
  openInboxCardView,
  refreshOpenInboxCard
} from './card';
import {
  cleanupStaleInboxButtons,
  refreshInboxSurfaces,
  scheduleInboxButtonWire as scheduleInboxButtonWireInternal
} from './button';
import { createInboxRecordFromChatFeed } from './records';
import { getCurrentYouTubeChatSourceUrl } from '../../youtube/source-url';
import {
  addInboxKeywordsToState,
  attachLiveInboxMessage,
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
import type { InboxRecord, LatestInboxRecord } from './types';
import {
  isYouTubeChatFeedPage,
  subscribeYouTubeChatFeed,
  type YouTubeChatFeedBatch
} from '../../youtube/chat-feed/source';
import type { YouTubeChatMessageRecord } from '../../youtube/chat-feed/protocol';

export type { LatestInboxRecord };
export {
  getInboxKeywords,
  getLatestInboxRecord,
  getLatestMentionInboxRecord,
  getLoadedInboxKeywords
};

const MAX_PENDING_CHAT_FEED_RECORDS = 60;
const pendingChatFeedRecords = new Map<string, PendingChatFeedRecord>();
const pendingMentionChatFeedRecords = new Map<string, PendingChatFeedRecord>();

interface PendingChatFeedRecord {
  receivedAt: number;
  record: YouTubeChatMessageRecord;
  replayOffsetMs?: number;
  source: 'live' | 'replay';
}

let unsubscribeChatFeed: (() => void) | null = null;
let unsubscribeMentionCandidatesChanged: (() => void) | null = null;

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

registerFeature({
  page: {
    init: initInbox,
    cleanup: cleanupStaleInboxSurfaces,
    reset: resetInboxFeature
  },
  observerIgnore: {
    addedNode: shouldIgnoreInboxHighlightMutation,
    mutation: shouldIgnoreInboxHighlightMutation
  },
  message: handleInboxMessage,
  mutation: handleInboxMutations
});

export function initInbox(): void {
  initInboxTabAlert();
  unsubscribeMentionCandidatesChanged ||= onMentionCandidatesChanged(
    handleInboxMentionCandidatesChanged
  );
  startInboxChatFeed();

  void loadInboxState().then(() => {
    scheduleInboxButtonWire();
    refreshInboxSurfaces(getUnreadInboxCount);
    refreshVisibleChatKeywordHighlights();
  });
}

function handleInboxMessage(
  message: HTMLElement,
  { source }: Pick<FeatureMessageContext, 'source'>
): void {
  if (source === 'added' || source === 'changed') {
    if (!message.isConnected || !getMessageText(message)) return;
    if (attachLiveInboxMessage(message)) refreshOpenInboxCard();
  }
  highlightPotentialInboxKeywords(message);
}

function handleInboxMutations({ addedElements, mutations }: {
  addedElements: Element[];
  mutations: MutationRecord[];
}): void {
  const shouldWireButton = mutations.some((mutation) => {
    return mutation.type === 'childList' &&
      mutation.target instanceof Element &&
      mutation.target.closest(CHAT_HEADER_SELECTOR);
  }) || addedElements.some((element) => {
    return element.matches(CHAT_HEADER_SELECTOR) ||
      Boolean(element.querySelector(CHAT_HEADER_SELECTOR));
  });

  if (shouldWireButton) scheduleInboxButtonWire();
}

function highlightPotentialInboxKeywords(message: HTMLElement): void {
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

function shouldIgnoreInboxHighlightMutation(element: Element): boolean {
  return element.closest<HTMLElement>(CHAT_MESSAGE_SELECTOR)?.dataset.ytcqInboxKeywordHighlighting === 'true';
}

export function resetInboxState(): void {
  pendingChatFeedRecords.clear();
  pendingMentionChatFeedRecords.clear();
  resetInboxStore();
  closeInboxCard();
  clearInboxTabAlert();
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    clearChatKeywordHighlights(message);
    delete message.dataset.ytcqInboxKeywordHighlightKey;
  });
  refreshInboxSurfaces(getUnreadInboxCount);
}

export function cleanupStaleInboxSurfaces(): void {
  stopInboxChatFeed();
  unsubscribeMentionCandidatesChanged?.();
  unsubscribeMentionCandidatesChanged = null;
  cleanupStaleInboxButtons();
  cleanupStaleInboxCards();
  clearInboxTabAlert();
  cleanupInboxTabAlertListeners();
  document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
    clearChatKeywordHighlights(message);
    delete message.dataset.ytcqInboxKeywordHighlightKey;
  });
}

function resetInboxFeature(): void {
  resetInboxState();
  scheduleInboxButtonWire();
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

function commitInboxRecord(record: InboxRecord): void {
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
    playAlertSound('message');
    refreshInboxSurfaces(getUnreadInboxCount);
    showInboxTabAlert(getUnreadInboxCount());
  }
}

function startInboxChatFeed(): void {
  if (unsubscribeChatFeed || !isYouTubeChatFeedPage()) return;
  unsubscribeChatFeed = subscribeYouTubeChatFeed({
    consumer: 'inbox',
    onBatch: handleInboxChatFeedBatch
  });
}

function stopInboxChatFeed(): void {
  unsubscribeChatFeed?.();
  unsubscribeChatFeed = null;
  pendingChatFeedRecords.clear();
  pendingMentionChatFeedRecords.clear();
}

function handleInboxChatFeedBatch(batch: YouTubeChatFeedBatch): void {
  if (batch.activity !== 'new') return;
  const replayTimeline = batch.delivery === 'replay-timeline';
  if (!replayTimeline && batch.source !== 'live' && batch.source !== 'replay') return;
  const source = replayTimeline || batch.source === 'replay' ? 'replay' : 'live';

  batch.actions.forEach((action) => {
    if (action.type !== 'upsert') return;
    enqueueInboxChatFeedRecord({
      receivedAt: batch.receivedAt,
      record: action.record,
      ...(action.replayOffsetMs !== undefined
        ? { replayOffsetMs: action.replayOffsetMs }
        : {}),
      source
    });
  });
}

function enqueueInboxChatFeedRecord(pending: PendingChatFeedRecord): void {
  if (isInboxStateLoaded()) {
    processInboxChatFeedRecord(pending);
    return;
  }

  pendingChatFeedRecords.delete(pending.record.id);
  pendingChatFeedRecords.set(pending.record.id, pending);
  while (pendingChatFeedRecords.size > MAX_PENDING_CHAT_FEED_RECORDS) {
    const oldestId = pendingChatFeedRecords.keys().next().value;
    if (!oldestId) break;
    pendingChatFeedRecords.delete(oldestId);
  }
  void loadInboxState().then(flushPendingInboxChatFeedRecords);
}

function flushPendingInboxChatFeedRecords(): void {
  const pending = [...pendingChatFeedRecords.values()];
  pendingChatFeedRecords.clear();
  pending.forEach(processInboxChatFeedRecord);
}

function processInboxChatFeedRecord(pending: PendingChatFeedRecord): void {
  const authorName = pending.record.author?.name || '';
  const text = pending.record.plainText;
  if (!authorName || !text || isCurrentUserAuthorName(authorName)) return;

  const mentionCandidatesAvailable = getCurrentMentionCandidates().length > 0;
  const mentionHandles = mentionCandidatesAvailable ? getMatchedMentionHandles(text) : [];
  const matchedKeywords = getMatchingKeywords(authorName, text);
  if (!mentionCandidatesAvailable) rememberPendingMentionChatFeedRecord(pending);
  if (!mentionHandles.length && !matchedKeywords.length) return;

  const record = createInboxRecordFromChatFeed(pending.record, {
    ...(matchedKeywords.length ? { keywords: matchedKeywords } : {}),
    ...(mentionHandles.length ? { mention: true, mentionHandles } : {})
  }, {
    receivedAt: pending.receivedAt,
    ...(pending.replayOffsetMs !== undefined
      ? { replayOffsetMs: pending.replayOffsetMs }
      : {}),
    source: pending.source,
    sourceUrl: getCurrentYouTubeChatSourceUrl()
  });
  if (record) commitInboxRecord(record);
}

function rememberPendingMentionChatFeedRecord(pending: PendingChatFeedRecord): void {
  pendingMentionChatFeedRecords.delete(pending.record.id);
  pendingMentionChatFeedRecords.set(pending.record.id, pending);
  while (pendingMentionChatFeedRecords.size > MAX_PENDING_CHAT_FEED_RECORDS) {
    const oldestId = pendingMentionChatFeedRecords.keys().next().value;
    if (!oldestId) break;
    pendingMentionChatFeedRecords.delete(oldestId);
  }
}

function handleInboxMentionCandidatesChanged(candidates: readonly string[]): void {
  if (!candidates.length || !pendingMentionChatFeedRecords.size) return;
  const pending = [...pendingMentionChatFeedRecords.values()];
  pendingMentionChatFeedRecords.clear();
  pending.forEach(processInboxChatFeedRecord);
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
