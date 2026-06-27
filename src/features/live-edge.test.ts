import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE } from '../shared/live-edge';

describe('live edge recovery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
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

  it('scrolls chat to the live edge when the background reports browser window blur', async () => {
    const lifecycle = await import('../content/lifecycle');
    await import('./live-edge');
    const scroller = createScroller();
    const jumpToBottom = createJumpToBottomButton();
    document.body.append(scroller, jumpToBottom.wrapper);

    lifecycle.initFeatures({ saveOptions: vi.fn() });
    const listener = getLiveEdgeMessageListener();

    listener({ type: 'other-message' });
    expect(scroller.scrollTop).toBe(0);
    expect(jumpToBottom.button.click).not.toHaveBeenCalled();

    listener({ type: LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE });

    expect(scroller.scrollTop).toBe(800);
    expect(jumpToBottom.button.click).toHaveBeenCalledOnce();

    lifecycle.suspendFeatures();

    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalledWith(listener);
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

  it('ignores missing scrollers and hidden jump buttons', async () => {
    const lifecycle = await import('../content/lifecycle');
    await import('./live-edge');
    const jumpToBottom = createJumpToBottomButton();
    jumpToBottom.button.getBoundingClientRect = () => ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    });
    document.body.append(jumpToBottom.wrapper);

    expect(() => lifecycle.handleFeatureVisibilityChanged('hidden')).not.toThrow();
    expect(jumpToBottom.button.click).not.toHaveBeenCalled();
  });

  it('replaces existing retry timers and stops after all retry delays', async () => {
    const lifecycle = await import('../content/lifecycle');
    await import('./live-edge');
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const scroller = createScroller();
    document.body.append(scroller);

    lifecycle.handleFeatureVisibilityChanged('visible');
    lifecycle.handleFeatureVisibilityChanged('visible');

    expect(clearTimeoutSpy).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120 + 500 + 1200);
    scroller.scrollTop = 0;
    await vi.runOnlyPendingTimersAsync();

    expect(scroller.scrollTop).toBe(0);
  });
});

function getLiveEdgeMessageListener(): (message: { type?: string }) => false {
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No runtime message listener registered');
  return listener as (message: { type?: string }) => false;
}

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
