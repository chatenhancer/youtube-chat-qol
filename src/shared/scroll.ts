/**
 * Small helpers for panels that should follow new content only while pinned to
 * the bottom, without pulling the user away from older items they are reading.
 */
const BOTTOM_TOLERANCE_PX = 6;

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
      return;
    }

    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = Math.min(position.scrollTop, maxScrollTop);
  });
}

export function scrollElementToBottom(element: HTMLElement): void {
  window.requestAnimationFrame(() => {
    element.scrollTop = element.scrollHeight;
  });
}

function isScrolledToBottom(element: HTMLElement): boolean {
  return element.scrollTop + element.clientHeight >= element.scrollHeight - BOTTOM_TOLERANCE_PX;
}
