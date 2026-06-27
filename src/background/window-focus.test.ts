import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE } from '../shared/live-edge';

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
      type: LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE
    }, expect.any(Function));
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
      type: LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE
    }, expect.any(Function));
  });
});

function getWindowFocusChangedListener(): (windowId: number) => void {
  const listener = vi.mocked(chrome.windows.onFocusChanged.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No window focus listener registered');
  return listener as (windowId: number) => void;
}
