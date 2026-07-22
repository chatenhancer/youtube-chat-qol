/**
 * Live edge recovery.
 *
 * YouTube can stop appending new live-chat data when chat is scrolled up or
 * backgrounded. Move to the live edge when the user leaves the tab or browser
 * window, then leave foreground scrolling entirely under the reader's control.
 */
import { registerFeature } from '../content/dispatcher';
import { LIVE_EDGE_LEAVE_MESSAGE_TYPE } from '../shared/live-edge';
import { keepChatAtLiveEdge } from '../youtube/chat-scroll';

registerFeature({
  page: {
    init: initLiveEdgeRecovery,
    cleanup: cleanupStaleLiveEdgeRecovery
  }
});

function initLiveEdgeRecovery(): void {
  chrome.runtime.onMessage.addListener(handleLiveEdgeMessage);
}

function cleanupStaleLiveEdgeRecovery(): void {
  chrome.runtime.onMessage.removeListener(handleLiveEdgeMessage);
}

function handleLiveEdgeMessage(message: { type?: string }): false {
  if (message?.type === LIVE_EDGE_LEAVE_MESSAGE_TYPE) {
    keepChatAtLiveEdge();
  }
  return false;
}
