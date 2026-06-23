import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearChatTab,
  getActiveChatTabIds,
  markChatTabActive,
  markChatTabInactive
} from './chat-tab-state';

describe('background chat tab state', () => {
  beforeEach(async () => {
    getActiveChatTabIds().forEach(clearChatTab);
    vi.mocked(chrome.action.setIcon).mockClear();
    vi.mocked(chrome.action.setTitle).mockClear();
  });

  it('marks chat tabs active and updates the tab action', async () => {
    markChatTabActive(42);

    expect(getActiveChatTabIds()).toEqual([42]);
    expect(chrome.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ 16: 'icons/icon-16.png' }),
        tabId: 42
      }),
      expect.any(Function)
    );
    expect(chrome.action.setTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        tabId: 42,
        title: 'extensionActiveTitle'
      }),
      expect.any(Function)
    );
  });

  it('mirrors action status to the global browser action for Safari MV2', async () => {
    const runtimeChrome = chrome as unknown as {
      action?: unknown;
      browserAction?: unknown;
    };
    const originalAction = runtimeChrome.action;
    const browserAction = {
      getTitle: vi.fn(),
      setIcon: vi.fn((_details: unknown, callback?: () => void) => {
        callback?.();
      }),
      setTitle: vi.fn((_details: unknown, callback?: () => void) => {
        callback?.();
      })
    };

    runtimeChrome.action = undefined;
    runtimeChrome.browserAction = browserAction;

    try {
      markChatTabActive(42);

      expect(browserAction.setIcon).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.objectContaining({ 16: 'icons/icon-16.png' }),
          tabId: 42
        }),
        expect.any(Function)
      );
      expect(browserAction.setIcon).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.objectContaining({ 16: 'icons/icon-16.png' })
        }),
        expect.any(Function)
      );
      expect(browserAction.setTitle).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'extensionActiveTitle'
        }),
        expect.any(Function)
      );
    } finally {
      clearChatTab(42);
      runtimeChrome.action = originalAction;
      delete runtimeChrome.browserAction;
    }
  });

  it('marks chat tabs inactive and restores the gray tab action', async () => {
    markChatTabActive(42);
    markChatTabInactive(42);

    expect(getActiveChatTabIds()).toEqual([]);
    expect(chrome.action.setIcon).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ 16: 'icons/icon-inactive-16.png' }),
        tabId: 42
      }),
      expect.any(Function)
    );
    expect(chrome.action.setTitle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tabId: 42,
        title: 'extensionName'
      }),
      expect.any(Function)
    );
  });

  it('clears active state and restores the gray tab action', async () => {
    markChatTabActive(42);

    clearChatTab(42);

    expect(getActiveChatTabIds()).toEqual([]);
    expect(chrome.action.setIcon).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ 16: 'icons/icon-inactive-16.png' }),
        tabId: 42
      }),
      expect.any(Function)
    );
  });
});
