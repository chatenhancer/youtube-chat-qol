import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearChatTab,
  getActiveChatStatus,
  getActiveChatTabIds,
  markChatTabActive,
  markChatTabInactive,
  refreshKnownChatActionStatuses
} from './chat-tab-state';
import { CHAT_STATUS_UPDATED_STORAGE_KEY } from '../shared/chat-status';
import { KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';

describe('background chat tab state', () => {
  beforeEach(async () => {
    getActiveChatTabIds().forEach(clearChatTab);
    await chrome.storage.local.clear();
    vi.mocked(chrome.action.setIcon).mockClear();
    vi.mocked(chrome.action.setTitle).mockClear();
  });

  it('marks chat tabs active and remembers them as recently known', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    markChatTabActive(42);

    expect(getActiveChatTabIds()).toEqual([42]);
    expect(chrome.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ 16: 'icons/icon-16.png' }),
        tabId: 42
      }),
      expect.any(Function)
    );
    await expect(chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY)).resolves.toEqual({
      [KNOWN_CHAT_TABS_STORAGE_KEY]: { 42: 1_000 }
    });
  });

  it('marks chat tabs inactive without forgetting that they recently hosted chat', async () => {
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
    expect(await chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY)).toHaveProperty(
      [KNOWN_CHAT_TABS_STORAGE_KEY]
    );
  });

  it('summarizes current-tab and other-tab active status', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    markChatTabActive(42);
    markChatTabActive(43);

    expect(getActiveChatStatus(42)).toEqual({
      currentActive: true,
      otherActiveCount: 1
    });
    expect(getActiveChatStatus(99)).toEqual({
      currentActive: false,
      otherActiveCount: 2
    });
    await expect(chrome.storage.local.get(CHAT_STATUS_UPDATED_STORAGE_KEY)).resolves.toEqual({
      [CHAT_STATUS_UPDATED_STORAGE_KEY]: 1_000
    });
  });

  it('clears active and known state when a tab is closed or reloads', async () => {
    markChatTabActive(42);

    clearChatTab(42);

    expect(getActiveChatTabIds()).toEqual([]);
    await expect(chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY)).resolves.toEqual({
      [KNOWN_CHAT_TABS_STORAGE_KEY]: {}
    });
  });

  it('does not rewrite storage when clearing an unknown tab', async () => {
    await chrome.storage.local.set({
      [KNOWN_CHAT_TABS_STORAGE_KEY]: { 42: Date.now() }
    });
    vi.mocked(chrome.storage.local.set).mockClear();

    clearChatTab(99);

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    await expect(chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY)).resolves.toEqual({
      [KNOWN_CHAT_TABS_STORAGE_KEY]: { 42: expect.any(Number) }
    });
  });

  it('refreshes known inactive tabs without overriding active tabs', async () => {
    await chrome.storage.local.set({
      [KNOWN_CHAT_TABS_STORAGE_KEY]: {
        42: Date.now(),
        43: Date.now()
      }
    });
    markChatTabActive(43);
    vi.mocked(chrome.action.setIcon).mockClear();

    refreshKnownChatActionStatuses();

    expect(chrome.action.setIcon).toHaveBeenCalledTimes(1);
    expect(chrome.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ 16: 'icons/icon-inactive-16.png' }),
        tabId: 42
      }),
      expect.any(Function)
    );
  });

  it('refreshes safely when known chat tab storage is missing or malformed', async () => {
    refreshKnownChatActionStatuses();
    await Promise.resolve();
    expect(chrome.action.setIcon).not.toHaveBeenCalled();

    await chrome.storage.local.set({
      [KNOWN_CHAT_TABS_STORAGE_KEY]: 'not records'
    });

    refreshKnownChatActionStatuses();
    await Promise.resolve();

    expect(chrome.action.setIcon).not.toHaveBeenCalled();
  });
});
