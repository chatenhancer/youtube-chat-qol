/**
 * Live edge recovery.
 *
 * YouTube can stop appending new live-chat renderers when chat is scrolled up
 * or when the tab is backgrounded. Keeping the native chat scroller at the
 * bottom gives DOM-driven features fresh messages to observe after tab switches.
 */

const CHAT_SCROLLER_SELECTOR = [
  'yt-live-chat-item-list-renderer #item-scroller',
  'yt-live-chat-renderer #item-scroller',
  '#item-scroller'
].join(',');

const JUMP_TO_BOTTOM_SELECTOR = [
  'yt-live-chat-item-list-renderer #jump-to-bottom-button button',
  'yt-live-chat-item-list-renderer #jump-to-bottom-button',
  '#jump-to-bottom-button button',
  '#jump-to-bottom-button'
].join(',');

const LIVE_EDGE_RETRY_DELAYS = [120, 500, 1200];

let liveEdgeTimer = 0;

export function keepChatAtLiveEdge(): void {
  clickJumpToBottomButton();
  scrollChatToBottom();
}

export function scheduleKeepChatAtLiveEdge(): void {
  keepChatAtLiveEdge();
  if (liveEdgeTimer) window.clearTimeout(liveEdgeTimer);

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

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
