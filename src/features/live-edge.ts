/**
 * Live edge recovery.
 *
 * YouTube can stop appending new live-chat renderers when chat is scrolled up
 * or when the tab is backgrounded. Keeping the native chat scroller at the
 * bottom gives DOM-driven features fresh messages to observe after tab switches.
 */
import { registerFeatureLifecycle } from '../content/lifecycle';
import { LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE } from '../shared/live-edge';
import { keepChatAtLiveEdge } from '../youtube/chat-scroll';

const LIVE_EDGE_RETRY_DELAYS = [120, 500, 1200];

let liveEdgeTimer = 0;

registerFeatureLifecycle({
  page: {
    init: initLiveEdgeRecovery,
    cleanupStale: cleanupStaleLiveEdgeRecovery,
    visibilityChanged: handleVisibilityChanged
  }
});

function initLiveEdgeRecovery(): void {
  chrome.runtime.onMessage.addListener(handleLiveEdgeMessage);
}

function cleanupStaleLiveEdgeRecovery(): void {
  chrome.runtime.onMessage.removeListener(handleLiveEdgeMessage);
  clearLiveEdgeTimer();
}

function handleLiveEdgeMessage(message: { type?: string }): false {
  if (message?.type === LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE) {
    keepChatAtLiveEdge();
  }
  return false;
}

function handleVisibilityChanged(visibilityState: Document['visibilityState']): void {
  if (visibilityState === 'hidden') {
    keepChatAtLiveEdge();
    return;
  }

  scheduleKeepChatAtLiveEdge();
}

function scheduleKeepChatAtLiveEdge(): void {
  keepChatAtLiveEdge();
  clearLiveEdgeTimer();

  let attempt = 0;
  const tick = (): void => {
    const delay = LIVE_EDGE_RETRY_DELAYS[attempt];
    if (delay === undefined) {
      liveEdgeTimer = 0;
      return;
    }

    liveEdgeTimer = window.setTimeout(() => {
      keepChatAtLiveEdge();
      attempt += 1;
      tick();
    }, delay);
  };

  tick();
}

function clearLiveEdgeTimer(): void {
  if (!liveEdgeTimer) return;
  window.clearTimeout(liveEdgeTimer);
  liveEdgeTimer = 0;
}
