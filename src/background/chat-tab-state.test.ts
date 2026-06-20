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
