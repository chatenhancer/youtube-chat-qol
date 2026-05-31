import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockPort {
  disconnect: () => void;
  onDisconnect: {
    addListener: (listener: () => void) => void;
  };
  postMessage: ReturnType<typeof vi.fn>;
}

describe('active chat keepalive', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    document.body.replaceChildren();
    setVisibilityState('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    delete (chrome.runtime as Partial<typeof chrome.runtime>).connect;
  });

  it('reconnects silently when the active chat port disconnects but the extension context is still valid', async () => {
    const ports: MockPort[] = [];
    const connect = vi.fn(() => {
      const port = createMockPort();
      ports.push(port);
      return port as unknown as chrome.runtime.Port;
    });
    chrome.runtime.connect = connect;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    ports[0].disconnect();
    await vi.advanceTimersByTimeAsync(250);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
  });

  it('shows the refresh button when reconnecting fails after a disconnect', async () => {
    const firstPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementationOnce(() => {
        throw new Error('Extension context invalidated.');
      });
    chrome.runtime.connect = connect;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(250);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.ytcq-reconnect-button')).not.toBeNull();
  });
});

function createMockPort(): MockPort {
  const disconnectListeners: (() => void)[] = [];
  return {
    disconnect: () => {
      disconnectListeners.forEach((listener) => listener());
    },
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListeners.push(listener);
      })
    },
    postMessage: vi.fn()
  };
}

function setVisibilityState(value: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value
  });
}
