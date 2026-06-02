import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('background active chat keepalive', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('tracks connected active chat ports by tab', async () => {
    await import('./active-chat-keepalive');
    const port = createPort({ name: 'ytcq:active-chat', tabId: 41 });

    getConnectListener()(port);
    expect((await import('./chat-tab-state')).getActiveChatTabIds()).toEqual([41]);

    port.disconnect();
    expect((await import('./chat-tab-state')).getActiveChatTabIds()).toEqual([]);
    expect(port.onMessage.removeListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it('keeps a tab active until all same-tab keepalive ports disconnect', async () => {
    await import('./active-chat-keepalive');
    const chatTabState = await import('./chat-tab-state');
    const firstPort = createPort({ name: 'ytcq:active-chat', tabId: 41 });
    const secondPort = createPort({ name: 'ytcq:active-chat', tabId: 41 });

    getConnectListener()(firstPort);
    getConnectListener()(secondPort);
    firstPort.disconnect();

    expect(chatTabState.getActiveChatTabIds()).toEqual([41]);

    secondPort.disconnect();
    expect(chatTabState.getActiveChatTabIds()).toEqual([]);
  });

  it('accepts active chat ping messages without changing tab state', async () => {
    await import('./active-chat-keepalive');
    const chatTabState = await import('./chat-tab-state');
    const port = createPort({ name: 'ytcq:active-chat', tabId: 41 });

    getConnectListener()(port);
    const messageListener = vi.mocked(port.onMessage.addListener).mock.calls[0]?.[0] as (message: unknown) => void;
    messageListener({ type: 'ytcq:active-chat-ping' });
    messageListener({ type: 'other' });
    messageListener(undefined);

    expect(chatTabState.getActiveChatTabIds()).toEqual([41]);
  });

  it('ignores unrelated ports and ports without a tab id', async () => {
    await import('./active-chat-keepalive');
    const chatTabState = await import('./chat-tab-state');

    getConnectListener()(createPort({ name: 'other-port', tabId: 41 }));
    getConnectListener()(createPort({ name: 'ytcq:active-chat' }));

    expect(chatTabState.getActiveChatTabIds()).toEqual([]);
  });
});

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
  tabId?: number;
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
    sender: tabId === undefined ? {} : { tab: { id: tabId } },
    disconnect: () => {
      disconnectListeners.forEach((listener) => listener());
    }
  };
  return port as unknown as chrome.runtime.Port & { disconnect: () => void };
}
