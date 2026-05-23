/**
 * Jump-to-message helpers for extension-owned cards.
 *
 * Scrolls YouTube's internal chat list only, so jumping to a message does not
 * move the outer YouTube watch page.
 */
import { returnToChatInputPanel } from '../youtube/chat-input';

const JUMP_AFTER_PANEL_RETURN_DELAY_MS = 120;
const JUMP_LIVE_EDGE_RELEASE_OFFSET = 48;
const JUMP_TARGET_CLASS = 'ytcq-message-jump-target';
const CHAT_SCROLLER_SELECTOR = [
  'yt-live-chat-item-list-renderer #item-scroller',
  'yt-live-chat-renderer #item-scroller',
  '#item-scroller'
].join(',');

export function jumpToChatMessage(target: HTMLElement): void {
  if (returnToChatInputPanel()) {
    window.setTimeout(() => {
      scrollToChatMessage(target);
    }, JUMP_AFTER_PANEL_RETURN_DELAY_MS);
    return;
  }

  scrollToChatMessage(target);
}

export function createJumpToMessageIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 -960 960 960');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('aria-hidden', 'true');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M440-42v-80q-125-14-214.5-103.5T122-440H42v-80h80q14-125 103.5-214.5T440-838v-80h80v80q125 14 214.5 103.5T838-520h80v80h-80q-14 125-103.5 214.5T520-122v80h-80Zm40-158q116 0 198-82t82-198q0-116-82-198t-198-82q-116 0-198 82t-82 198q0 116 82 198t198 82Zm0-120q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T560-480q0-33-23.5-56.5T480-560q-33 0-56.5 23.5T400-480q0 33 23.5 56.5T480-400Zm0-80Z');
  icon.append(path);

  return icon;
}

function scrollToChatMessage(target: HTMLElement): void {
  if (!target.isConnected) return;

  scrollChatScrollerToMessage(target);
  target.classList.add(JUMP_TARGET_CLASS);
  window.setTimeout(() => {
    target.classList.remove(JUMP_TARGET_CLASS);
  }, 1600);
}

function scrollChatScrollerToMessage(target: HTMLElement): void {
  const scroller = findChatScroller(target);
  if (!scroller) return;

  const nextTop = getMessageScrollTop(scroller, target);
  if (isChatScrollerAtLiveEdge(scroller) && nextTop < scroller.scrollTop - 1) {
    releaseChatLiveEdge(scroller);
    window.requestAnimationFrame(() => {
      scrollChatScrollerToMessage(target);
    });
    return;
  }

  scroller.scrollTo({
    top: nextTop,
    behavior: 'smooth'
  });
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
}

function getMessageScrollTop(scroller: HTMLElement, target: HTMLElement): number {
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetTop = targetRect.top - scrollerRect.top + scroller.scrollTop;
  const centeredTop = targetTop - Math.max(0, (scroller.clientHeight - targetRect.height) / 2);
  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  return Math.min(Math.max(0, centeredTop), maxTop);
}

function releaseChatLiveEdge(scroller: HTMLElement): void {
  scroller.scrollTo({
    top: Math.max(0, scroller.scrollTop - JUMP_LIVE_EDGE_RELEASE_OFFSET),
    behavior: 'auto'
  });
  scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
}

function isChatScrollerAtLiveEdge(scroller: HTMLElement): boolean {
  return scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
}

function findChatScroller(target: HTMLElement): HTMLElement | null {
  const listRenderer = target.closest('yt-live-chat-item-list-renderer');
  const scopedScroller = listRenderer?.querySelector<HTMLElement>('#item-scroller');
  if (scopedScroller?.contains(target)) return scopedScroller;

  return Array.from(document.querySelectorAll<HTMLElement>(CHAT_SCROLLER_SELECTOR))
    .find((scroller) => scroller.contains(target)) || null;
}
