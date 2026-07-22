/**
 * Maintain a lightweight connection to the background service worker while the
 * live chat frame is open. This helps Chrome defer extension updates until the
 * user leaves chat, instead of invalidating the content script mid-stream.
 */
import { findChatInput, getChatInputText, replaceChatInput } from '../youtube/chat-input';
import { hideEnhancedEffect } from './enhanced-effect';
import { registerFeature, suspendFeatures } from '../content/dispatcher';

const ACTIVE_CHAT_PORT_NAME = 'ytcq:active-chat';
const ACTIVE_CHAT_PING_TYPE = 'ytcq:active-chat-ping';
const ACTIVE_CHAT_PING_INTERVAL_MS = 25_000;
const ACTIVE_CHAT_RECONNECT_DELAY_MS = 250;
const RECONNECT_DRAFT_STORAGE_KEY = 'ytcqReconnectDraft';
const RECONNECT_ANCHOR_CLASS = 'ytcq-reconnect-anchor';
const DRAFT_RESTORE_DELAYS_MS = [300, 800, 1500, 3000, 5000];

let keepAlivePort: chrome.runtime.Port | null = null;
let keepAliveTimer = 0;
let reconnectTimer = 0;
let reconnectPending = false;
let reloadPending = false;
let keepAliveStopped = false;

interface ReconnectDraft {
  text: string;
  url: string;
}

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
    if (connectActiveChatPort()) return;
    reloadDisconnectedChat();
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

function saveReconnectDraft(): void {
  const text = getChatInputText();
  if (!text.trim()) return;

  setSessionStorageValue(RECONNECT_DRAFT_STORAGE_KEY, JSON.stringify({
    text,
    url: location.href
  } satisfies ReconnectDraft));
}

function restoreReconnectDraft(attempt = 0): void {
  const draft = readReconnectDraft();
  if (!draft) return;

  if (draft.url !== location.href) {
    removeSessionStorageValue(RECONNECT_DRAFT_STORAGE_KEY);
    return;
  }

  const input = findChatInput();
  if (input && !getChatInputText().trim()) {
    replaceChatInput(draft.text);
    removeSessionStorageValue(RECONNECT_DRAFT_STORAGE_KEY);
    return;
  }

  const delay = DRAFT_RESTORE_DELAYS_MS[attempt];
  if (delay === undefined) return;

  window.setTimeout(() => restoreReconnectDraft(attempt + 1), delay);
}

function readReconnectDraft(): ReconnectDraft | null {
  const raw = getSessionStorageValue(RECONNECT_DRAFT_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ReconnectDraft>;
    if (typeof parsed.text !== 'string' || typeof parsed.url !== 'string') return null;
    return {
      text: parsed.text,
      url: parsed.url
    };
  } catch {
    removeSessionStorageValue(RECONNECT_DRAFT_STORAGE_KEY);
    return null;
  }
}

function getSessionStorageValue(key: string): string {
  try {
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function setSessionStorageValue(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Draft preservation is best-effort; reconnect should still be available.
  }
}

function removeSessionStorageValue(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}
