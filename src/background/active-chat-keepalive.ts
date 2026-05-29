/**
 * Keep the MV3 service worker non-idle while a YouTube live chat frame is using
 * the extension. Chrome only installs extension updates while the extension is
 * idle, so this avoids mid-stream update swaps that would invalidate the
 * content script and break Inbox/alerts.
 */
import { markChatTabActive, markChatTabInactive } from './chat-tab-state';

const ACTIVE_CHAT_PORT_NAME = 'ytcq:active-chat';
const ACTIVE_CHAT_PING_TYPE = 'ytcq:active-chat-ping';

interface ActiveChatKeepAliveMessage {
  type?: string;
}

const activeChatPortsByTabId = new Map<number, Set<chrome.runtime.Port>>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== ACTIVE_CHAT_PORT_NAME) return;

  const tabId = port.sender?.tab?.id;
  if (typeof tabId !== 'number') return;

  addActiveChatPort(tabId, port);

  const handleMessage = (message: ActiveChatKeepAliveMessage) => {
    if (message?.type !== ACTIVE_CHAT_PING_TYPE) return;
    // Receiving the ping is enough to keep the event-driven service worker busy.
  };

  port.onMessage.addListener(handleMessage);
  port.onDisconnect.addListener(() => {
    removeActiveChatPort(tabId, port);
    port.onMessage.removeListener(handleMessage);
  });
});

function addActiveChatPort(tabId: number, port: chrome.runtime.Port): void {
  const ports = activeChatPortsByTabId.get(tabId) || new Set<chrome.runtime.Port>();
  ports.add(port);
  activeChatPortsByTabId.set(tabId, ports);
  markChatTabActive(tabId);
}

function removeActiveChatPort(tabId: number, port: chrome.runtime.Port): void {
  const ports = activeChatPortsByTabId.get(tabId);
  if (!ports) return;

  ports.delete(port);
  if (ports.size) return;

  activeChatPortsByTabId.delete(tabId);
  markChatTabInactive(tabId);
}
