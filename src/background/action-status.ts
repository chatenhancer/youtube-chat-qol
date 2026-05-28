/**
 * Per-tab toolbar status.
 *
 * The manifest defaults the action icon to an inactive gray version. When the
 * live-chat content script actually boots, it tells the background page to use
 * the full-color icon for that tab.
 */
import { KNOWN_CHAT_TABS_STORAGE_KEY, normalizeKnownChatTabs } from '../shared/known-chat-tabs';

const ACTIVE_ICON_PATHS: Record<string, string> = {
  '16': 'icons/icon-16.png',
  '32': 'icons/icon-32.png',
  '48': 'icons/icon-48.png',
  '128': 'icons/icon-128.png'
};

const INACTIVE_ICON_PATHS: Record<string, string> = {
  '16': 'icons/icon-inactive-16.png',
  '32': 'icons/icon-inactive-32.png',
  '48': 'icons/icon-inactive-48.png',
  '128': 'icons/icon-inactive-128.png'
};

const DEFAULT_TITLE = chrome.i18n.getMessage('extensionName') || 'Chat Enhancer for YouTube';
const ACTIVE_TITLE = chrome.i18n.getMessage('extensionActiveTitle') || `${DEFAULT_TITLE} is active in this tab`;

interface ActionStatusMessage {
  type?: string;
}

chrome.runtime.onMessage.addListener((message: ActionStatusMessage, sender) => {
  if (message?.type !== 'ytcq:chat-attached') return false;
  const tabId = sender.tab?.id;
  if (typeof tabId !== 'number') return false;

  setActionStatus(tabId, true);
  rememberKnownChatTab(tabId);
  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'loading') return;
  setActionStatus(tabId, false);
  forgetKnownChatTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetKnownChatTab(tabId);
});

function setActionStatus(tabId: number, active: boolean): void {
  chrome.action.setIcon({
    tabId,
    path: active ? ACTIVE_ICON_PATHS : INACTIVE_ICON_PATHS
  });
  chrome.action.setTitle({
    tabId,
    title: active ? ACTIVE_TITLE : DEFAULT_TITLE
  });
}

function rememberKnownChatTab(tabId: number): void {
  chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY, (stored) => {
    const records = normalizeKnownChatTabs(stored[KNOWN_CHAT_TABS_STORAGE_KEY]);
    records[String(tabId)] = Date.now();
    chrome.storage.local.set({ [KNOWN_CHAT_TABS_STORAGE_KEY]: records });
  });
}

function forgetKnownChatTab(tabId: number): void {
  chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY, (stored) => {
    const records = normalizeKnownChatTabs(stored[KNOWN_CHAT_TABS_STORAGE_KEY]);
    if (!(String(tabId) in records)) return;
    delete records[String(tabId)];
    chrome.storage.local.set({ [KNOWN_CHAT_TABS_STORAGE_KEY]: records });
  });
}
