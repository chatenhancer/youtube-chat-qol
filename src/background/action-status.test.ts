import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';

describe('background action status wiring', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    await chrome.storage.local.clear();
  });

  it('returns active chat status for the current tab and other tabs', async () => {
    await import('./action-status');
    const chatTabState = await import('./chat-tab-state');
    const messageListener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    chatTabState.markChatTabActive(17);
    chatTabState.markChatTabActive(23);

    expect(messageListener({ type: 'ytcq:get-active-chat-status', currentTabId: 17 }, {}, sendResponse)).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({
      status: {
        currentActive: true,
        otherActiveCount: 1
      }
    });
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

  it('keeps the legacy active-tab list endpoint and ignores unrelated messages', async () => {
    await import('./action-status');
    const chatTabState = await import('./chat-tab-state');
    const messageListener = getRuntimeMessageListener();
    const sendResponse = vi.fn();

    expect(messageListener(undefined, {}, vi.fn())).toBe(false);
    expect(messageListener({ type: 'other' }, {}, vi.fn())).toBe(false);
    chatTabState.markChatTabActive(17);
    expect(messageListener({ type: 'ytcq:get-active-chat-tabs' }, {}, sendResponse)).toBe(false);

    expect(sendResponse).toHaveBeenCalledWith({ activeTabIds: [17] });
  });

  it('clears active state when the tab reloads or closes', async () => {
    await import('./action-status');
    const chatTabState = await import('./chat-tab-state');
    chatTabState.markChatTabActive(23);
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

    chatTabState.markChatTabActive(23);
    removedListener(23, { isWindowClosing: false, windowId: 1 });
    sendResponse = vi.fn();
    getRuntimeMessageListener()({ type: 'ytcq:get-active-chat-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ activeTabIds: [] });
  });

  it('keeps active state during tab loading while a chat keepalive port is connected', async () => {
    await import('./action-status');
    const updatedListener = getTabUpdatedListener();
    const sendResponse = vi.fn();
    const port = createPort({ name: 'ytcq:active-chat', tabId: 23 });

    getConnectListener()(port);
    updatedListener(23, { status: 'loading' }, {} as chrome.tabs.Tab);

    getRuntimeMessageListener()({ type: 'ytcq:get-active-chat-status', currentTabId: 23 }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({
      status: {
        currentActive: true,
        otherActiveCount: 0
      }
    });

    port.disconnect();
    const nextSendResponse = vi.fn();
    getRuntimeMessageListener()({ type: 'ytcq:get-active-chat-tabs' }, {}, nextSendResponse);
    expect(nextSendResponse).toHaveBeenCalledWith({ activeTabIds: [] });
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

function getConnectListener(): (port: chrome.runtime.Port) => void {
  const listener = vi.mocked(chrome.runtime.onConnect.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No runtime connect listener registered');
  return listener as (port: chrome.runtime.Port) => void;
}

function createPort({
  name,
  tabId
}: {
  name: string;
  tabId: number;
}): chrome.runtime.Port & {
  disconnect: () => void;
} {
  const disconnectListeners: (() => void)[] = [];
  const port = {
    name,
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListeners.push(listener);
      }),
      removeListener: vi.fn()
    },
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    postMessage: vi.fn(),
    sender: { tab: { id: tabId } },
    disconnect: () => {
      disconnectListeners.forEach((listener) => listener());
    }
  };
  return port as unknown as chrome.runtime.Port & { disconnect: () => void };
}
