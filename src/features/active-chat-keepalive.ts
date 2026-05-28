/**
 * Maintain a lightweight connection to the background service worker while the
 * live chat frame is open. This helps Chrome defer extension updates until the
 * user leaves chat, instead of invalidating the content script mid-stream.
 */
import { t } from '../shared/i18n';
import { findChatInput, getChatInputText, replaceChatInput } from '../youtube/chat-input';

const ACTIVE_CHAT_PORT_NAME = 'ytcq:active-chat';
const ACTIVE_CHAT_PING_TYPE = 'ytcq:active-chat-ping';
const ACTIVE_CHAT_PING_INTERVAL_MS = 25_000;
const RECONNECT_DRAFT_STORAGE_KEY = 'ytcqReconnectDraft';
const DRAFT_RESTORE_DELAYS_MS = [300, 800, 1500, 3000, 5000];

let keepAlivePort: chrome.runtime.Port | null = null;
let keepAliveTimer = 0;
let reconnectNotice: HTMLButtonElement | null = null;
let reconnectNoticePending = false;

interface ReconnectDraft {
  text: string;
  url: string;
}

export function startActiveChatKeepAlive(): void {
  restoreReconnectDraft();
  if (keepAlivePort) return;
  document.addEventListener('visibilitychange', showPendingReconnectNotice);

  try {
    keepAlivePort = chrome.runtime.connect({ name: ACTIVE_CHAT_PORT_NAME });
  } catch {
    keepAlivePort = null;
    return;
  }

  keepAlivePort.onDisconnect.addListener(() => {
    keepAlivePort = null;
    clearKeepAliveTimer();
    showReconnectNotice();
  });

  sendActiveChatPing();
  keepAliveTimer = window.setInterval(sendActiveChatPing, ACTIVE_CHAT_PING_INTERVAL_MS);
}

function sendActiveChatPing(): void {
  try {
    keepAlivePort?.postMessage({
      type: ACTIVE_CHAT_PING_TYPE
    });
  } catch {
    keepAlivePort = null;
    clearKeepAliveTimer();
    showReconnectNotice();
  }
}

function showReconnectNotice(): void {
  reconnectNoticePending = true;
  if (reconnectNotice || document.visibilityState === 'hidden') return;
  reconnectNoticePending = false;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-reconnect-button';
  button.title = t('refreshChatTitle');
  button.setAttribute('aria-label', t('refreshChatTitle'));

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 -960 960 960');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-70q0-17 11.5-28.5T760-800q17 0 28.5 11.5T800-760v200q0 17-11.5 28.5T760-520H560q-17 0-28.5-11.5T520-560q0-17 11.5-28.5T560-600h128q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q63 0 116.5-30T682-351q8-14 23-19.5t30 1.5q16 7 22 23t-2 31q-38 71-111 113T480-160Z');
  icon.append(path);

  const label = document.createElement('span');
  label.textContent = t('refreshChat');

  button.append(icon, label);
  button.addEventListener('click', () => {
    saveReconnectDraft();
    button.disabled = true;
    location.reload();
  });

  document.documentElement.append(button);
  reconnectNotice = button;
}

function showPendingReconnectNotice(): void {
  if (!reconnectNoticePending || document.visibilityState === 'hidden') return;
  showReconnectNotice();
}

function clearKeepAliveTimer(): void {
  if (!keepAliveTimer) return;
  window.clearInterval(keepAliveTimer);
  keepAliveTimer = 0;
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
