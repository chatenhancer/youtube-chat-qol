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

  it('still clears the title if YouTube removes alert favicon links first', async () => {
    const { clearInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    setVisibilityState('hidden');

    showInboxTabAlert(1);
    document.querySelectorAll('.ytcq-tab-alert-favicon').forEach((link) => link.remove());

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
