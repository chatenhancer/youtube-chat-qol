/**
 * Per-tab toolbar status.
 *
 * The manifest defaults the action icon to an inactive gray version. The
 * active-chat keepalive port marks a tab active only while the content script is
 * connected to this background context.
 */
import { clearChatTab, getActiveChatStatus, getActiveChatTabIds, refreshKnownChatActionStatuses } from './chat-tab-state';

interface ActionStatusMessage {
  type?: string;
  currentTabId?: unknown;
}

chrome.runtime.onMessage.addListener((message: ActionStatusMessage, _sender, sendResponse) => {
  if (message?.type === 'ytcq:get-active-chat-status') {
    sendResponse({ status: getActiveChatStatus(normalizeTabId(message.currentTabId)) });
    return false;
  }

  if (message?.type === 'ytcq:get-active-chat-tabs') {
    sendResponse({ activeTabIds: getActiveChatTabIds() });
    return false;
  }

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  clearChatTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearChatTab(tabId);
});

refreshKnownChatActionStatuses();

function normalizeTabId(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
