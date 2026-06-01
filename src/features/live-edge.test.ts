import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('live edge recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.replaceChildren();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scrolls chat to the live edge when the tab is hidden', async () => {
    const lifecycle = await import('../content/lifecycle');
    await import('./live-edge');
    const scroller = createScroller();
    const jumpToBottom = createJumpToBottomButton();
    document.body.append(scroller, jumpToBottom.wrapper);

    lifecycle.handleFeatureVisibilityChanged('hidden');

    expect(scroller.scrollTop).toBe(800);
    expect(jumpToBottom.button.click).toHaveBeenCalledOnce();
  });

  it('retries live-edge recovery after the tab becomes visible again', async () => {
    const lifecycle = await import('../content/lifecycle');
    await import('./live-edge');
    const scroller = createScroller();
    document.body.append(scroller);

    lifecycle.handleFeatureVisibilityChanged('visible');
    scroller.scrollTop = 0;
    await vi.advanceTimersByTimeAsync(120);

    expect(scroller.scrollTop).toBe(800);
  });
});

function createScroller(): HTMLElement {
  const scroller = document.createElement('div');
  scroller.id = 'item-scroller';
  Object.defineProperty(scroller, 'scrollHeight', {
    configurable: true,
    value: 800
  });
  scroller.scrollTop = 0;
  return scroller;
}

function createJumpToBottomButton(): { button: HTMLButtonElement; wrapper: HTMLElement } {
  const wrapper = document.createElement('div');
  const button = document.createElement('button');
  wrapper.id = 'jump-to-bottom-button';
  button.click = vi.fn();
  button.getBoundingClientRect = () => ({
    bottom: 20,
    height: 20,
    left: 0,
    right: 20,
    top: 0,
    width: 20,
    x: 0,
    y: 0,
    toJSON: () => ({})
  });
  wrapper.append(button);
  return { button, wrapper };
}
