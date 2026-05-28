/**
 * Keep the MV3 service worker non-idle while a YouTube live chat frame is using
 * the extension. Chrome only installs extension updates while the extension is
 * idle, so this avoids mid-stream update swaps that would invalidate the
 * content script and break Inbox/alerts.
 */
const ACTIVE_CHAT_PORT_NAME = 'ytcq:active-chat';
const ACTIVE_CHAT_PING_TYPE = 'ytcq:active-chat-ping';

interface ActiveChatKeepAliveMessage {
  type?: string;
}

const activeChatPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== ACTIVE_CHAT_PORT_NAME) return;

  activeChatPorts.add(port);

  const handleMessage = (message: ActiveChatKeepAliveMessage) => {
    if (message?.type !== ACTIVE_CHAT_PING_TYPE) return;
    // Receiving the ping is enough to keep the event-driven service worker busy.
  };

  port.onMessage.addListener(handleMessage);
  port.onDisconnect.addListener(() => {
    activeChatPorts.delete(port);
    port.onMessage.removeListener(handleMessage);
  });
});
