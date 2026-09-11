import { findChatInput, getChatInputText, replaceChatInput } from './chat-input';

// Keep the existing key and shape so a new instance can restore an older draft.
const RECONNECT_DRAFT_STORAGE_KEY = 'ytcqReconnectDraft';
const DRAFT_RESTORE_DELAYS_MS = [300, 800, 1500, 3000, 5000];

interface ReconnectDraft {
  text: string;
  url: string;
}

export function saveReconnectDraft(): void {
  const text = getChatInputText();
  if (!text.trim()) return;

  setSessionStorageValue(RECONNECT_DRAFT_STORAGE_KEY, JSON.stringify({
    text,
    url: location.href
  } satisfies ReconnectDraft));
}

export function restoreReconnectDraft(attempt = 0): void {
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
