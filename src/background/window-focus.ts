/**
 * Browser-window focus bridge.
 *
 * Chat iframes cannot reliably distinguish iframe focus changes from the
 * whole browser window losing focus. The background worker can observe Chrome's
 * window focus directly and notify active live-chat content scripts.
 */
import { LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE } from '../shared/live-edge';
import { getActiveChatTabIds } from './chat-tab-state';

const windowsApi = chrome.windows;

windowsApi?.onFocusChanged?.addListener((windowId) => {
  if (windowId !== windowsApi.WINDOW_ID_NONE) return;
  notifyActiveChatTabsWindowBlurred();
});

export function notifyActiveChatTabsWindowBlurred(): void {
  getActiveChatTabIds().forEach((tabId) => {
    chrome.tabs.sendMessage(tabId, {
      type: LIVE_EDGE_WINDOW_BLURRED_MESSAGE_TYPE
    }, consumeRuntimeError);
  });
}

function consumeRuntimeError(): void {
  void chrome.runtime.lastError;
}
