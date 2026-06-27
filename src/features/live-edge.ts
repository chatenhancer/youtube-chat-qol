/**
 * Live edge recovery.
 *
 * YouTube can stop appending new live-chat renderers when chat is scrolled up
 * or when the tab is backgrounded. Keeping the native chat scroller at the
 * bottom gives DOM-driven features fresh messages to observe after tab switches.
 */
import { registerFeatureLifecycle } from '../content/lifecycle';
import { CHAT_SCROLLER_SELECTOR } from '../youtube/selectors';

const JUMP_TO_BOTTOM_SELECTOR = [
  'yt-live-chat-item-list-renderer #jump-to-bottom-button button',
  'yt-live-chat-item-list-renderer #jump-to-bottom-button',
  '#jump-to-bottom-button button',
  '#jump-to-bottom-button'
].join(',');

const LIVE_EDGE_RETRY_DELAYS = [120, 500, 1200];

let liveEdgeTimer = 0;
let liveEdgeListeners = new AbortController();

registerFeatureLifecycle({
  page: {
    init: initLiveEdgeRecovery,
    cleanupStale: cleanupStaleLiveEdgeRecovery,
    visibilityChanged: handleVisibilityChanged
  }
});

function initLiveEdgeRecovery(): void {
  window.addEventListener('blur', keepChatAtLiveEdge, { signal: liveEdgeListeners.signal });
}

function cleanupStaleLiveEdgeRecovery(): void {
  liveEdgeListeners.abort();
  liveEdgeListeners = new AbortController();
  clearLiveEdgeTimer();
}

function handleVisibilityChanged(visibilityState: Document['visibilityState']): void {
  if (visibilityState === 'hidden') {
    keepChatAtLiveEdge();
    return;
  }

  scheduleKeepChatAtLiveEdge();
}

function keepChatAtLiveEdge(): void {
  clickJumpToBottomButton();
  scrollChatToBottom();
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

function scrollChatToBottom(): void {
  const scroller = document.querySelector<HTMLElement>(CHAT_SCROLLER_SELECTOR);
  if (!scroller) return;

  scroller.scrollTop = scroller.scrollHeight;
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
}

function clickJumpToBottomButton(): void {
  const button = Array.from(document.querySelectorAll<HTMLElement>(JUMP_TO_BOTTOM_SELECTOR))
    .find(isVisibleElement);
  button?.click();
}

function clearLiveEdgeTimer(): void {
  if (!liveEdgeTimer) return;
  window.clearTimeout(liveEdgeTimer);
  liveEdgeTimer = 0;
}

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
