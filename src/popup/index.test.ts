import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    expect(window.confirm).toHaveBeenCalledWith('supportIssueTrackerPrompt');
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://www.chatenhancer.com/support' });
  });
});
