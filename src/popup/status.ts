import { KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';

type ExtensionStatus = 'checking' | 'active' | 'inactive';

interface ActiveChatTabsResponse {
  activeTabIds?: unknown;
}

export function initExtensionStatus(): void {
  refreshExtensionStatus();
  chrome.storage.onChanged.addListener(handleExtensionStatusStorageChange);
}

function handleExtensionStatusStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local' || !changes[KNOWN_CHAT_TABS_STORAGE_KEY]) return;
  refreshExtensionStatus();
}

function refreshExtensionStatus(): void {
  setExtensionStatus('checking', getExtensionMessage('extensionStatusChecking'), getExtensionMessage('extensionStatusCheckingHelper'));

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTabId = tabs[0]?.id;
    refreshGlobalExtensionStatus(typeof currentTabId === 'number' ? currentTabId : null);
  });
}

function refreshGlobalExtensionStatus(currentTabId: number | null): void {
  chrome.tabs.query({}, (tabs) => {
    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number');

    if (!tabIds.length) {
      updateExtensionStatusSummary(new Set(), currentTabId);
      return;
    }

    const openTabIds = new Set(tabIds);
    chrome.runtime.sendMessage({ type: 'ytcq:get-active-chat-tabs' }, (response?: ActiveChatTabsResponse) => {
      const activeTabIds = chrome.runtime.lastError
        ? new Set<number>()
        : getOpenActiveChatTabIds(response, openTabIds);
      updateExtensionStatusSummary(activeTabIds, currentTabId);
    });
  });
}

function getOpenActiveChatTabIds(response: ActiveChatTabsResponse | undefined, openTabIds: Set<number>): Set<number> {
  if (!Array.isArray(response?.activeTabIds)) return new Set();
  return new Set(response.activeTabIds.filter((tabId): tabId is number => {
    return typeof tabId === 'number' && openTabIds.has(tabId);
  }));
}

function updateExtensionStatusSummary(activeTabIds: Set<number>, currentTabId: number | null): void {
  const currentActive = typeof currentTabId === 'number' && activeTabIds.has(currentTabId);
  const otherCount = activeTabIds.size - (currentActive ? 1 : 0);
  const connectedHelper = getExtensionMessage('extensionStatusConnected');

  if (currentActive && otherCount === 0) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrent'), connectedHelper);
    return;
  }

  if (currentActive && otherCount === 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrentAndOne'), connectedHelper);
    return;
  }

  if (currentActive && otherCount > 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrentAndMany', String(otherCount)), connectedHelper);
    return;
  }

  if (otherCount === 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveOneOther'), connectedHelper);
    return;
  }

  if (otherCount > 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveManyOther', String(otherCount)), connectedHelper);
    return;
  }

  setExtensionStatus('inactive', getExtensionMessage('extensionStatusInactiveAll'), getExtensionMessage('extensionStatusDisconnected'));
}

function setExtensionStatus(status: ExtensionStatus, text: string, helper: string): void {
  const ariaStatusText = helper ? `${text}. ${helper}` : text;
  if (controls.extensionStatus) {
    controls.extensionStatus.dataset.extensionStatus = status;
    controls.extensionStatus.title = helper || text;
    controls.extensionStatus.setAttribute('aria-label', ariaStatusText);
  }
  if (controls.extensionStatusText) {
    controls.extensionStatusText.textContent = text;
  }
}
