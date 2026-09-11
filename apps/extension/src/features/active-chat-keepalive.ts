/**
 * Maintain a lightweight connection to the background service worker while the
 * live chat frame is open. This helps Chrome defer extension updates until the
 * user leaves chat, instead of invalidating the content script mid-stream.
 */
import { restoreReconnectDraft, saveReconnectDraft } from '../youtube/reconnect-draft';
import { hideEnhancedEffect } from './enhanced-effect';
import { registerFeature, suspendFeatures } from '../content/dispatcher';
import { CONTENT_INSTANCE_ATTRIBUTE, CONTENT_REATTACHMENT_ATTRIBUTE } from '../shared/content-instance';

const ACTIVE_CHAT_PORT_NAME = 'ytcq:active-chat';
const ACTIVE_CHAT_PING_TYPE = 'ytcq:active-chat-ping';
const ACTIVE_CHAT_PING_INTERVAL_MS = 25_000;
const ACTIVE_CHAT_RECONNECT_DELAY_MS = 250;
const ACTIVE_CHAT_RELOAD_DELAY_MS = 5_000;
const RECONNECT_ANCHOR_CLASS = 'ytcq-reconnect-anchor';

let keepAlivePort: chrome.runtime.Port | null = null;
let keepAliveTimer = 0;
let reconnectTimer = 0;
let reconnectPending = false;
let reloadPending = false;
let keepAliveStopped = false;

registerFeature({
  page: {
    init: startActiveChatKeepAlive,
    cleanup: cleanupActiveChatKeepAlive,
    visibilityChanged: resumePendingReconnect
  }
});

export function startActiveChatKeepAlive(): void {
  keepAliveStopped = false;
  restoreReconnectDraft();
  if (keepAlivePort) return;
  connectActiveChatPort();
}

function connectActiveChatPort(): boolean {
  let port: chrome.runtime.Port;
  try {
    port = chrome.runtime.connect({ name: ACTIVE_CHAT_PORT_NAME });
  } catch {
    keepAlivePort = null;
    hideEnhancedEffect();
    return false;
  }

  keepAlivePort = port;
  port.onDisconnect.addListener(() => {
    if (keepAlivePort === port) keepAlivePort = null;
    clearKeepAliveTimer();
    if (keepAliveStopped) return;
    scheduleActiveChatReconnect();
  });

  reconnectPending = false;
  reloadPending = false;
  clearReconnectTimer();
  sendActiveChatPing();
  clearKeepAliveTimer();
  keepAliveTimer = window.setInterval(sendActiveChatPing, ACTIVE_CHAT_PING_INTERVAL_MS);
  return true;
}

export function cleanupStaleReconnectNotice(): void {
  document.querySelectorAll<HTMLElement>(`.${RECONNECT_ANCHOR_CLASS}`).forEach((anchor) => anchor.remove());
  reconnectPending = false;
  clearReconnectTimer();
}

export function cleanupActiveChatKeepAlive(): void {
  keepAliveStopped = true;
  cleanupStaleReconnectNotice();
  const port = keepAlivePort;
  keepAlivePort = null;
  clearKeepAliveTimer();
  try {
    port?.disconnect();
  } catch {
    // The old extension context may already be gone during reload handoff.
  }
  reconnectPending = false;
  reloadPending = false;
  clearReconnectTimer();
}

function sendActiveChatPing(): void {
  try {
    keepAlivePort?.postMessage({
      type: ACTIVE_CHAT_PING_TYPE
    });
  } catch {
    keepAlivePort = null;
    clearKeepAliveTimer();
    scheduleActiveChatReconnect();
  }
}

function scheduleActiveChatReconnect(): void {
  reconnectPending = true;
  if (document.visibilityState === 'hidden' || reconnectTimer || reloadPending) return;

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    if (document.visibilityState === 'hidden') return;
    if (connectActiveChatPort()) return;

    const instance = document.documentElement.getAttribute(CONTENT_INSTANCE_ATTRIBUTE);
    if (!instance || document.documentElement.getAttribute(CONTENT_REATTACHMENT_ATTRIBUTE) !== instance) {
      // Disabling the extension starts no replacement. Restore native chat
      // promptly, including a feed discarded by Lite mode and injected styles.
      reloadDisconnectedChat();
      return;
    }

    // Only wait when the new background has announced an actual handoff.
    // The replacement's normal cleanup cancels this fallback.
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      if (document.documentElement.getAttribute(CONTENT_INSTANCE_ATTRIBUTE) !== instance) return;
      if (document.visibilityState === 'hidden') return;
      if (connectActiveChatPort()) return;
      reloadDisconnectedChat();
    }, ACTIVE_CHAT_RELOAD_DELAY_MS);
  }, ACTIVE_CHAT_RECONNECT_DELAY_MS);
}

function reloadDisconnectedChat(): void {
  if (reloadPending) return;
  reloadPending = true;
  reconnectPending = false;
  saveReconnectDraft();
  clearKeepAliveTimer();
  clearReconnectTimer();
  suspendFeatures();
  hideEnhancedEffect();
  location.reload();
}

function resumePendingReconnect(visibilityState: Document['visibilityState']): void {
  if (!reconnectPending || visibilityState === 'hidden') return;
  scheduleActiveChatReconnect();
}

function clearKeepAliveTimer(): void {
  if (!keepAliveTimer) return;
  window.clearInterval(keepAliveTimer);
  keepAliveTimer = 0;
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = 0;
}
