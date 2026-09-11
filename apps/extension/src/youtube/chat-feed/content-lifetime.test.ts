import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_INSTANCE_ATTRIBUTE, CONTENT_INSTANCE_CLAIM_EVENT } from '../../shared/content-instance';
import { watchContentStylesheet } from './content-lifetime';

const draft = vi.hoisted(() => ({ saveReconnectDraft: vi.fn() }));
vi.mock('../reconnect-draft', () => draft);

describe('content stylesheet lifetime', () => {
  let resize: () => void;
  let styled: boolean;
  let cleanup: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    styled = false;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe(): void {}
      disconnect(): void {}
    });
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => (
      { height: styled ? '1px' : '0px' } as CSSStyleDeclaration
    ));
    document.documentElement.setAttribute(CONTENT_INSTANCE_ATTRIBUTE, 'current');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    cleanup = watchContentStylesheet();
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute(CONTENT_INSTANCE_ATTRIBUTE);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('waits for the initial stylesheet before treating its absence as removal', async () => {
    resize();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(draft.saveReconnectDraft).not.toHaveBeenCalled();
  });

  it('preserves the draft and restores chat when CSS disappears without a content-script callback', async () => {
    styled = true;
    resize();
    styled = false;
    resize();
    await vi.advanceTimersByTimeAsync(249);
    expect(draft.saveReconnectDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(draft.saveReconnectDraft).toHaveBeenCalledOnce();
    expect(document.getElementById('ytcq-content-lifetime')).toBeNull();
  });

  it('keeps the chat document when an extension reload restores CSS during the grace period', async () => {
    styled = true;
    resize();
    styled = false;
    resize();
    await vi.advanceTimersByTimeAsync(100);
    styled = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(draft.saveReconnectDraft).not.toHaveBeenCalled();
    expect(document.getElementById('ytcq-content-lifetime')).not.toBeNull();
  });

  it('defers hidden chat recovery until the user returns', async () => {
    styled = true;
    resize();
    styled = false;
    resize();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await vi.advanceTimersByTimeAsync(500);
    expect(draft.saveReconnectDraft).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(250);
    expect(draft.saveReconnectDraft).toHaveBeenCalledOnce();
  });

  it('cancels an older page adapter’s pending restoration when it is replaced', async () => {
    styled = true;
    resize();
    styled = false;
    resize();
    cleanup();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(draft.saveReconnectDraft).not.toHaveBeenCalled();
  });

  it('also protects a chat attached and disabled before its first visible render', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    styled = true;
    document.dispatchEvent(new Event(CONTENT_INSTANCE_CLAIM_EVENT));
    styled = false;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(250);
    expect(draft.saveReconnectDraft).toHaveBeenCalledOnce();
  });
});
