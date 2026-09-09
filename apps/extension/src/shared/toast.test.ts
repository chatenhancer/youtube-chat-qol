import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToast, showToast } from './toast';

describe('toast feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.querySelectorAll('.ytcq-toast').forEach((toast) => toast.remove());
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 160, 32));
  });

  afterEach(() => {
    clearToast();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('creates one managed toast and updates its message', () => {
    showToast('First message');
    showToast('Second message');

    const toasts = document.querySelectorAll<HTMLElement>('.ytcq-toast');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toBe('Second message');
    expect(toasts[0].dataset.ytcqManaged).toBe('true');
    expect(toasts[0].dataset.tone).toBe('default');
    expect(toasts[0].getAttribute('role')).toBe('status');
    expect(toasts[0].getAttribute('aria-live')).toBe('polite');
  });

  it('keeps a contextual confirmation beside the exact click while the pointer moves', () => {
    showToast('Saved to Bookmarks.', { anchor: { x: 80, y: 60 } });
    const toast = document.querySelector<HTMLElement>('.ytcq-toast')!;
    expect(toast.style.left).toBe('96px');
    expect(toast.style.top).toBe('76px');

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 240, clientY: 180 }));
    expect(toast.style.left).toBe('96px');
    expect(toast.style.top).toBe('76px');
  });

  it.each([
    { width: 160, anchor: { x: 352, y: 232 }, left: 176, top: 184 },
    { width: 320, anchor: { x: 160, y: 60 }, left: 12, top: 76 },
    { width: 160, anchor: { x: 0, y: 0 }, left: 16, top: 16 }
  ])('keeps a $width px contextual toast inside chat at $anchor', ({ width, anchor, left, top }) => {
    vi.stubGlobal('innerWidth', 360);
    vi.stubGlobal('innerHeight', 240);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, width, 32));

    showToast('Saved to Bookmarks.', { anchor });

    const toast = document.querySelector<HTMLElement>('.ytcq-toast')!;
    expect(toast.style.left).toBe(`${left}px`);
    expect(toast.style.top).toBe(`${top}px`);
  });

  it('restores default placement when a general notice replaces a contextual confirmation', () => {
    showToast('Saved to Bookmarks.', { anchor: { x: 80, y: 60 } });
    const toast = document.querySelector<HTMLElement>('.ytcq-toast')!;
    expect(toast.classList.contains('ytcq-toast-anchored')).toBe(true);

    showToast('Translation is temporarily unavailable. Please try again later.', { tone: 'error' });

    expect(document.querySelector('.ytcq-toast')).toBe(toast);
    expect(toast.classList.contains('ytcq-toast-anchored')).toBe(false);
    expect(toast.style.left).toBe('');
    expect(toast.style.top).toBe('');
    expect(toast.getAttribute('role')).toBe('alert');
  });

  it('removes the toast after the timeout or when cleared explicitly', async () => {
    showToast('Timed message', { anchor: { x: 80, y: 60 } });

    await vi.advanceTimersByTimeAsync(2400);
    expect(document.querySelector('.ytcq-toast')).toBeNull();

    showToast('Clear me');
    clearToast();
    expect(document.querySelector('.ytcq-toast')).toBeNull();
  });

  it('owns custom error-toast presentation and expiry', async () => {
    showToast('Action rejected.', { durationMs: 5_000, tone: 'error' });

    const toast = document.querySelector<HTMLElement>('.ytcq-toast');
    expect(toast?.dataset.tone).toBe('error');
    expect(toast?.getAttribute('role')).toBe('alert');
    expect(toast?.getAttribute('aria-live')).toBe('assertive');

    await vi.advanceTimersByTimeAsync(4_999);
    expect(document.querySelector('.ytcq-toast')).toBe(toast);

    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.ytcq-toast')).toBeNull();
  });
});
