import { controls } from './controls';
import { getExtensionAction } from '../shared/extension-action';
import { getExtensionMessage } from './i18n';

type ExtensionStatus = 'active' | 'inactive';

const CHAT_ATTACHED_PING_TYPE = 'ytcq:chat-attached-ping';

interface ChatAttachedPingResponse {
  attached?: unknown;
}

export function initExtensionStatus(): void {
  refreshExtensionStatus();
}

function refreshExtensionStatus(): void {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTabId = tabs[0]?.id;
    if (typeof currentTabId !== 'number') {
      updateExtensionStatusSummary(false);
      return;
    }
    chrome.tabs.sendMessage(currentTabId, { type: CHAT_ATTACHED_PING_TYPE }, (response?: ChatAttachedPingResponse) => {
      if (!chrome.runtime.lastError && response?.attached === true) {
        updateExtensionStatusSummary(true);
        return;
      }
      updateExtensionStatusFromActionTitle(currentTabId);
    });
  });
}

function updateExtensionStatusFromActionTitle(tabId: number): void {
  const action = getExtensionAction();
  action.getTitle({ tabId }, (title) => {
    if (!chrome.runtime.lastError && title === getExtensionMessage('extensionActiveTitle')) {
      updateExtensionStatusSummary(true);
      return;
    }
    action.getTitle({}, (globalTitle) => {
      updateExtensionStatusSummary(!chrome.runtime.lastError && globalTitle === getExtensionMessage('extensionActiveTitle'));
    });
  });
}

function updateExtensionStatusSummary(currentActive: boolean): void {
  const connectedHelper = getExtensionMessage('extensionStatusConnected');

  if (currentActive) {
    setExtensionStatus('active', getExtensionMessage('extensionStatusActiveCurrent'), connectedHelper);
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
