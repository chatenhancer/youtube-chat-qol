/** Attach to existing chats when the extension is installed, enabled, or restarted. */
import { isYouTubeChatFeedLocation } from '../youtube/chat-feed/pages';
import { CONTENT_INSTANCE_ATTRIBUTE, CONTENT_REATTACHMENT_ATTRIBUTE } from '../shared/content-instance';
import { hasActiveChatPort } from './active-chat-keepalive';

// Enabling an extension starts its worker without firing runtime.onInstalled.
// A normal worker wake is safe too: connected chats are left in place.
void attachOpenChats();

async function attachOpenChats(): Promise<void> {
  if (!chrome.scripting) return;
  try {
    const tabs = await chrome.tabs.query({
      url: ['https://www.youtube.com/*', 'https://studio.youtube.com/*'],
      discarded: false
    });
    await Promise.all(tabs.map(async (tab) => {
      if (typeof tab.id !== 'number' || hasActiveChatPort(tab.id)) return;
      await attachTab(tab.id);
    }));
  } catch {
    // Browser shutdown can end the query before tabs are available.
  }
}

async function attachTab(tabId: number): Promise<void> {
  try {
    // Discover permitted chat frames without requiring webNavigation access.
    const frames = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      args: [CONTENT_INSTANCE_ATTRIBUTE, CONTENT_REATTACHMENT_ATTRIBUTE],
      func: (instanceAttribute, reattachmentAttribute) => {
        const instance = document.documentElement.getAttribute(instanceAttribute);
        if (instance) document.documentElement.setAttribute(reattachmentAttribute, instance);
        return location.href;
      }
    });
    await Promise.all(frames.map(async ({ frameId, documentId, result }) => {
      if (typeof result !== 'string' || !isYouTubeChatFeedLocation(new URL(result))) return;
      const connected = await chrome.tabs.sendMessage(tabId, {
        type: 'ytcq:chat-attached-ping'
      }, { frameId }).catch(() => null);
      if (connected?.attached) return;

      // Keep attachment tied to this document if its frame navigates meanwhile.
      const target = { tabId, documentIds: [documentId] };
      await chrome.scripting.executeScript({ target, files: ['chat-feed-page.js'], world: 'MAIN' });
      await chrome.scripting.insertCSS({ target, files: ['content.css'] });
      await chrome.scripting.executeScript({ target, files: ['lite-mode-bootstrap.js', 'content.js'] });
    }));
  } catch {
    // A tab/frame can navigate, close, or lose site access during attachment.
  }
}
