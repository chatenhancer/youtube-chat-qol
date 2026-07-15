import {
  STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS,
  STICK_AROUND_TRAFFIC_WINDOW_MS
} from '../../../../shared/playground/stick-around';
import { getYouTubeChatFeedRecordState } from '../../../../youtube/chat-feed/records';
import { getYouTubeChatFeedRichTextSegments } from '../../../../youtube/chat-feed/rich-text';
import {
  isYouTubeChatFeedPage,
  subscribeYouTubeChatFeed,
  type YouTubeChatFeedBatch
} from '../../../../youtube/chat-feed/source';
import type { YouTubeChatMessageRecord } from '../../../../youtube/chat-feed/protocol';
import type { RichTextSegment } from '../../../../youtube/rich-text';

const MAX_STORED_MESSAGE_TEXTS = 400;
const MAX_OBSERVED_MESSAGE_IDS = 800;
const activeTrafficObservers = new Set<StickAroundChatTrafficObserverInternal>();
let unsubscribeChatFeed: (() => void) | null = null;

export interface StickAroundTrafficObservation {
  count: number;
  messageIds: string[];
  windowStartedAt: number;
}

export interface StickAroundChatTrafficObserver {
  close(): void;
  getMessageRichTextSegments(): ReadonlyMap<string, readonly RichTextSegment[]>;
  getMessageTexts(): ReadonlyMap<string, string>;
  reset(): void;
}

interface StickAroundChatTrafficObserverInternal extends StickAroundChatTrafficObserver {
  applyBatch(batch: YouTubeChatFeedBatch): void;
  rememberRecord(record: YouTubeChatMessageRecord, countTraffic: boolean): void;
}

export function createStickAroundChatTrafficObserver(
  onObserve: (observation: StickAroundTrafficObservation) => void
): StickAroundChatTrafficObserver {
  const messageChannelIds = new Map<string, string>();
  const messageRichTextSegments = new Map<string, RichTextSegment[]>();
  const messageTexts = new Map<string, string>();
  const observedMessageIds = new Set<string>();
  const pendingMessageIds = new Set<string>();
  let pendingCount = 0;
  let windowStartedAt = Date.now();

  const intervalId = window.setInterval(flush, STICK_AROUND_TRAFFIC_WINDOW_MS);
  const observer: StickAroundChatTrafficObserverInternal = {
    applyBatch(batch) {
      batch.actions.forEach((action) => {
        if (action.type === 'reset') {
          resetFeed();
          return;
        }
        if (action.type === 'upsert') {
          rememberRecord(action.record, batch.activity === 'new');
          return;
        }
        if (action.type === 'remove') {
          forgetRecord(action.id);
          return;
        }

        [...messageChannelIds.entries()].forEach(([messageId, channelId]) => {
          if (channelId === action.channelId) forgetRecord(messageId);
        });
      });
    },
    close() {
      activeTrafficObservers.delete(observer);
      window.clearInterval(intervalId);
      if (!activeTrafficObservers.size) stopChatFeed();
    },
    getMessageTexts() {
      return messageTexts;
    },
    getMessageRichTextSegments() {
      return messageRichTextSegments;
    },
    rememberRecord,
    reset() {
      resetPendingTraffic();
    }
  };

  activeTrafficObservers.add(observer);
  getYouTubeChatFeedRecordState().records.forEach((record) => rememberRecord(record, false));
  startChatFeed();
  return observer;

  function rememberRecord(record: YouTubeChatMessageRecord, countTraffic: boolean): void {
    const messageId = record.id.trim();
    if (!messageId) return;

    const alreadyObserved = observedMessageIds.has(messageId);
    if (!alreadyObserved) {
      observedMessageIds.add(messageId);
      trimObservedMessageIds();
    }

    const channelId = record.author?.channelId?.trim() || '';
    if (channelId) messageChannelIds.set(messageId, channelId);

    const text = record.plainText.trim();
    if (text) {
      messageTexts.delete(messageId);
      messageTexts.set(messageId, text);
      const segments = getYouTubeChatFeedRichTextSegments(record);
      if (segments.length) {
        messageRichTextSegments.set(messageId, segments);
      } else {
        messageRichTextSegments.delete(messageId);
      }
      trimStoredMessageTexts();
    }

    if (alreadyObserved || !countTraffic) return;
    pendingCount += 1;
    pendingMessageIds.add(messageId);
  }

  function forgetRecord(messageId: string): void {
    messageChannelIds.delete(messageId);
    messageTexts.delete(messageId);
    messageRichTextSegments.delete(messageId);
  }

  function resetFeed(): void {
    messageChannelIds.clear();
    messageRichTextSegments.clear();
    messageTexts.clear();
    observedMessageIds.clear();
    resetPendingTraffic();
  }

  function resetPendingTraffic(): void {
    pendingCount = 0;
    pendingMessageIds.clear();
    windowStartedAt = Date.now();
  }

  function trimObservedMessageIds(): void {
    while (observedMessageIds.size > MAX_OBSERVED_MESSAGE_IDS) {
      const oldestId = observedMessageIds.values().next().value;
      if (!oldestId) return;
      observedMessageIds.delete(oldestId);
      messageChannelIds.delete(oldestId);
    }
  }

  function trimStoredMessageTexts(): void {
    while (messageTexts.size > MAX_STORED_MESSAGE_TEXTS) {
      const oldestId = messageTexts.keys().next().value;
      if (!oldestId) return;
      messageTexts.delete(oldestId);
      messageRichTextSegments.delete(oldestId);
    }
  }

  function flush(): void {
    if (!pendingCount) {
      windowStartedAt = Date.now();
      return;
    }
    onObserve({
      count: pendingCount,
      messageIds: [...pendingMessageIds].slice(0, STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS),
      windowStartedAt
    });
    resetPendingTraffic();
  }
}

function startChatFeed(): void {
  if (unsubscribeChatFeed || !isYouTubeChatFeedPage()) return;
  unsubscribeChatFeed = subscribeYouTubeChatFeed({
    consumer: 'records',
    onBatch: handleChatFeedBatch
  });
}

function stopChatFeed(): void {
  unsubscribeChatFeed?.();
  unsubscribeChatFeed = null;
}

function handleChatFeedBatch(batch: YouTubeChatFeedBatch): void {
  activeTrafficObservers.forEach((observer) => observer.applyBatch(batch));
}
