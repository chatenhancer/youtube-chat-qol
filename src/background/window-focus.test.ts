import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_EDGE_LEAVE_MESSAGE_TYPE } from '../shared/live-edge';

describe('background window focus bridge', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('notifies active chat tabs when all browser windows lose focus', async () => {
    await import('./window-focus');
    const chatTabState = await import('./chat-tab-state');
    chatTabState.markChatTabActive(41);
    chatTabState.markChatTabActive(42);
    const listener = getWindowFocusChangedListener();

    listener(7);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();

    listener(chrome.windows.WINDOW_ID_NONE);

    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(41, {
      type: LIVE_EDGE_LEAVE_MESSAGE_TYPE
    }, expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
      type: LIVE_EDGE_LEAVE_MESSAGE_TYPE
    }, expect.any(Function));
  });

  it('notifies the chat tab being left when another tab is activated', async () => {
    vi.mocked(chrome.tabs.query).mockImplementationOnce(((_queryInfo, callback) => {
      const tabs = [{ active: true, id: 41, windowId: 7 }] as chrome.tabs.Tab[];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }) as typeof chrome.tabs.query);
    await import('./window-focus');
    const chatTabState = await import('./chat-tab-state');
    chatTabState.markChatTabActive(41);
    chatTabState.markChatTabActive(42);
    const listener = getTabActivatedListener();

    listener({ tabId: 90, windowId: 7 });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledOnce();
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(41, {
      type: LIVE_EDGE_LEAVE_MESSAGE_TYPE
    }, expect.any(Function));

    listener({ tabId: 91, windowId: 8 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledOnce();
  });
});

function getWindowFocusChangedListener(): (windowId: number) => void {
  const listener = vi.mocked(chrome.windows.onFocusChanged.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No window focus listener registered');
  return listener as (windowId: number) => void;
}

function getTabActivatedListener(): (activeInfo: chrome.tabs.TabActiveInfo) => void {
  const listener = vi.mocked(chrome.tabs.onActivated.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No tab activation listener registered');
  return listener;
}
