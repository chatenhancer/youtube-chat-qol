import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECENT_STREAMS_STORAGE_KEY } from '../shared/recent-streams';

describe('background recent stream recorder', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    await chrome.storage.local.clear();
  });

  it('records stream visits using the outer tab URL and title first', async () => {
    await import('./recent-streams');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    expect(listener({
      sourceTitle: 'Chat frame title',
      sourceUrl: 'https://www.youtube.com/live_chat?continuation=chat-frame-token',
      type: 'ytcq:record-recent-stream'
    }, {
      tab: {
        title: '(2) Better stream title - YouTube',
        id: 17,
        url: 'https://www.youtube.com/watch?v=stream-a'
      } as chrome.tabs.Tab
    }, sendResponse)).toBe(false);

    expect(listener({ type: 'ytcq:get-open-recent-stream-tabs' }, {}, sendResponse)).toBe(false);
    expect(sendResponse).toHaveBeenLastCalledWith({
      openStreamTabs: {
        'video:stream-a': 17
      }
    });

    await vi.waitFor(async () => {
      await expect(chrome.storage.local.get(RECENT_STREAMS_STORAGE_KEY)).resolves.toEqual({
        [RECENT_STREAMS_STORAGE_KEY]: {
          'video:stream-a': expect.objectContaining({
            title: 'Better stream title',
            url: 'https://www.youtube.com/watch?v=stream-a',
            visitCount: 1
          })
        }
      });
    });
  });

  it('updates an existing stream record and ignores non-stream messages', async () => {
    await chrome.storage.local.set({
      [RECENT_STREAMS_STORAGE_KEY]: {
        'video:stream-a': {
          lastVisitedAt: 1_000,
          title: 'Old title',
          url: 'https://www.youtube.com/watch?v=stream-a',
          visitCount: 1
        }
      }
    });
    await import('./recent-streams');
    const listener = getMessageListener();

    expect(listener({ type: 'other' }, {}, vi.fn())).toBe(false);
    listener({
      sourceTitle: 'New title - YouTube',
      sourceUrl: 'https://www.youtube.com/live_chat?video_id=stream-a',
      type: 'ytcq:record-recent-stream'
    }, {}, vi.fn());
    listener({
      sourceTitle: 'No video id',
      sourceUrl: 'https://www.youtube.com/live_chat?continuation=token',
      type: 'ytcq:record-recent-stream'
    }, {}, vi.fn());

    await vi.waitFor(async () => {
      const stored = await chrome.storage.local.get(RECENT_STREAMS_STORAGE_KEY);
      expect(Object.keys(stored[RECENT_STREAMS_STORAGE_KEY] as Record<string, unknown>)).toEqual(['video:stream-a']);
      expect(stored[RECENT_STREAMS_STORAGE_KEY]).toEqual({
        'video:stream-a': expect.objectContaining({
          title: 'New title',
          url: 'https://www.youtube.com/watch?v=stream-a',
          visitCount: 2
        })
      });
    });
  });

  it('tracks attached stream tabs and clears them when tabs reload or close', async () => {
    await import('./recent-streams');
    const listener = getMessageListener();
    const sendResponse = vi.fn();

    listener({
      sourceUrl: 'https://www.youtube.com/live_chat?video_id=stream-a',
      type: 'ytcq:chat-attached'
    }, {
      tab: {
        id: 24
      } as chrome.tabs.Tab
    }, vi.fn());
    listener({
      sourceUrl: 'https://www.youtube.com/live_chat?video_id=stream-a',
      type: 'ytcq:chat-attached'
    }, {
      tab: {
        id: 25
      } as chrome.tabs.Tab
    }, vi.fn());

    listener({ type: 'ytcq:get-open-recent-stream-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenLastCalledWith({
      openStreamTabs: {
        'video:stream-a': 24
      }
    });

    getUpdatedListener()(24, { status: 'complete' }, {} as chrome.tabs.Tab);
    listener({ type: 'ytcq:get-open-recent-stream-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenLastCalledWith({
      openStreamTabs: {
        'video:stream-a': 24
      }
    });

    getUpdatedListener()(24, { status: 'loading' }, {} as chrome.tabs.Tab);
    listener({ type: 'ytcq:get-open-recent-stream-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenLastCalledWith({
      openStreamTabs: {
        'video:stream-a': 25
      }
    });

    getRemovedListener()(25, {} as chrome.tabs.TabRemoveInfo);
    listener({ type: 'ytcq:get-open-recent-stream-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenLastCalledWith({ openStreamTabs: {} });

    listener({
      sourceUrl: 'https://www.youtube.com/live_chat?video_id=stream-a',
      type: 'ytcq:chat-attached'
    }, {
      tab: {
        id: 24
      } as chrome.tabs.Tab
    }, vi.fn());
    getRemovedListener()(24, {} as chrome.tabs.TabRemoveInfo);
    listener({ type: 'ytcq:get-open-recent-stream-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenLastCalledWith({ openStreamTabs: {} });
  });

  it('repopulates open stream tabs from active chat keepalive pings', async () => {
    await import('./recent-streams');
    const listener = getMessageListener();
    const sendResponse = vi.fn();
    const port = createPort({ tabId: 31 });

    getConnectListener()(port);
    port.postMessageToListeners({
      sourceUrl: 'https://www.youtube.com/live_chat?video_id=stream-a',
      type: 'ytcq:active-chat-ping'
    });

    listener({ type: 'ytcq:get-open-recent-stream-tabs' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenLastCalledWith({
      openStreamTabs: {
        'video:stream-a': 31
      }
    });
  });
});

function getMessageListener(): (
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

function getUpdatedListener(): (
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
) => void {
  const listener = vi.mocked(chrome.tabs.onUpdated.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No tabs updated listener registered');
  return listener as (
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ) => void;
}

function getRemovedListener(): (
  tabId: number,
  removeInfo: chrome.tabs.TabRemoveInfo
) => void {
  const listener = vi.mocked(chrome.tabs.onRemoved.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No tabs removed listener registered');
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

function createPort({ tabId, tabUrl = '' }: {
  tabId: number;
  tabUrl?: string;
}): chrome.runtime.Port & {
  postMessageToListeners: (message: unknown) => void;
} {
  const messageListeners: Array<(message: unknown) => void> = [];
  const disconnectListeners: (() => void)[] = [];
  return {
    name: 'ytcq:active-chat',
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => {
        disconnectListeners.push(listener);
      }),
      removeListener: vi.fn()
    },
    onMessage: {
      addListener: vi.fn((listener: (message: unknown) => void) => {
        messageListeners.push(listener);
      }),
      removeListener: vi.fn()
    },
    postMessage: vi.fn(),
    postMessageToListeners: (message: unknown) => {
      messageListeners.forEach((listener) => listener(message));
    },
    sender: {
      tab: {
        id: tabId,
        url: tabUrl
      } as chrome.tabs.Tab
    }
  } as unknown as chrome.runtime.Port & {
    postMessageToListeners: (message: unknown) => void;
  };
}
