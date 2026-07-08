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

export function captureScrollPosition(element: HTMLElement): ScrollPosition {
  return {
    scrollTop: element.scrollTop,
    wasAtBottom: isScrolledToBottom(element)
  };
}

export function restoreScrollPositionAfterRender(element: HTMLElement, position: ScrollPosition): void {
  window.requestAnimationFrame(() => {
    if (position.wasAtBottom) {
      element.scrollTop = element.scrollHeight;
      updateScrollEdgeFades(element);
      return;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = Math.min(position.scrollTop, maxScrollTop);
    updateScrollEdgeFades(element);
  });
}

export function scrollElementToBottom(element: HTMLElement): void {
  window.requestAnimationFrame(() => {
    element.scrollTop = element.scrollHeight;
    updateScrollEdgeFades(element);
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
