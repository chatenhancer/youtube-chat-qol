import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('background action status wiring', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('clears active state when the tab reloads or closes', async () => {
    await import('./action-status');
    const chatTabState = await import('./chat-tab-state');
    chatTabState.markChatTabActive(23);
    const updatedListener = getTabUpdatedListener();
    const removedListener = getTabRemovedListener();

    updatedListener(23, { status: 'complete' }, {} as chrome.tabs.Tab);
    expect(chatTabState.getActiveChatTabIds()).toEqual([23]);

    updatedListener(23, { status: 'loading' }, {} as chrome.tabs.Tab);
    expect(chatTabState.getActiveChatTabIds()).toEqual([]);

    chatTabState.markChatTabActive(23);
    removedListener(23, { isWindowClosing: false, windowId: 1 });
    expect(chatTabState.getActiveChatTabIds()).toEqual([]);
  });

  it('keeps active state during tab loading while a chat keepalive port is connected', async () => {
    await import('./action-status');
    const chatTabState = await import('./chat-tab-state');
    const updatedListener = getTabUpdatedListener();
    const port = createPort({ name: 'ytcq:active-chat', tabId: 23 });

    getConnectListener()(port);
    updatedListener(23, { status: 'loading' }, {} as chrome.tabs.Tab);

    expect(chatTabState.getActiveChatTabIds()).toEqual([23]);

    port.disconnect();
    expect(chatTabState.getActiveChatTabIds()).toEqual([]);
  });
});

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
