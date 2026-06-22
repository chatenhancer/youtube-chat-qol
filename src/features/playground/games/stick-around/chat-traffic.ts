import {
  STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS,
  STICK_AROUND_TRAFFIC_WINDOW_MS
} from '../../../../shared/playground/stick-around';
import { registerFeatureLifecycle, type FeatureMessageContext } from '../../../../content/lifecycle';
import { getMessageStableId, getMessageText } from '../../../../youtube/messages';
import { CHAT_MESSAGE_SELECTOR } from '../../../../youtube/selectors';

const MAX_STORED_MESSAGE_TEXTS = 400;
const activeTrafficObservers = new Set<StickAroundChatTrafficObserverInternal>();

export interface StickAroundTrafficObservation {
  count: number;
  messageIds: string[];
  windowStartedAt: number;
}

export interface StickAroundChatTrafficObserver {
  close(): void;
  getMessageTexts(): ReadonlyMap<string, string>;
  recordMessage(message: HTMLElement, countTraffic: boolean): void;
  refresh(): void;
  reset(): void;
}

interface StickAroundChatTrafficObserverInternal extends StickAroundChatTrafficObserver {
  recordMessage(message: HTMLElement, countTraffic: boolean): void;
}

registerFeatureLifecycle({
  message: { collect: handleStickAroundLifecycleMessage }
});

export function createStickAroundChatTrafficObserver(
  onObserve: (observation: StickAroundTrafficObservation) => void
): StickAroundChatTrafficObserver {
  const messageTexts = new Map<string, string>();
  const observedElements = new WeakSet<HTMLElement>();
  const pendingMessageIds = new Set<string>();
  let pendingCount = 0;
  let windowStartedAt = Date.now();

  collectExistingMessages();
  const intervalId = window.setInterval(flush, STICK_AROUND_TRAFFIC_WINDOW_MS);

  const observer: StickAroundChatTrafficObserverInternal = {
    close() {
      activeTrafficObservers.delete(observer);
      window.clearInterval(intervalId);
    },
    getMessageTexts() {
      return messageTexts;
    },
    recordMessage(message: HTMLElement, countTraffic: boolean) {
      rememberMessage(message, countTraffic);
    },
    refresh() {
      collectExistingMessages();
    },
    reset() {
      pendingCount = 0;
      pendingMessageIds.clear();
      windowStartedAt = Date.now();
    }
  };
  activeTrafficObservers.add(observer);
  return observer;

  function collectExistingMessages(): void {
    document.querySelectorAll<HTMLElement>(CHAT_MESSAGE_SELECTOR).forEach((message) => {
      rememberMessage(message, false);
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

function handleStickAroundLifecycleMessage(message: HTMLElement, context: FeatureMessageContext): void {
  if (!activeTrafficObservers.size) return;
  const countTraffic = context.source === 'added' && context.allowTranslate;
  activeTrafficObservers.forEach((observer) => observer.recordMessage(message, countTraffic));
}
