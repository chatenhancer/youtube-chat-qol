import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('background chat tab state localization fallbacks', () => {
  beforeEach(async () => {
    vi.resetModules();
    await chrome.storage.local.clear();
    vi.mocked(chrome.action.setIcon).mockClear();
    vi.mocked(chrome.action.setTitle).mockClear();
  });

  afterEach(() => {
    vi.mocked(chrome.i18n.getMessage).mockReset();
    vi.mocked(chrome.i18n.getMessage).mockImplementation((key: string, substitutions?: string | string[]) => {
      const suffix = Array.isArray(substitutions) ? substitutions.join(',') : substitutions || '';
      return suffix ? `${key}:${suffix}` : key;
    });
  });

  it('uses built-in action titles when extension title messages are unavailable', async () => {
    vi.mocked(chrome.i18n.getMessage).mockReturnValue('');
    const {
      markChatTabActive,
      markChatTabInactive
    } = await import('./chat-tab-state');

    markChatTabActive(77);
    markChatTabInactive(77);

    expect(chrome.action.setTitle).toHaveBeenNthCalledWith(1, {
      tabId: 77,
      title: 'Chat Enhancer for YouTube is active in this tab'
    }, expect.any(Function));
    expect(chrome.action.setTitle).toHaveBeenNthCalledWith(2, {
      tabId: 77,
      title: 'Chat Enhancer for YouTube'
    }, expect.any(Function));
  });
});
