import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_INSTANCE_ATTRIBUTE, CONTENT_REATTACHMENT_ATTRIBUTE } from '../shared/content-instance';

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
    document.documentElement.removeAttribute(CONTENT_INSTANCE_ATTRIBUTE);
    document.documentElement.removeAttribute(CONTENT_REATTACHMENT_ATTRIBUTE);
    window.sessionStorage.clear();
    chatInputMocks.input = null;
    chatInputMocks.text = '';
    vi.clearAllMocks();
    setVisibilityState('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    document.documentElement.removeAttribute(CONTENT_INSTANCE_ATTRIBUTE);
    document.documentElement.removeAttribute(CONTENT_REATTACHMENT_ATTRIBUTE);
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

  it('allows reattachment time before preserving the draft and reloading disconnected chat', async () => {
    markReattachmentPending();
    chatInputMocks.text = 'draft while reconnecting';
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
    await vi.advanceTimersByTimeAsync(250);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();

    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toContain('draft while reconnecting');
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
    expect(enhancedEffectMocks.hideEnhancedEffect).toHaveBeenCalled();
  });

  it('cancels the pending reload when a replacement instance cleans up the old one', async () => {
    markReattachmentPending();
    chatInputMocks.text = 'draft preserved by attachment';
    const firstPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    chrome.runtime.connect = connect;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');
    const { cleanupFeatures, registerFeature } = await import('../content/dispatcher');
    const cleanup = vi.fn();
    registerFeature({ page: { cleanup } });

    startActiveChatKeepAlive();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(1_000);
    cleanupFeatures();
    cleanup.mockClear();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(cleanup).not.toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();
  });

  it('retries the connection before falling back to a chat reload', async () => {
    markReattachmentPending();
    chatInputMocks.text = 'draft preserved by reconnecting';
    const firstPort = createMockPort();
    const nextPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementationOnce(() => {
        throw new Error('Background unavailable.');
      })
      .mockReturnValue(nextPort as unknown as chrome.runtime.Port);
    chrome.runtime.connect = connect;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(5_250);

    expect(nextPort.postMessage).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();
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
    const { handleFeatureVisibilityChanged } = await import('../content/dispatcher');
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    handleFeatureVisibilityChanged('visible');
    await vi.advanceTimersByTimeAsync(250);

    expect(chrome.runtime.connect).toHaveBeenCalledOnce();
    expect(document.querySelector('.ytcq-reconnect-button')).toBeNull();
  });

  it('promptly removes disconnected UI when no replacement is attaching', async () => {
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
    const lifecycle = await import('../content/dispatcher');
    const messageHook = vi.fn();
    lifecycle.registerFeature({
      page: {
        cleanup: () => staleFeatureUi.remove()
      },
      message: messageHook
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

  it('waits until the tab is visible before trying to reconnect', async () => {
    setVisibilityState('hidden');
    const firstPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    chrome.runtime.connect = connect;
    const { handleFeatureVisibilityChanged } = await import('../content/dispatcher');
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

  it('does not reload if the tab becomes hidden while waiting for reattachment', async () => {
    markReattachmentPending();
    chatInputMocks.text = 'draft in a background tab';
    const firstPort = createMockPort();
    const connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    chrome.runtime.connect = connect;
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');
    const { handleFeatureVisibilityChanged } = await import('../content/dispatcher');

    startActiveChatKeepAlive();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(250);
    setVisibilityState('hidden');
    handleFeatureVisibilityChanged('hidden');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toBeNull();

    setVisibilityState('visible');
    handleFeatureVisibilityChanged('visible');
    await vi.advanceTimersByTimeAsync(5_250);
    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toContain('draft in a background tab');
  });

  it('does not delay disabling because of a handoff marker from an older instance', async () => {
    document.documentElement.setAttribute(CONTENT_INSTANCE_ATTRIBUTE, 'current');
    document.documentElement.setAttribute(CONTENT_REATTACHMENT_ATTRIBUTE, 'older');
    chatInputMocks.text = 'draft before disabling';
    const firstPort = createMockPort();
    chrome.runtime.connect = vi.fn()
      .mockReturnValueOnce(firstPort as unknown as chrome.runtime.Port)
      .mockImplementation(() => {
        throw new Error('Extension context invalidated.');
      });
    const { startActiveChatKeepAlive } = await import('./active-chat-keepalive');

    startActiveChatKeepAlive();
    firstPort.disconnect();
    await vi.advanceTimersByTimeAsync(250);

    expect(window.sessionStorage.getItem('ytcqReconnectDraft')).toContain('draft before disabling');
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

function markReattachmentPending(): void {
  document.documentElement.setAttribute(CONTENT_INSTANCE_ATTRIBUTE, 'previous');
  document.documentElement.setAttribute(CONTENT_REATTACHMENT_ATTRIBUTE, 'previous');
}

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
