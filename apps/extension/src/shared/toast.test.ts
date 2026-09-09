import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearToast, showToast } from './toast';

describe('toast feedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.documentElement.querySelectorAll('.ytcq-toast').forEach((toast) => toast.remove());
  });

  afterEach(() => {
    clearToast();
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

  it('removes the toast after the timeout or when cleared explicitly', async () => {
    showToast('Timed message');

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
