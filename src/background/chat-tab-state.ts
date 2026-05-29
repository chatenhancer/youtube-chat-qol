/**
 * Live chat tab status shared by background modules.
 *
 * A persisted known-tab record means a tab has hosted live chat recently, while
 * an active tab record means a content script is currently connected to this
 * service worker. Keep those states separate so extension reloads do not make
 * stale injected DOM look active.
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

const activeChatTabIds = new Set<number>();

export function markChatTabActive(tabId: number): void {
  activeChatTabIds.add(tabId);
  setActionStatus(tabId, true);
  rememberKnownChatTab(tabId);
}

export function markChatTabInactive(tabId: number): void {
  activeChatTabIds.delete(tabId);
  setActionStatus(tabId, false);
}

export function clearChatTab(tabId: number): void {
  activeChatTabIds.delete(tabId);
  setActionStatus(tabId, false);
  forgetKnownChatTab(tabId);
}

export function getActiveChatTabIds(): number[] {
  return [...activeChatTabIds];
}

export function refreshKnownChatActionStatuses(): void {
  chrome.storage.local.get(KNOWN_CHAT_TABS_STORAGE_KEY, (stored) => {
    const records = normalizeKnownChatTabs(stored[KNOWN_CHAT_TABS_STORAGE_KEY]);
    Object.keys(records).forEach((tabIdText) => {
      const tabId = Number(tabIdText);
      if (activeChatTabIds.has(tabId)) return;
      setActionStatus(tabId, false);
    });
  });
}

function setActionStatus(tabId: number, active: boolean): void {
  chrome.action.setIcon({
    tabId,
    path: active ? ACTIVE_ICON_PATHS : INACTIVE_ICON_PATHS
  }, consumeRuntimeError);
  chrome.action.setTitle({
    tabId,
    title: active ? ACTIVE_TITLE : DEFAULT_TITLE
  }, consumeRuntimeError);
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

function consumeRuntimeError(): void {
  void chrome.runtime.lastError;
}
