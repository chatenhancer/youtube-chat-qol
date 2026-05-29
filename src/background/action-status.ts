/**
 * Per-tab toolbar status.
 *
 * The manifest defaults the action icon to an inactive gray version. When the
 * live-chat content script actually boots, it tells the background page to use
 * the full-color icon for that tab.
 */
import { clearChatTab, getActiveChatTabIds, markChatTabActive, refreshKnownChatActionStatuses } from './chat-tab-state';

interface ActionStatusMessage {
  type?: string;
}

chrome.runtime.onMessage.addListener((message: ActionStatusMessage, sender, sendResponse) => {
  if (message?.type === 'ytcq:get-active-chat-tabs') {
    sendResponse({ activeTabIds: getActiveChatTabIds() });
    return false;
  }

  if (message?.type !== 'ytcq:chat-attached') return false;
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') return false;

  markChatTabActive(tabId);
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
