/**
 * Per-tab toolbar status.
 *
 * The manifest defaults the action icon to an inactive gray version. The
 * active-chat keepalive port marks a tab active only while the content script is
 * connected to this background context.
 */
import { clearChatTab } from './chat-tab-state';
import { hasActiveChatPort } from './active-chat-keepalive';

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  if (hasActiveChatPort(tabId)) return;
  clearChatTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  clearChatTab(tabId);
});
