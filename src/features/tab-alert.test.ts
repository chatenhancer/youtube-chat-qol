import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalTopWindow = window.top;

describe('tab alert', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.replaceChildren();
    document.body.replaceChildren();
    document.title = 'Live Stream';
    setVisibilityState('visible');
  });

  afterEach(() => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: originalTopWindow
    });
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

  it('does not clear an alert from activity while the tab is still hidden', async () => {
    const { initInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    initInboxTabAlert();
    setVisibilityState('hidden');
    showInboxTabAlert(2);

    document.dispatchEvent(new PointerEvent('pointerdown'));

    expect(document.title).toBe('(2) Live Stream');
    expect(document.documentElement.dataset.ytcqTabAlertActive).toBe('true');
  });

  it('uses the top watch document when live chat runs inside a frame', async () => {
    const topDocument = document.implementation.createHTMLDocument('Top Stream');
    const topWindow = {
      addEventListener: vi.fn(),
      document: topDocument
    };
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: topWindow
    });
    setDocumentVisibilityState(topDocument, 'hidden');
    const { initInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');

    initInboxTabAlert();
    showInboxTabAlert(3);

    expect(topWindow.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function), expect.any(Object));
    expect(topDocument.title).toBe('(3) Top Stream');
    expect(topDocument.querySelectorAll('.ytcq-tab-alert-favicon')).toHaveLength(4);

    setDocumentVisibilityState(topDocument, 'visible');
    topDocument.dispatchEvent(new Event('visibilitychange'));

    expect(topDocument.title).toBe('Top Stream');
    expect(topDocument.documentElement.dataset.ytcqTabAlertActive).toBeUndefined();
  });

  it('treats the tab as active when the top watch document is visible', async () => {
    const topDocument = document.implementation.createHTMLDocument('Top Stream');
    Object.defineProperty(window, 'top', {
      configurable: true,
      value: {
        document: topDocument
      }
    });
    setVisibilityState('hidden');
    setDocumentVisibilityState(topDocument, 'visible');
    const { showInboxTabAlert } = await import('./tab-alert');

    showInboxTabAlert(3);

    expect(topDocument.title).toBe('Top Stream');
    expect(topDocument.querySelectorAll('.ytcq-tab-alert-favicon')).toHaveLength(0);
  });

  it('preserves the original favicon once across repeated alert updates', async () => {
    const { clearInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    addFavicon('/favicon.ico');
    setVisibilityState('hidden');

    showInboxTabAlert(1);
    showInboxTabAlert(2);
    clearInboxTabAlert();

    expect(document.querySelectorAll('link[href="/favicon.ico"]')).toHaveLength(1);
    expect(document.querySelectorAll('.ytcq-tab-alert-favicon')).toHaveLength(0);
  });

  it('cleans up tab activity listeners without clearing the active alert state', async () => {
    const { cleanupInboxTabAlertListeners, initInboxTabAlert, showInboxTabAlert } = await import('./tab-alert');
    initInboxTabAlert();
    setVisibilityState('hidden');
    showInboxTabAlert(2);

    cleanupInboxTabAlertListeners();

    expect(document.title).toBe('(2) Live Stream');
  });

  it('falls back safely when top-frame access changes while adding listeners', async () => {
    const topDocument = document.implementation.createHTMLDocument('Top Stream');
    let topAccessCount = 0;
    Object.defineProperty(window, 'top', {
      configurable: true,
      get: () => {
        topAccessCount += 1;
        if (topAccessCount === 1) return { document: topDocument };
        throw new Error('top window unavailable');
      }
    });
    const { initInboxTabAlert } = await import('./tab-alert');

    expect(() => initInboxTabAlert()).not.toThrow();
  });

  it('falls back to the current document when the top document is inaccessible', async () => {
    Object.defineProperty(window, 'top', {
      configurable: true,
      get: () => {
        throw new Error('top document unavailable');
      }
    });
    const { showInboxTabAlert } = await import('./tab-alert');
    setVisibilityState('hidden');

    showInboxTabAlert(4);

    expect(document.title).toBe('(4) Live Stream');
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
  setDocumentVisibilityState(document, value);
}

function setDocumentVisibilityState(targetDocument: Document, value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value
  });
  Object.defineProperty(targetDocument, 'visibilityState', {
    configurable: true,
    value
  });
}
