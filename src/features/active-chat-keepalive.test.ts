import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const chatInputMocks = vi.hoisted(() => ({
  input: null as HTMLElement | null,
  text: '',
  findChatInput: vi.fn(() => chatInputMocks.input),
  getChatInputText: vi.fn(() => chatInputMocks.text),
  replaceChatInput: vi.fn((text: string) => {
    chatInputMocks.text = text;
    return true;
  })
}));

const enhancedEffectMocks = vi.hoisted(() => ({
  hideEnhancedEffect: vi.fn()
}));

vi.mock('../youtube/chat-input', () => chatInputMocks);
vi.mock('./enhanced-effect', () => enhancedEffectMocks);

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
    window.sessionStorage.clear();
    chatInputMocks.input = null;
    chatInputMocks.text = '';
    vi.clearAllMocks();
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

  it('does not open duplicate active chat ports when started repeatedly', async () => {
    const connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    chrome.runtime.connect = connect;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    startActiveChatKeepAlive();

    expect(connect).toHaveBeenCalledOnce();
  });

  it('reloads chat when reconnecting fails after a disconnect', async () => {
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
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
    expect(enhancedEffectMocks.hideEnhancedEffect).toHaveBeenCalled();
  });

  it('cleans stale reconnect anchors left by older content script instances', async () => {
    const anchor = document.createElement('div');
    anchor.className = 'ytcq-reconnect-anchor';
    document.body.append(anchor);
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    const { cleanupStaleReconnectNotice, startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    cleanupStaleReconnectNotice();

    expect(document.querySelector('.ytcq-reconnect-anchor')).toBeNull();
  });

  it('stops the active chat port during stale cleanup without reconnecting', async () => {
    const port = createMockPort();
    const connect = vi.fn(() => port as unknown as chrome.runtime.Port);
    chrome.runtime.connect = connect;
    const { cleanupActiveChatKeepAlive, startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    cleanupActiveChatKeepAlive();
    await vi.advanceTimersByTimeAsync(250);

    expect(connect).toHaveBeenCalledOnce();
    expect(port.postMessage).toHaveBeenCalledOnce();
  });

  it('does not start another reconnect timer while one is pending', async () => {
    const firstPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    chrome.runtime.connect = connect;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    firstPort.disconnect();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(250);

    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('ignores visibility changes when no reconnect is pending', async () => {
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    const { handleFeatureVisibilityChanged } = await import('../content/lifecycle');
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    handleFeatureVisibilityChanged('visible');
    await vi.advanceTimersByTimeAsync(250);

    expect(chrome.runtime.connect).toHaveBeenCalledOnce();
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
  });

  it('suspends feature UI before reloading disconnected chat', async () => {
    const staleFeatureUi = document.createElement('div');
    staleFeatureUi.className = 'ytcq-stale-feature-ui';
    document.body.append(staleFeatureUi);
    chatInputMocks.text = 'draft before reload';
    const firstPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    chrome.runtime.connect = connect;
    const lifecycle = await import('../content/lifecycle');
    const messageHook = vi.fn();
    lifecycle.registerFeatureLifecycle({
      page: {
        cleanupStale: () => staleFeatureUi.remove()
      },
      message: {
        enhance: messageHook
      }
    });
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(250);
    lifecycle.handleFeatureMessage(document.createElement('yt-live-chat-text-message-renderer'), { source: 'added' });

    expect(document.querySelector('.ytcq-stale-feature-ui')).toBeNull();
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
    expect(messageHook).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toContain('draft before reload');
  });

  it('hides the enhanced effect when the initial active chat connection fails', async () => {
    chrome.runtime.connect = vi.fn(() => {
      throw new Error('Extension context invalidated.');
    }) as never;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();

    expect(enhancedEffectMocks.hideEnhancedEffect).toHaveBeenCalled();
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
  });

  it('schedules reconnect when a keepalive ping throws', async () => {
    const port = createMockPort();
    port.postMessage.mockImplementationOnce(() => {
      throw new Error('disconnected');
    });
    chrome.runtime.connect = vi.fn(() => port as unknown as chrome.runtime.Port);
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    await vi.advanceTimersByTimeAsync(250);

    expect(chrome.runtime.connect).toHaveBeenCalledTimes(2);
  });

  it('waits until the tab is visible before showing a pending reconnect notice', async () => {
    setVisibilityState('hidden');
    const firstPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    chrome.runtime.connect = connect;
    const { handleFeatureVisibilityChanged } = await import('../content/lifecycle');
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(250);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
    expect(enhancedEffectMocks.hideEnhancedEffect).not.toHaveBeenCalled();

    setVisibilityState('visible');
    handleFeatureVisibilityChanged('visible');
    await vi.advanceTimersByTimeAsync(250);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
    expect(enhancedEffectMocks.hideEnhancedEffect).toHaveBeenCalled();
  });

  it('restores reconnect drafts for the same chat URL and removes mismatched drafts', async () => {
    const input = document.createElement('div');
    chatInputMocks.input = input;
    window.sessionStorage.setItem('ytcqReconnectDraft', JSON.stringify({
      text: 'saved draft',
      url: location.href
    }));
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    expect(chatInputMocks.replaceChatInput).toHaveBeenCalledWith('saved draft');
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();

    vi.resetModules();
    window.sessionStorage.setItem('ytcqReconnectDraft', JSON.stringify({
      text: 'other draft',
      url: 'https://example.com/other'
    }));
    const nextModule = await import('./active-chat-keepalive');
    nextModule.startActiveChatKeepAlive();

    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();
  });

  it('retries reconnect draft restore until the chat input appears', async () => {
    window.sessionStorage.setItem('ytcqReconnectDraft', JSON.stringify({
      text: 'late draft',
      url: location.href
    }));
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    expect(chatInputMocks.replaceChatInput).not.toHaveBeenCalled();

    chatInputMocks.input = document.createElement('div');
    await vi.advanceTimersByTimeAsync(300);

    expect(chatInputMocks.replaceChatInput).toHaveBeenCalledWith('late draft');
  });

  it('stops retrying reconnect draft restore after the capped attempts are exhausted', async () => {
    window.sessionStorage.setItem('ytcqReconnectDraft', JSON.stringify({
      text: 'busy draft',
      url: location.href
    }));
    chatInputMocks.input = document.createElement('div');
    chatInputMocks.text = 'existing draft';
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(chatInputMocks.replaceChatInput).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toContain('busy draft');
  });

  it('drops invalid reconnect drafts and cleans stale reconnect notices', async () => {
    window.sessionStorage.setItem('ytcqReconnectDraft', '{bad json');
    const anchor = document.createElement('div');
    anchor.className = 'ytcq-reconnect-anchor';
    document.body.append(anchor);
    const firstPort = createMockPort();
    chrome.runtime.connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    const { cleanupStaleReconnectNotice, startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(250);
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();

    cleanupStaleReconnectNotice();
    expect(document.querySelector('.ytcq-reconnect-anchor')).toBeNull();
  });

  it('ignores malformed reconnect draft shapes without throwing', async () => {
    window.sessionStorage.setItem('ytcqReconnectDraft', JSON.stringify({
      text: 123,
      url: null
    }));
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    expect(() => startActiveChatKeepAlive()).not.toThrow();
    expect(chatInputMocks.replaceChatInput).not.toHaveBeenCalled();
  });

  it('continues when session storage cannot be read during draft restore', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    expect(() => startActiveChatKeepAlive()).not.toThrow();
    expect(chatInputMocks.replaceChatInput).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
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
