import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';

describe('background action status wiring', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    await chrome.storage.local.clear();
  });

  it('marks a tab active when content reports that chat attached', async () => {
    await import('./action-status');
    const messageListener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    expect(messageListener({ type: 'ytcq:chat-attached' }, { tab: { id: 17 } as chrome.tabs.Tab }, vi.fn())).toBe(false);
    expect(messageListener({ type: 'ytcq:get-active-chat-tabs' }, {}, sendResponse)).toBe(false);

    expect(sendResponse).toHaveBeenCalledWith({ activeTabIds: [17] });
    expect(chrome.action.setIcon).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.objectContaining({ '16': 'icons/icon-16.png' }),
        tabId: 17
      }),
      expect.any(Function)
    );
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [KNOWN_CHAT_TABS_STORAGE_KEY]: { '17': expect.any(Number) }
    });
  });

  it('ignores unrelated messages and attached messages without a numeric tab id', async () => {
    await import('./action-status');
    const messageListener = getRuntimeMessageListener();

    expect(messageListener(undefined, {}, vi.fn())).toBe(false);
    expect(messageListener({ type: 'other' }, {}, vi.fn())).toBe(false);
    expect(messageListener({ type: 'ytcq:chat-attached' }, { tab: {} as chrome.tabs.Tab }, vi.fn())).toBe(false);
    expect(messageListener({ type: 'ytcq:chat-attached' }, { tab: { id: undefined } as chrome.tabs.Tab }, vi.fn())).toBe(false);

    expect(chrome.action.setIcon).not.toHaveBeenCalled();
  });

  it('clears active state when the tab reloads or closes', async () => {
    await import('./action-status');
    getRuntimeMessageListener()({ type: 'ytcq:chat-attached' }, { tab: { id: 23 } as chrome.tabs.Tab }, vi.fn());
    const updatedListener = getTabUpdatedListener();
    const removedListener = getTabRemovedListener();

    updatedListener(23, { status: 'complete' }, {} as chrome.tabs.Tab);
    let sendResponse = vi.fn();
    getRuntimeMessageListener()({ type: 'ytcq:get-active-chat-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ activeTabIds: [23] });

    updatedListener(23, { status: 'loading' }, {} as chrome.tabs.Tab);
    sendResponse = vi.fn();
    getRuntimeMessageListener()({ type: 'ytcq:get-active-chat-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ activeTabIds: [] });

    getRuntimeMessageListener()({ type: 'ytcq:chat-attached' }, { tab: { id: 23 } as chrome.tabs.Tab }, vi.fn());
    removedListener(23, { isWindowClosing: false, windowId: 1 });
    sendResponse = vi.fn();
    getRuntimeMessageListener()({ type: 'ytcq:get-active-chat-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ activeTabIds: [] });
  });
});

function getRuntimeMessageListener(): (
  message: unknown,
  sender: Partial<chrome.runtime.MessageSender>,
  sendResponse: (response?: unknown) => void
) => boolean {
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No runtime message listener registered');
  return listener as (
    message: unknown,
    sender: Partial<chrome.runtime.MessageSender>,
    sendResponse: (response?: unknown) => void
  ) => boolean;
}

function getTabUpdatedListener(): (
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) => void {
  const listener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No tab updated listener registered');
  return listener as (
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ) => void;
}

function getTabRemovedListener(): (
  tabId: number,
  removeInfo: chrome.tabs.TabRemoveInfo
) => void {
  const listener = vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No tab removed listener registered');
  return listener as (
    tabId: number,
    removeInfo: chrome.tabs.TabRemoveInfo
  ) => void;
}
