import { CHAT_SCROLLER_SELECTOR } from './selectors';

export const CHAT_LIVE_EDGE_RELEASE_EVENT = 'ytcq:chat-live-edge-release';
export const CHAT_LIVE_EDGE_RETURN_EVENT = 'ytcq:chat-live-edge-return';

const JUMP_TO_BOTTOM_SELECTOR = [
  'yt-live-chat-item-list-renderer #jump-to-bottom-button button',
  'yt-live-chat-item-list-renderer #jump-to-bottom-button',
  '#jump-to-bottom-button button',
  '#jump-to-bottom-button'
].join(',');

export function findChatScroller(scope: ParentNode = document): HTMLElement | null {
  return scope.querySelector<HTMLElement>(CHAT_SCROLLER_SELECTOR);
}

export function keepChatAtLiveEdge(scope: ParentNode = document): boolean {
  clickJumpToBottomButton(scope);
  return scrollChatToBottom(scope);
}

export function scrollChatToBottom(scope: ParentNode = document): boolean {
  const scroller = findChatScroller(scope);
  if (!scroller) return false;

  const previousScrollTop = scroller.scrollTop;
  signalChatLiveEdgeReturn(scroller);
  scroller.scrollTop = scroller.scrollHeight;
  const didScroll = scroller.scrollTop !== previousScrollTop;
  if (didScroll) {
    scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
  }
  return didScroll;
}

export function signalChatLiveEdgeRelease(scroller: HTMLElement): void {
  scroller.dispatchEvent(new Event(CHAT_LIVE_EDGE_RELEASE_EVENT, { bubbles: true }));
}

export function signalChatLiveEdgeReturn(scroller: HTMLElement): void {
  scroller.dispatchEvent(new Event(CHAT_LIVE_EDGE_RETURN_EVENT, { bubbles: true }));
}

function clickJumpToBottomButton(scope: ParentNode): void {
  const button = Array.from(scope.querySelectorAll<HTMLElement>(JUMP_TO_BOTTOM_SELECTOR))
    .find(isVisibleElement);
  button?.click();
}

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
