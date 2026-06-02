import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import contact from '../shared/contact.json';

describe('popup', () => {
  beforeEach(async () => {
    vi.resetModules();
    document.body.innerHTML = `
      <a id="landingLink"></a>
      <a id="sourceCodeLink"></a>
      <a id="supportLink"></a>
      <button id="resetExtension"></button>
      <section data-extension-status>
        <span data-extension-status-text></span>
        <span data-extension-status-helper></span>
      </section>
      <select id="targetLanguage"></select>
      <select id="translationDisplay">
        <option value="replace">Replace</option>
        <option value="below">Below</option>
      </select>
      <input id="sound" type="checkbox">
      <input id="startupEffect" type="checkbox">
      <span id="version"></span>
    `;
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    vi.mocked(chrome.tabs.create).mockClear();
    vi.mocked(chrome.tabs.sendMessage).mockClear();
    vi.mocked(chrome.storage.local.clear).mockClear();
    vi.mocked(chrome.storage.local.get).mockClear();
    vi.mocked(chrome.storage.sync.clear).mockClear();
    vi.mocked(chrome.storage.sync.get).mockClear();
    vi.mocked(chrome.storage.sync.set).mockClear();
    vi.mocked(chrome.runtime.sendMessage).mockClear();
    installMatchMedia(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('summarizes active chat status across the current tab and other tabs', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      if (queryInfo.active) {
        const tabs = [{ id: 10 } as chrome.tabs.Tab];
        callback?.(tabs);
        return Promise.resolve(tabs);
      }

      const tabs = [
        { id: 10 } as chrome.tabs.Tab,
        { id: 20 } as chrome.tabs.Tab,
        { id: 30 } as chrome.tabs.Tab
      ];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [10, 20] });
      return Promise.resolve({ activeTabIds: [10, 20] });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('active');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveCurrentAndOne');
    expect(document.querySelector('[data-extension-status-helper]')?.textContent).toBe('extensionStatusActiveHelper');
  });

  it('uses disconnected known-chat copy when no active content scripts respond', async () => {
    await chrome.storage.local.set({
      ytcqKnownChatTabs: {
        10: Date.now()
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      if (queryInfo.active) {
        const tabs = [{ id: 10 } as chrome.tabs.Tab];
        callback?.(tabs);
        return Promise.resolve(tabs);
      }

      const tabs = [{ id: 10 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusInactiveAll');
    expect(document.querySelector('[data-extension-status-helper]')?.textContent).toBe('extensionStatusInactiveDisconnectedHelperOne');
  });

  it('summarizes active chats in other tabs and handles no open tabs', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: 20 } as chrome.tabs.Tab, { id: 30 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [20, 30, 999] });
      return Promise.resolve({ activeTabIds: [20, 30, 999] });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveManyOther:2');

    vi.resetModules();
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [] : [];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusInactiveAll');
    expect(document.querySelector('[data-extension-status-helper]')?.textContent).toBe('extensionStatusInactiveHelper');
  });

  it('summarizes current-tab-only and current-tab-with-many active status states', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: 20 } as chrome.tabs.Tab, { id: 30 } as chrome.tabs.Tab, { id: 40 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [10] });
      return Promise.resolve({ activeTabIds: [10] });
    }) as never);

    await import('./index');
    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveCurrent');

    vi.resetModules();
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [10, 20, 30] });
      return Promise.resolve({ activeTabIds: [10, 20, 30] });
    }) as never);
    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveCurrentAndMany:2');
  });

  it('summarizes a single active chat in another tab', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: 20 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [20] });
      return Promise.resolve({ activeTabIds: [20] });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status-text]')?.textContent).toBe('extensionStatusActiveOneOther');
  });

  it('uses the many-disconnected known-chat helper when multiple open chats are stale', async () => {
    await chrome.storage.local.set({
      ytcqKnownChatTabs: {
        10: Date.now(),
        20: Date.now()
      }
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: 20 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status-helper]')?.textContent).toBe('extensionStatusInactiveDisconnectedHelperMany');
  });

  it('ignores malformed active chat responses', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [{ id: 10 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: ['10', null, 999] });
      return Promise.resolve({ activeTabIds: ['10', null, 999] });
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
  });

  it('treats active chat lookup errors as inactive instead of showing active status', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [{ id: 10 } as chrome.tabs.Tab] : [{ id: 10 } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: { message: 'background unavailable' }
      });
      callback?.({ activeTabIds: [10] });
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: undefined
      });
      return Promise.resolve();
    }) as never);

    await import('./index');

    expect(document.querySelector('[data-extension-status]')?.getAttribute('data-extension-status')).toBe('inactive');
  });

  it('explains support before opening the support page', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await import('./index');
    document.querySelector<HTMLAnchorElement>('#supportLink')?.click();

    expect(window.confirm).toHaveBeenCalledWith(`supportIssueTrackerPrompt:${contact.supportEmail}`);
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.chatenhancer.com/support' });
  });

  it('does not open support or reset state when confirmation is canceled', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await import('./index');
    document.querySelector<HTMLAnchorElement>('#supportLink')?.click();
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.storage.local.clear).not.toHaveBeenCalled();
    expect(chrome.storage.sync.clear).not.toHaveBeenCalled();
  });

  it('opens landing and source links from the popup', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    document.querySelector<HTMLAnchorElement>('#landingLink')?.click();
    document.querySelector<HTMLAnchorElement>('#sourceCodeLink')?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://chatenhancer.com' });
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.chatenhancer.com/source' });
  });

  it('localizes text, titles, aria labels, and browser UI language', async () => {
    document.body.innerHTML += `
      <span data-i18n="translation"></span>
      <button data-i18n-title="openChannel"></button>
      <button data-i18n-aria-label="close"></button>
    `;
    vi.mocked(chrome.i18n.getUILanguage).mockReturnValue('es-ES');
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(document.documentElement.lang).toBe('es-ES');
    expect(document.querySelector('[data-i18n="translation"]')?.textContent).toBe('translation');
    expect(document.querySelector('[data-i18n-title="openChannel"]')?.getAttribute('title')).toBe('openChannel');
    expect(document.querySelector('[data-i18n-aria-label="close"]')?.getAttribute('aria-label')).toBe('close');
  });

  it('updates option controls and animates enabled option icons', async () => {
    vi.useFakeTimers();
    document.body.innerHTML += `
      <svg class="translation-target-icon"></svg>
      <svg class="translation-display-icon"></svg>
      <svg class="sound-icon"></svg>
      <svg class="startup-effect-icon"></svg>
    `;
    await chrome.storage.sync.set({
      lastTranslationTarget: 'ko',
      sound: false,
      startupEffect: true,
      targetLanguage: 'ja',
      translationDisplay: 'below'
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const targetLanguage = document.querySelector<HTMLSelectElement>('#targetLanguage')!;
    const translationDisplay = document.querySelector<HTMLSelectElement>('#translationDisplay')!;
    const sound = document.querySelector<HTMLInputElement>('#sound')!;
    const startupEffect = document.querySelector<HTMLInputElement>('#startupEffect')!;

    expect(targetLanguage.value).toBe('ja');
    expect(translationDisplay.value).toBe('below');
    expect(sound.checked).toBe(false);
    expect(startupEffect.checked).toBe(true);

    targetLanguage.value = '';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
    expect(chrome.storage.sync.set).toHaveBeenLastCalledWith(expect.objectContaining({
      lastTranslationTarget: 'ko',
      targetLanguage: ''
    }));

    targetLanguage.value = 'fr';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
    translationDisplay.value = 'replace';
    translationDisplay.dispatchEvent(new Event('change', { bubbles: true }));
    sound.checked = true;
    sound.dispatchEvent(new Event('change', { bubbles: true }));
    startupEffect.checked = true;
    startupEffect.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector('.translation-target-icon')?.classList.contains('ytcq-translation-pulse')).toBe(true);
    expect(document.querySelector('.translation-display-icon')?.classList.contains('ytcq-display-reflow')).toBe(true);
    expect(document.querySelector('.sound-icon')?.classList.contains('ytcq-bell-ringing')).toBe(true);
    expect(document.querySelector('.startup-effect-icon')?.classList.contains('ytcq-sparkle-burst')).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(document.querySelector('.startup-effect-icon')?.classList.contains('ytcq-sparkle-burst')).toBe(false);
  });

  it('does not animate icons and disables startup effect when reduced motion is preferred', async () => {
    installMatchMedia(true);
    document.body.innerHTML += '<svg class="translation-target-icon"></svg>';
    await chrome.storage.sync.set({
      startupEffect: true
    });
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');
    const targetLanguage = document.querySelector<HTMLSelectElement>('#targetLanguage')!;
    targetLanguage.value = 'ja';
    targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));

    expect(document.querySelector<HTMLInputElement>('#startupEffect')?.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#startupEffect')?.checked).toBe(false);
    expect(document.querySelector('.translation-target-icon')?.classList.contains('ytcq-translation-pulse')).toBe(false);
  });

  it('resets extension storage, updates controls, broadcasts page reset, and alerts completion', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active
        ? [{ id: 10 } as chrome.tabs.Tab]
        : [{ id: 10 } as chrome.tabs.Tab, { id: undefined } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({ activeTabIds: [] });
      return Promise.resolve({ activeTabIds: [] });
    }) as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await import('./index');
    document.querySelector<HTMLSelectElement>('#targetLanguage')!.value = 'ja';
    document.querySelector<HTMLInputElement>('#sound')!.checked = false;
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(chrome.storage.sync.clear).toHaveBeenCalled();
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      sound: true,
      targetLanguage: ''
    }), expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(10, { type: 'ytcq:reset-page' }, expect.any(Function));
    expect(window.alert).toHaveBeenCalledWith('popupResetComplete');
    expect(document.querySelector<HTMLInputElement>('#sound')?.checked).toBe(true);
    expect(document.querySelector<HTMLSelectElement>('#targetLanguage')?.value).toBe('');
  });

  it('completes reset immediately when there are no tab ids to notify', async () => {
    vi.mocked(chrome.tabs.query).mockImplementation(((queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      const tabs = queryInfo.active ? [] : [{ id: undefined } as chrome.tabs.Tab];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as never);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    await import('./index');
    document.querySelector<HTMLButtonElement>('#resetExtension')?.click();

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('popupResetComplete');
  });

  it('skips popup wiring when required controls are missing', async () => {
    document.body.innerHTML = '<section data-extension-status></section>';
    vi.mocked(chrome.tabs.query).mockImplementation(((_queryInfo: chrome.tabs.QueryInfo, callback?: (tabs: chrome.tabs.Tab[]) => void) => {
      callback?.([]);
      return Promise.resolve([]);
    }) as never);

    await import('./index');

    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
  });
});

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn()
    }))
  });
}
