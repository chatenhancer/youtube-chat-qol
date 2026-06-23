/**
 * Live chat tab status shared by background modules.
 *
 * An active tab record means a content script is currently connected to this
 * service worker.
 */
import { getExtensionAction, isBrowserActionOnly } from '../shared/extension-action';

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
}

export function markChatTabInactive(tabId: number): void {
  activeChatTabIds.delete(tabId);
  setActionStatus(tabId, false);
}

export function clearChatTab(tabId: number): void {
  activeChatTabIds.delete(tabId);
  setActionStatus(tabId, false);
}

export function getActiveChatTabIds(): number[] {
  return [...activeChatTabIds];
}

function setActionStatus(tabId: number, active: boolean): void {
  const action = getExtensionAction();
  const path = active ? ACTIVE_ICON_PATHS : INACTIVE_ICON_PATHS;
  const title = active ? ACTIVE_TITLE : DEFAULT_TITLE;
  action.setIcon({
    tabId,
    path
  }, consumeRuntimeError);
  action.setTitle({
    tabId,
    title
  }, consumeRuntimeError);
  if (isBrowserActionOnly()) {
    action.setIcon({ path }, consumeRuntimeError);
    action.setTitle({ title }, consumeRuntimeError);
  }
}

function consumeRuntimeError(): void {
  void chrome.runtime.lastError;
}
