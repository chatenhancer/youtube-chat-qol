/**
 * Recent stream recorder.
 *
 * Content scripts run inside the chat frame, while the background sender tab
 * can usually see the outer watch page title and URL. Record from the
 * background so recent stream rows use the user-facing stream identity.
 */
import {
  RECENT_STREAMS_STORAGE_KEY,
  getRecentStreamKey,
  normalizeStoredRecentStreams,
  serializeRecentStreams,
  upsertRecentStreamVisit
} from '../shared/recent-streams';

interface RecordRecentStreamMessage {
  channelName?: unknown;
  sourceTitle?: unknown;
  sourceUrl?: unknown;
  type?: string;
}

interface ActiveChatKeepAliveMessage {
  sourceUrl?: unknown;
  type?: string;
}

const ACTIVE_CHAT_PORT_NAME = 'ytcq:active-chat';
const ACTIVE_CHAT_PING_TYPE = 'ytcq:active-chat-ping';
const openRecentStreamTabIdsByKey = new Map<string, Set<number>>();
const openRecentStreamKeysByTabId = new Map<number, Set<string>>();

chrome.runtime.onMessage.addListener((message: RecordRecentStreamMessage, sender, sendResponse) => {
  if (message?.type === 'ytcq:get-open-recent-stream-tabs') {
    sendOpenRecentStreamTabs(sendResponse);
    return false;
  }

  if (message?.type === 'ytcq:chat-attached') {
    rememberOpenRecentStreamTab(sender.tab?.url || getMessageString(message.sourceUrl) || '', sender.tab?.id);
    return false;
  }

  if (message?.type !== 'ytcq:record-recent-stream') return false;

  const sourceUrl = sender.tab?.url || getMessageString(message.sourceUrl) || '';
  const sourceTitle = sender.tab?.title || getMessageString(message.sourceTitle);
  const channelName = getMessageString(message.channelName);
  rememberOpenRecentStreamTab(sourceUrl, sender.tab?.id);

  chrome.storage.local.get({ [RECENT_STREAMS_STORAGE_KEY]: {} }, (stored) => {
    const records = normalizeStoredRecentStreams((stored || {})[RECENT_STREAMS_STORAGE_KEY]);
    const key = upsertRecentStreamVisit(records, {
      channelName,
      sourceTitle,
      sourceUrl
    });
    if (!key) return;

    chrome.storage.local.set({ [RECENT_STREAMS_STORAGE_KEY]: serializeRecentStreams(records) });
  });

  return false;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') forgetOpenRecentStreamTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  forgetOpenRecentStreamTab(tabId);
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== ACTIVE_CHAT_PORT_NAME) return;

  const tabId = port.sender?.tab?.id;
  if (typeof tabId !== 'number') return;

  rememberOpenRecentStreamTab(port.sender?.tab?.url || '', tabId);

  const handleMessage = (message: ActiveChatKeepAliveMessage) => {
    if (message?.type !== ACTIVE_CHAT_PING_TYPE) return;
    rememberOpenRecentStreamTab(port.sender?.tab?.url || getMessageString(message.sourceUrl), tabId);
  };

  port.onMessage.addListener(handleMessage);
  port.onDisconnect.addListener(() => {
    port.onMessage.removeListener(handleMessage);
  });
});

function sendOpenRecentStreamTabs(sendResponse: (response?: unknown) => void): void {
  // This is intentionally memory-only. If the service worker restarts, open
  // tabs will repopulate the map when their content scripts reconnect/report.
  sendResponse({
    openStreamTabs: Object.fromEntries(
      Array.from(openRecentStreamTabIdsByKey.entries())
        .map(([key, tabIds]) => [key, getFirstOpenRecentStreamTabId(tabIds)] as const)
        .filter((entry): entry is readonly [string, number] => typeof entry[1] === 'number')
    )
  });
}

function getMessageString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rememberOpenRecentStreamTab(sourceUrl: string, tabId: unknown): void {
  if (typeof tabId !== 'number') return;

  const key = getRecentStreamKey(sourceUrl);
  if (!key) return;

  const tabIds = openRecentStreamTabIdsByKey.get(key) || new Set<number>();
  tabIds.add(tabId);
  openRecentStreamTabIdsByKey.set(key, tabIds);

  const keys = openRecentStreamKeysByTabId.get(tabId) || new Set<string>();
  keys.add(key);
  openRecentStreamKeysByTabId.set(tabId, keys);
}

function forgetOpenRecentStreamTab(tabId: number): void {
  const keys = openRecentStreamKeysByTabId.get(tabId);
  if (!keys) return;

  keys.forEach((key) => {
    const tabIds = openRecentStreamTabIdsByKey.get(key);
    if (!tabIds) return;

    tabIds.delete(tabId);
    if (!tabIds.size) openRecentStreamTabIdsByKey.delete(key);
  });
  openRecentStreamKeysByTabId.delete(tabId);
}

function getFirstOpenRecentStreamTabId(tabIds: Set<number>): number | null {
  return tabIds.values().next().value ?? null;
}
