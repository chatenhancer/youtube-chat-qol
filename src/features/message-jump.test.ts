import { afterEach, describe, expect, it, vi } from 'vitest';
import { returnToChatInputPanel } from '../youtube/chat-input';
import { jumpToChatMessage } from './message-jump';

vi.mock('../youtube/chat-input', () => ({
  returnToChatInputPanel: vi.fn(() => false)
}));

describe('message jump helpers', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.mocked(returnToChatInputPanel).mockReturnValue(false);
  });

  it('scrolls YouTube chat scroller to center the target without moving the page', () => {
    const { scroller, scrollTo, target } = createScrollableChat();
    scrollTo.mockImplementation(({ top }) => {
      scroller.scrollTop = Number(top);
    });

    jumpToChatMessage(target);

    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'smooth',
      top: 260
    });
    expect(target.classList.contains('ytcq-message-jump-target')).toBe(true);
  });

  it('waits for YouTube to return from auxiliary panels before jumping', async () => {
    vi.useFakeTimers();
    vi.mocked(returnToChatInputPanel).mockReturnValue(true);
    const { scrollTo, target } = createScrollableChat();

    jumpToChatMessage(target);

    expect(scrollTo).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(120);
    expect(scrollTo).toHaveBeenCalled();
  });

  it('does nothing for disconnected message renderers', () => {
    const { scrollTo, target } = createScrollableChat();
    target.remove();

    jumpToChatMessage(target);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

function createScrollableChat(): {
  scroller: HTMLElement;
  scrollTo: ReturnType<typeof vi.fn>;
  target: HTMLElement;
} {
  const list = document.createElement('yt-live-chat-item-list-renderer');
  const scroller = document.createElement('div');
  const target = document.createElement('yt-live-chat-text-message-renderer');
  const scrollTo = vi.fn();
  scroller.id = 'item-scroller';
  Object.defineProperty(scroller, 'scrollTo', {
    configurable: true,
    value: scrollTo
  });
  scroller.appendChild(target);
  list.appendChild(scroller);
  document.body.appendChild(list);

  setScrollMetrics(scroller, {
    clientHeight: 100,
    scrollHeight: 500,
    scrollTop: 0
  });
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(rect({
    left: 0,
    top: 0,
    width: 300,
    height: 100
  }));
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect({
    left: 0,
    top: 300,
    width: 300,
    height: 20
  }));

  return { scroller, scrollTo, target };
}

function setScrollMetrics(
  element: HTMLElement,
  {
    clientHeight,
    scrollHeight,
    scrollTop
  }: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
  }
): void {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight
  });
  element.scrollTop = scrollTop;
}

function rect({
  left,
  top,
  width,
  height
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({})
  } as DOMRect;
}
