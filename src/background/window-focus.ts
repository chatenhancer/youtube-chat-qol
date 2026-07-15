/** Browser-level leave signals for live-edge recovery. */
import { LIVE_EDGE_LEAVE_MESSAGE_TYPE } from '../shared/live-edge';
import { getActiveChatTabIds } from './chat-tab-state';

const tabsApi = chrome.tabs;
const windowsApi = chrome.windows;
const activeTabIdByWindow = new Map<number, number>();
const activatedWindowIds = new Set<number>();

tabsApi?.query?.({ active: true }, (tabs) => {
  tabs.forEach((tab) => {
    if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') return;
    if (activatedWindowIds.has(tab.windowId)) return;
    activeTabIdByWindow.set(tab.windowId, tab.id);
  });
});

tabsApi?.onActivated?.addListener(({ tabId, windowId }) => {
  const previousTabId = activeTabIdByWindow.get(windowId);
  activatedWindowIds.add(windowId);
  activeTabIdByWindow.set(windowId, tabId);

  if (previousTabId === undefined || previousTabId === tabId) return;
  if (!getActiveChatTabIds().includes(previousTabId)) return;
  notifyChatTabLeft(previousTabId);
});

windowsApi?.onFocusChanged?.addListener((windowId) => {
  if (windowId !== windowsApi.WINDOW_ID_NONE) return;
  notifyActiveChatTabsLeft();
});

export function notifyActiveChatTabsLeft(): void {
  getActiveChatTabIds().forEach(notifyChatTabLeft);
}

function notifyChatTabLeft(tabId: number): void {
  tabsApi.sendMessage(tabId, {
    type: LIVE_EDGE_LEAVE_MESSAGE_TYPE
  }, consumeRuntimeError);
}

function consumeRuntimeError(): void {
  void chrome.runtime.lastError;
}
