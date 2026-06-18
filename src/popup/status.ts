import { CHAT_STATUS_UPDATED_STORAGE_KEY } from '../shared/chat-status';
import { KNOWN_CHAT_TABS_STORAGE_KEY } from '../shared/known-chat-tabs';
import { controls } from './controls';
import { getExtensionMessage } from './i18n';

type ExtensionStatus = 'checking' | 'active' | 'inactive';

interface ActiveChatStatusResponse {
  status?: {
    currentActive?: unknown;
    otherActiveCount?: unknown;
  };
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
      const status = chrome.runtime.lastError ? null : normalizeActiveChatStatus(response);
      updateExtensionStatusSummary(status);
    }
  );
}

function normalizeActiveChatStatus(response: ActiveChatStatusResponse | undefined): {
  currentActive: boolean;
  otherActiveCount: number;
} | null {
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

function updateExtensionStatusSummary(status: { currentActive: boolean; otherActiveCount: number } | null): void {
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
