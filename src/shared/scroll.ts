/**
 * Small helpers for panels that should follow new content only while pinned to
 * the bottom, without pulling the user away from older items they are reading.
 */
const BOTTOM_TOLERANCE_PX = 6;
const EDGE_FADE_TOLERANCE_PX = 1;

interface ScrollPosition {
  scrollTop: number;
  wasAtBottom: boolean;
}

interface PendingScrollRestore {
  animationFrame: number;
  position: ScrollPosition;
}

const pendingScrollRestores = new WeakMap<HTMLElement, PendingScrollRestore>();

export function captureScrollPosition(element: HTMLElement): ScrollPosition {
  const pending = pendingScrollRestores.get(element);
  if (pending) return { ...pending.position };

  return {
    scrollTop: element.scrollTop,
    wasAtBottom: isScrolledToBottom(element)
  };
}

export function restoreScrollPositionAfterRender(element: HTMLElement, position: ScrollPosition): void {
  scheduleScrollRestore(element, position);
}

export function scrollElementToBottom(element: HTMLElement): void {
  scheduleScrollRestore(element, {
    scrollTop: element.scrollTop,
    wasAtBottom: true
  });
}

export function wireScrollEdgeFades(element: HTMLElement): () => void {
  element.classList.add('ytcq-scroll-fade');

  let animationFrame = 0;
  const scheduleUpdate = (): void => {
    if (animationFrame) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = 0;
      updateScrollEdgeFades(element);
    });
  };
  const resizeObserver = typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver(scheduleUpdate);

  element.addEventListener('scroll', scheduleUpdate, { passive: true });
  resizeObserver?.observe(element);
  scheduleUpdate();

  return () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    element.removeEventListener('scroll', scheduleUpdate);
    element.classList.remove('ytcq-scroll-fade', 'ytcq-scroll-fade-top', 'ytcq-scroll-fade-bottom');
  };
}

export function updateScrollEdgeFades(element: HTMLElement): void {
  const canScroll = element.scrollHeight > element.clientHeight + EDGE_FADE_TOLERANCE_PX;
  const hasTopContent = canScroll && element.scrollTop > EDGE_FADE_TOLERANCE_PX;
  const hasBottomContent = canScroll &&
    element.scrollTop + element.clientHeight < element.scrollHeight - EDGE_FADE_TOLERANCE_PX;

  element.classList.toggle('ytcq-scroll-fade-top', hasTopContent);
  element.classList.toggle('ytcq-scroll-fade-bottom', hasBottomContent);
}

function isScrolledToBottom(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - BOTTOM_TOLERANCE_PX;
}

function scheduleScrollRestore(element: HTMLElement, position: ScrollPosition): void {
  const previous = pendingScrollRestores.get(element);
  if (previous) window.cancelAnimationFrame(previous.animationFrame);

  const pending: PendingScrollRestore = {
    animationFrame: 0,
    position: { ...position }
  };
  pendingScrollRestores.set(element, pending);
  pending.animationFrame = window.requestAnimationFrame(() => {
    if (pendingScrollRestores.get(element) !== pending) return;
    pendingScrollRestores.delete(element);

    if (pending.position.wasAtBottom) {
      element.scrollTop = element.scrollHeight;
    } else {
      const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.min(pending.position.scrollTop, maxScrollTop);
    }
    updateScrollEdgeFades(element);
  });
}
