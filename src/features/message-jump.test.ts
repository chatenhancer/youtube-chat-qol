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
    vi.useFakeTimers();
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
    vi.advanceTimersByTime(1600);
    expect(target.classList.contains('ytcq-message-jump-target')).toBe(false);
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

  it('releases the live edge before jumping upward in chat', async () => {
    vi.useFakeTimers();
    const { scroller, scrollTo, target } = createScrollableChat();
    setScrollMetrics(scroller, {
      clientHeight: 100,
      scrollHeight: 500,
      scrollTop: 400
    });
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect({
      left: 0,
      top: -200,
      width: 300,
      height: 20
    }));
    scrollTo.mockImplementation(({ top }) => {
      scroller.scrollTop = Number(top);
    });

    jumpToChatMessage(target);
    expect(scrollTo).toHaveBeenCalledWith({
      behavior: 'auto',
      top: 352
    });
    await vi.runOnlyPendingTimersAsync();

    expect(scrollTo).toHaveBeenLastCalledWith({
      behavior: 'smooth',
      top: 112
    });
  });

  it('can find a fallback chat scroller outside the closest list renderer', () => {
    const target = document.createElement('yt-live-chat-text-message-renderer');
    const scopedList = document.createElement('yt-live-chat-item-list-renderer');
    const foreignScroller = document.createElement('div');
    foreignScroller.id = 'item-scroller';
    scopedList.append(target);
    foreignScroller.append(scopedList);
    document.body.append(foreignScroller);
    const scrollTo = vi.fn();
    Object.defineProperty(foreignScroller, 'scrollTo', {
      configurable: true,
      value: scrollTo
    });
    setScrollMetrics(foreignScroller, {
      clientHeight: 100,
      scrollHeight: 500,
      scrollTop: 0
    });
    vi.spyOn(foreignScroller, 'getBoundingClientRect').mockReturnValue(rect({
      left: 0,
      top: 0,
      width: 300,
      height: 100
    }));
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect({
      left: 0,
      top: 120,
      width: 300,
      height: 20
    }));

    jumpToChatMessage(target);

    expect(scrollTo).toHaveBeenCalled();
  });

  it('does nothing when no chat scroller contains the target', () => {
    const target = document.createElement('yt-live-chat-text-message-renderer');
    document.body.append(target);

    jumpToChatMessage(target);

    expect(target.classList.contains('ytcq-message-jump-target')).toBe(true);
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
