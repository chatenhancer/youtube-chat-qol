/**
 * Jump-to-message helpers for extension-owned cards.
 *
 * Scrolls YouTube's internal chat list only, so jumping to a message does not
 * move the outer YouTube watch page.
 */
import { returnToChatInputPanel } from '../youtube/chat-input';
import { signalChatLiveEdgeRelease } from '../youtube/chat-scroll';
import { CHAT_SCROLLER_SELECTOR } from '../youtube/selectors';
import {
  hasRetainedLiteModeMessage,
  revealRetainedLiteModeMessage
} from './lite-mode/controller';
export { createJumpToMessageIcon } from '../shared/icons';

const JUMP_AFTER_PANEL_RETURN_DELAY_MS = 120;
const JUMP_LIVE_EDGE_RELEASE_OFFSET = 48;
const JUMP_TARGET_CLASS = 'ytcq-message-jump-target';

export function canJumpToChatMessage(
  target: HTMLElement | null,
  messageId = ''
): boolean {
  return Boolean(target?.isConnected || hasRetainedLiteModeMessage(messageId));
}

export function jumpToChatMessage(target: HTMLElement | null, messageId = ''): void {
  const jump = (): void => {
    const resolvedTarget = target?.isConnected
      ? target
      : revealRetainedLiteModeMessage(messageId);
    if (resolvedTarget) scrollToChatMessage(resolvedTarget);
  };

  if (returnToChatInputPanel()) {
    window.setTimeout(jump, JUMP_AFTER_PANEL_RETURN_DELAY_MS);
    return;
  }

  jump();
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
  signalChatLiveEdgeRelease(scroller);
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
  // ytcq-allow-local-youtube-selector: scoped lookup inside the containing chat list.
  const scopedScroller = listRenderer?.querySelector<HTMLElement>('#item-scroller');
  if (scopedScroller?.contains(target)) return scopedScroller;

  return Array.from(document.querySelectorAll<HTMLElement>(CHAT_SCROLLER_SELECTOR))
    .find((scroller) => scroller.contains(target)) || null;
}
