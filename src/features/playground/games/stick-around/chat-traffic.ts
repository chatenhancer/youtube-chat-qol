import {
  STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS,
  STICK_AROUND_TRAFFIC_WINDOW_MS
} from '../../../../shared/playground/stick-around';
import { getMessageStableId, getMessageText } from '../../../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../../../youtube/selectors';

const MAX_STORED_MESSAGE_TEXTS = 400;

export interface StickAroundTrafficObservation {
  count: number;
  messageIds: string[];
  windowStartedAt: number;
}

export interface StickAroundChatTrafficObserver {
  close(): void;
  getMessageTexts(): ReadonlyMap<string, string>;
  refresh(): void;
}

export function createStickAroundChatTrafficObserver(
  onObserve: (observation: StickAroundTrafficObservation) => void
): StickAroundChatTrafficObserver {
  const messageTexts = new Map<string, string>();
  const observedElements = new WeakSet<HTMLElement>();
  const pendingMessageIds = new Set<string>();
  let pendingCount = 0;
  let windowStartedAt = Date.now();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        collectMessages(node, true);
      });
    });
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  collectExistingMessages();
  const intervalId = window.setInterval(flush, STICK_AROUND_TRAFFIC_WINDOW_MS);

  return {
    close() {
      observer.disconnect();
      window.clearInterval(intervalId);
    },
    getMessageTexts() {
      return messageTexts;
    },
    refresh() {
      collectExistingMessages();
    }
  };

  function collectExistingMessages(): void {
    document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
      rememberMessage(message, false);
    });
  }

  function collectMessages(node: Node, countTraffic: boolean): void {
    if (!(node instanceof Element)) return;
    if (node instanceof HTMLElement && node.matches(CHAT_MESSAGE_SELECTOR)) {
      rememberMessage(node, countTraffic);
    }
    node.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
      rememberMessage(message, countTraffic);
    });
  }

  function rememberMessage(message: HTMLElement, countTraffic: boolean): void {
    const alreadyObserved = observedElements.has(message);
    if (!alreadyObserved) observedElements.add(message);
    const messageId = getMessageStableId(message);
    const text = getMessageText(message);
    if (messageId && text) {
      messageTexts.set(messageId, text);
      trimStoredMessageTexts();
    }
    if (alreadyObserved || !countTraffic) return;
    pendingCount += 1;
    if (messageId) pendingMessageIds.add(messageId);
  }

  function trimStoredMessageTexts(): void {
    while (messageTexts.size > MAX_STORED_MESSAGE_TEXTS) {
      const oldestKey = messageTexts.keys().next().value;
      if (!oldestKey) return;
      messageTexts.delete(oldestKey);
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
    pendingCount = 0;
    pendingMessageIds.clear();
    windowStartedAt = Date.now();
  }
}
