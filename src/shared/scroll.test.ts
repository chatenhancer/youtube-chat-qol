import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureScrollPosition,
  restoreScrollPositionAfterRender,
  scrollElementToBottom
} from './scroll';

describe('scroll helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores the exact previous scroll position when the user was reading older items', async () => {
    vi.useFakeTimers();
    const element = scrollElement({ clientHeight: 100, scrollHeight: 300, scrollTop: 80 });
    const position = captureScrollPosition(element);
    setScrollMetrics(element, { clientHeight: 100, scrollHeight: 420 });

    restoreScrollPositionAfterRender(element, position);
    await vi.runAllTimersAsync();

    expect(element.scrollTop).toBe(80);
  });

  it('keeps panels pinned to the bottom when they were already at the bottom', async () => {
    vi.useFakeTimers();
    const element = scrollElement({ clientHeight: 100, scrollHeight: 300, scrollTop: 200 });
    const position = captureScrollPosition(element);
    setScrollMetrics(element, { clientHeight: 100, scrollHeight: 450 });

    restoreScrollPositionAfterRender(element, position);
    await vi.runAllTimersAsync();

    expect(element.scrollTop).toBe(450);
  });

  it('clamps preserved positions when content becomes shorter', async () => {
    vi.useFakeTimers();
    const element = scrollElement({ clientHeight: 100, scrollHeight: 500, scrollTop: 300 });
    const position = captureScrollPosition(element);
    setScrollMetrics(element, { clientHeight: 100, scrollHeight: 250 });

    restoreScrollPositionAfterRender(element, position);
    await vi.runAllTimersAsync();

    expect(element.scrollTop).toBe(150);
  });

  it('scrolls to the bottom on request', async () => {
    vi.useFakeTimers();
    const element = scrollElement({ clientHeight: 100, scrollHeight: 320, scrollTop: 0 });

    scrollElementToBottom(element);
    await vi.runAllTimersAsync();

    expect(element.scrollTop).toBe(320);
  });
});

function scrollElement({
  clientHeight,
  scrollHeight,
  scrollTop
}: {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}): HTMLElement {
  const element = document.createElement('div');
  setScrollMetrics(element, { clientHeight, scrollHeight });
  element.scrollTop = scrollTop;
  return element;
}

function setScrollMetrics(
  element: HTMLElement,
  {
    clientHeight,
    scrollHeight
  }: {
    clientHeight: number;
    scrollHeight: number;
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
}
