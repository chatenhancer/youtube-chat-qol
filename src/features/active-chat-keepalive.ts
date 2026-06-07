/**
 * Maintain a lightweight connection to the background service worker while the
 * live chat frame is open. This helps Chrome defer extension updates until the
 * user leaves chat, instead of invalidating the content script mid-stream.
 */
import { t } from '../shared/i18n';
import { createRefreshIcon } from '../shared/icons';
import { ytcqCreateElement } from '../shared/managed-dom';
import { findChatInput, getChatInputText, replaceChatInput } from '../youtube/chat-input';
import { PANEL_PAGES_SELECTOR } from '../youtube/selectors';
import { getCurrentYouTubeChatSourceUrl } from '../youtube/source-url';
import { hideEnhancedEffect } from './enhanced-effect';
import { registerFeatureLifecycle, suspendFeatures } from '../content/lifecycle';

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
let reconnectNotice: HTMLButtonElement | null = null;
let reconnectPending = false;

interface ReconnectDraft {
  text: string;
  url: string;
}

registerFeatureLifecycle({
  page: {
    init: startActiveChatKeepAlive,
    cleanupStale: cleanupStaleReconnectNotice,
    visibilityChanged: showPendingReconnectNotice
  }
});

export function startActiveChatKeepAlive(): void {
  restoreReconnectDraft();
  if (keepAlivePort) return;
  connectActiveChatPort();
}

function connectActiveChatPort(): boolean {
  try {
    keepAlivePort = chrome.runtime.connect({ name: ACTIVE_CHAT_PORT_NAME });
  } catch {
    keepAlivePort = null;
    hideEnhancedEffect();
    return false;
  }

  keepAlivePort.onDisconnect.addListener(() => {
    keepAlivePort = null;
    clearKeepAliveTimer();
    scheduleActiveChatReconnect();
  });

  reconnectPending = false;
  reconnectNotice?.remove();
  reconnectNotice = null;
  clearReconnectTimer();
  sendActiveChatPing();
  clearKeepAliveTimer();
  keepAliveTimer = window.setInterval(sendActiveChatPing, ACTIVE_CHAT_PING_INTERVAL_MS);
  return true;
}

export function cleanupStaleReconnectNotice(): void {
  document.querySelectorAll<HTMLElement>(`.${RECONNECT_ANCHOR_CLASS}`).forEach((anchor) => anchor.remove());
  reconnectNotice = null;
  reconnectPending = false;
  clearReconnectTimer();
}

function sendActiveChatPing(): void {
  try {
    keepAlivePort?.postMessage({
      sourceUrl: getCurrentYouTubeChatSourceUrl(),
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
  if (document.visibilityState === 'hidden' || reconnectTimer) return;

  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    if (connectActiveChatPort()) return;
    showReconnectNotice();
  }, ACTIVE_CHAT_RECONNECT_DELAY_MS);
}

function showReconnectNotice(): void {
  suspendFeatures();
  hideEnhancedEffect();
  reconnectPending = true;
  if (reconnectNotice || document.visibilityState === 'hidden') return;
  reconnectPending = false;

  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-reconnect-button';
  button.title = t('refreshChatTitle');
  button.setAttribute('aria-label', t('refreshChatTitle'));

  const label = ytcqCreateElement('span');
  label.textContent = t('refreshChat');

  button.append(createRefreshIcon(), label);
  button.addEventListener('click', () => {
    saveReconnectDraft();
    button.disabled = true;
    location.reload();
  });

  getReconnectAnchor().replaceChildren(button);
  reconnectNotice = button;
}

function showPendingReconnectNotice(visibilityState: Document['visibilityState']): void {
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

function getReconnectAnchor(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(`.${RECONNECT_ANCHOR_CLASS}`);
  const panelPages = document.querySelector<HTMLElement>(PANEL_PAGES_SELECTOR);
  const parent = panelPages?.parentElement || document.body;
  if (existing && existing.parentElement === parent) return existing;

  existing?.remove();

  const anchor = ytcqCreateElement('div');
  anchor.className = RECONNECT_ANCHOR_CLASS;
  if (panelPages) {
    parent.insertBefore(anchor, panelPages);
  } else {
    parent.append(anchor);
  }
  return anchor;
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
