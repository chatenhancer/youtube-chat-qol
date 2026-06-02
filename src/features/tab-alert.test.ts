import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('tab alert', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.replaceChildren();
    document.body.replaceChildren();
    document.title = 'Live Stream';
    setVisibilityState('visible');
  });

  it('prefixes the title and swaps favicon links while the tab is inactive', async () => {
    const { clearInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    addFavicon('/favicon.ico');
    setVisibilityState('hidden');

    showInboxTabAlert(5);

    expect(document.title).toBe('(5) Live Stream');
    expect(document.querySelectorAll('.ytcq-tab-alert-favicon')).toHaveLength(4);
    expect(document.querySelector('link[href="/favicon.ico"]')).toBeNull();

    clearInboxTabAlert();

    expect(document.title).toBe('Live Stream');
    expect(document.querySelectorAll('.ytcq-tab-alert-favicon')).toHaveLength(0);
    expect(document.querySelector('link[href="/favicon.ico"]')).not.toBeNull();
  });

  it('falls back to the document element when no head exists for favicon writes', async () => {
    const { clearInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    const originalHead = document.head;
    Object.defineProperty(document, 'head', {
      configurable: true,
      value: null
    });
    setVisibilityState('hidden');

    showInboxTabAlert(2);

    expect(document.documentElement.querySelectorAll('.ytcq-tab-alert-favicon')).toHaveLength(4);

    clearInboxTabAlert();
    Object.defineProperty(document, 'head', {
      configurable: true,
      value: originalHead
    });
  });

  it('does not show an alert while the current tab is active', async () => {
    const { showInboxTabAlert } = await import('./tab-alert');

    showInboxTabAlert(150);

    expect(document.title).toBe('Live Stream');
    expect(document.querySelectorAll('.ytcq-tab-alert-favicon')).toHaveLength(0);
  });

  it('clears an inactive alert when visibility changes back to active', async () => {
    const { initInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    setVisibilityState('hidden');
    initInboxTabAlert();

    showInboxTabAlert(150);
    expect(document.title).toBe('(99+) Live Stream');

    setVisibilityState('visible');
    document.dispatchEvent(new Event('visibilitychange'));

    expect(document.title).toBe('Live Stream');
    expect(document.documentElement.dataset.ytcqTabAlertActive).toBeUndefined();
  });

  it('clears alerts from focus, pointer, and keyboard activity after init', async () => {
    const { initInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    initInboxTabAlert();
    initInboxTabAlert();
    setVisibilityState('hidden');
    showInboxTabAlert(0);
    expect(document.title).toBe('(1) Live Stream');

    setVisibilityState('visible');
    window.dispatchEvent(new Event('focus'));
    expect(document.title).toBe('Live Stream');

    setVisibilityState('hidden');
    showInboxTabAlert(2);
    setVisibilityState('visible');
    document.dispatchEvent(new PointerEvent('pointerdown'));
    expect(document.title).toBe('Live Stream');

    setVisibilityState('hidden');
    showInboxTabAlert(3);
    setVisibilityState('visible');
    document.dispatchEvent(new KeyboardEvent('keydown'));
    expect(document.title).toBe('Live Stream');
  });

  it('strips an existing alert prefix before applying a new one', async () => {
    const { showInboxTabAlert } = await import('./tab-alert');
    setVisibilityState('hidden');
    document.title = '(12) Live Stream';

    showInboxTabAlert(7);

    expect(document.title).toBe('(7) Live Stream');
  });

  it('clears dataset-only alert state without favicon links', async () => {
    const { clearInboxTabAlert } = await import('./tab-alert');
    document.title = '(4) Live Stream';
    document.documentElement.dataset.ytcqTabAlertActive = 'true';

    clearInboxTabAlert();

    expect(document.title).toBe('Live Stream');
    expect(document.documentElement.dataset.ytcqTabAlertActive).toBeUndefined();
  });

  it('still clears the title if YouTube removes alert favicon links first', async () => {
    const { clearInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    setVisibilityState('hidden');

    showInboxTabAlert(1);
    document.querySelectorAll('.ytcq-tab-alert-favicon').forEach((link) => link.remove());

    expect(() => clearInboxTabAlert()).not.toThrow();
    expect(document.title).toBe('Live Stream');
  });

  it('handles clearing when no alert was active', async () => {
    const { clearInboxTabAlert } = await import('./tab-alert');

    expect(() => clearInboxTabAlert()).not.toThrow();
    expect(document.title).toBe('Live Stream');
  });
});

function addFavicon(href: string): void {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = href;
  document.head.append(link);
}

function setVisibilityState(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value
  });
}
