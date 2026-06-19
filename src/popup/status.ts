import { CHAT_STATUS_UPDATED_STORAGE_KEY } from '../shared/chat-status';
import { KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';

type ExtensionStatus = 'checking' | 'active' | 'inactive';

const CHAT_ATTACHED_PING_TYPE = 'ytcq:chat-attached-ping';

interface ActiveChatStatusResponse {
  status?: {
    currentActive?: unknown;
    otherActiveCount?: unknown;
  };
}

interface ChatAttachedPingResponse {
  attached?: unknown;
}

interface ActiveChatStatus {
  currentActive: boolean;
  otherActiveCount: number;
}

export function initExtensionStatus(): void {
  refreshExtensionStatus();
  chrome.storage.onChanged.addListener(handleExtensionStatusStorageChange);
}

function handleExtensionStatusStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'local') return;
  if (!changes[KNOWN_CHAT_TABS_STORAGE_KEY] && !changes[CHAT_STATUS_UPDATED_STORAGE_KEY]) return;
  refreshExtensionStatus();
}

function refreshExtensionStatus(): void {
  setExtensionStatus('checking', getExtensionMessage('extensionStatusChecking'), getExtensionMessage('extensionStatusCheckingHelper'));

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTabId = tabs[0]?.id;
    refreshCurrentExtensionStatus(typeof currentTabId === 'number' ? currentTabId : null);
  });
}

function refreshCurrentExtensionStatus(currentTabId: number | null): void {
  chrome.runtime.sendMessage(
    { type: 'ytcq:get-active-chat-status', currentTabId },
    (response?: ActiveChatStatusResponse) => {
      const backgroundStatus = chrome.runtime.lastError ? null : normalizeActiveChatStatus(response);
      getDirectActiveChatStatus(currentTabId, (directStatus) => {
        updateExtensionStatusSummary(getPreferredActiveChatStatus(backgroundStatus, directStatus));
      });
    }
  );
}

function normalizeActiveChatStatus(response: ActiveChatStatusResponse | undefined): ActiveChatStatus | null {
  const currentActive = response?.status?.currentActive;
  const otherActiveCount = response?.status?.otherActiveCount;
  if (
    typeof currentActive !== 'boolean' ||
    typeof otherActiveCount !== 'number' ||
    !Number.isFinite(otherActiveCount) ||
    otherActiveCount < 0
  ) {
    return null;
  }
  return {
    currentActive,
    otherActiveCount: Math.floor(otherActiveCount)
  };
}

function getDirectActiveChatStatus(
  currentTabId: number | null,
  callback: (status: ActiveChatStatus | null) => void
): void {
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError) {
      callback(null);
      return;
    }

    const tabIds = tabs
      .map((tab) => tab.id)
      .filter((tabId): tabId is number => typeof tabId === 'number');
    if (!tabIds.length) {
      callback({ currentActive: false, otherActiveCount: 0 });
      return;
    }

    const attachedTabIds = new Set<number>();
    let pending = tabIds.length;
    tabIds.forEach((tabId) => {
      chrome.tabs.sendMessage(tabId, { type: CHAT_ATTACHED_PING_TYPE }, (response?: ChatAttachedPingResponse) => {
        if (!chrome.runtime.lastError && response?.attached === true) {
          attachedTabIds.add(tabId);
        }
        pending -= 1;
        if (pending > 0) return;

        const currentActive = currentTabId !== null && attachedTabIds.has(currentTabId);
        callback({
          currentActive,
          otherActiveCount: attachedTabIds.size - (currentActive ? 1 : 0)
        });
      });
    });
  });
}

function getPreferredActiveChatStatus(
  backgroundStatus: ActiveChatStatus | null,
  directStatus: ActiveChatStatus | null
): ActiveChatStatus | null {
  if (directStatus && (directStatus.currentActive || directStatus.otherActiveCount > 0)) {
    return directStatus;
  }
  return backgroundStatus || directStatus;
}

function updateExtensionStatusSummary(status: ActiveChatStatus | null): void {
  const connectedHelper = getExtensionMessage('extensionStatusConnected');

  if (status?.currentActive) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrent'), connectedHelper);
    return;
  }

  if (status?.otherActiveCount === 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveOneOther'), connectedHelper);
    return;
  }

  if (status && status.otherActiveCount > 1) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveManyOther', String(status.otherActiveCount)), connectedHelper);
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
