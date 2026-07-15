/**
 * Document-start Lite mode intent.
 *
 * The normal content script starts at document idle. This tiny entrypoint reads
 * the opt-in setting early, prevents the native list from flashing before the
 * Lite controller mounts, and starts the page-world transport early enough to
 * observe YouTube's first chat responses. It never activates on YouTube Studio
 * during the initial beta.
 */
import { YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE } from '../../youtube/chat-feed/protocol';
import { jsx, el } from '../../shared/jsx-dom';
import { CHAT_SCROLLER_SELECTOR } from '../../youtube/selectors';
import { dispatchYouTubeChatFeedControl } from '../../youtube/chat-feed/control';
import { NATIVE_LIST_SELECTOR } from './native-list';
import { parseLiteModeFallbackCode, type LiteModeFallbackCode } from './fallback';

export const LITE_MODE_SESSION_COOLDOWN_KEY = 'ytcqLiteModeSessionCooldown:v1';
export const LITE_MODE_NATIVE_RESTORE_KEY = 'ytcqLiteModeNativeRestore:v1';
export const LITE_MODE_REPLAY_START_KEY = 'ytcqLiteModeReplayStart:v1';

const BOOTSTRAP_STYLE_ID = 'ytcq-lite-mode-bootstrap-style';
const BOOTSTRAP_GLOBAL_FLAG = '__ytcqLiteModeBootstrapStarted';
const NATIVE_RESTORE_ROOT_ID = 'ytcq-lite-native-restore';
const NATIVE_RESTORE_FALLBACK_ATTRIBUTE = 'data-ytcq-lite-fallback-notice';
const DOCUMENT_RELOAD_REQUEST_MAX_AGE_MS = 30_000;
const NATIVE_RESTORE_RELOAD_DELAY_MS = 75;
const NATIVE_RESTORE_MINIMUM_VISIBLE_MS = 1_000;
const NATIVE_RESTORE_OVERLAY_TIMEOUT_MS = 20_000;

interface NativeRestoreRequest {
  automaticFailure: boolean;
  fallbackCode?: LiteModeFallbackCode;
  message: string;
  requestedAt: number;
}

export interface RequestNativeChatRestoreOptions {
  automaticFailure: boolean;
  fallbackCode?: LiteModeFallbackCode;
  message: string;
}

export function initLiteModeBootstrap(): void {
  if (!isSupportedLiteModePage()) return;
  const globalState = window as unknown as Window & Record<string, unknown>;
  if (globalState[BOOTSTRAP_GLOBAL_FLAG] === true) return;
  globalState[BOOTSTRAP_GLOBAL_FLAG] = true;

  const nativeRestore = consumeNativeRestoreRequest();
  const replayStartRequested = consumeReplayLiteModeStartRequest();
  // An extension-initiated restore keeps a one-document cooldown so a delayed
  // sync-storage write cannot reactivate Lite during the reload. A normal user
  // reload clears the previous document's cooldown.
  beginLiteModeDocumentSession(Boolean(nativeRestore));

  ensureLiteModeBootstrapStyle();
  if (nativeRestore) {
    if (nativeRestore.automaticFailure) {
      document.documentElement.setAttribute(
        NATIVE_RESTORE_FALLBACK_ATTRIBUTE,
        nativeRestore.fallbackCode || 'LM00'
      );
    }
    showNativeRestoreOverlay(nativeRestore.message);
  } else if (replayStartRequested) {
    // The explicit handoff is persisted before reload, but this one-use marker
    // also starts the page transport synchronously instead of waiting for the
    // asynchronous storage read in the new replay document.
    applyStoredLiteModeIntent(true, false);
  }
  if (!hasChromeStorage()) return;

  chrome.storage.sync.get({ liteModeEnabled: false }, (stored) => {
    if (chrome.runtime?.lastError) return;
    applyStoredLiteModeIntent(stored?.liteModeEnabled === true, false);
  });

  chrome.storage.onChanged.addListener(handleLiteModeBootstrapStorageChange);
}

export function setLiteModeBootstrapIntent(enabled: boolean): void {
  if (!isSupportedLiteModePage()) return;
  ensureLiteModeBootstrapStyle();
  if (enabled) {
    document.documentElement.setAttribute(YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE, 'true');
  } else {
    clearLiteModeBootstrapIntent();
  }
}

export function clearLiteModeBootstrapIntent(): void {
  document.documentElement?.removeAttribute(YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE);
}

export function dispatchLiteChatControl(enabled: boolean): void {
  dispatchYouTubeChatFeedControl({
    consumer: 'lite',
    enabled
  });
}

export function hasLiteModeSessionCooldown(): boolean {
  try {
    return window.sessionStorage.getItem(LITE_MODE_SESSION_COOLDOWN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setLiteModeSessionCooldown(): void {
  try {
    window.sessionStorage.setItem(LITE_MODE_SESSION_COOLDOWN_KEY, 'true');
  } catch {
    // The native-restore reload is still attempted if session storage is unavailable.
  }
  clearLiteModeBootstrapIntent();
}

export function clearLiteModeSessionCooldown(): void {
  try {
    window.sessionStorage.removeItem(LITE_MODE_SESSION_COOLDOWN_KEY);
  } catch {
    // A user-requested retry can still proceed in this controller instance.
  }
}

export function beginLiteModeDocumentSession(preserveCooldown = false): void {
  if (preserveCooldown) {
    try {
      window.sessionStorage.setItem(LITE_MODE_SESSION_COOLDOWN_KEY, 'true');
    } catch {
      // The stored preference check below still remains safe for normal reloads.
    }
    return;
  }
  clearLiteModeSessionCooldown();
}

export function requestNativeChatRestore({
  automaticFailure,
  fallbackCode,
  message
}: RequestNativeChatRestoreOptions): void {
  const request: NativeRestoreRequest = {
    automaticFailure,
    ...(automaticFailure && fallbackCode ? { fallbackCode } : {}),
    message: message.trim().slice(0, 240),
    requestedAt: Date.now()
  };
  try {
    window.sessionStorage.setItem(LITE_MODE_NATIVE_RESTORE_KEY, JSON.stringify(request));
  } catch {
    // Reloading the chat frame is still the only reliable way to recreate a
    // discarded YouTube renderer. Session storage is available in normal tabs.
  }
  window.setTimeout(() => window.location.reload(), NATIVE_RESTORE_RELOAD_DELAY_MS);
}

/**
 * Replay chat prefetches future actions while native mode is active. Reloading
 * the chat document lets the document-start Lite transport own the next replay
 * response from its beginning instead of waiting for the following chunk.
 */
export function requestReplayLiteModeReload(): void {
  try {
    window.sessionStorage.setItem(LITE_MODE_REPLAY_START_KEY, String(Date.now()));
  } catch {
    // The persisted extension option still starts Lite in the new document.
  }
  setLiteModeBootstrapIntent(true);
  dispatchLiteChatControl(true);
  const reload = () => {
    window.setTimeout(() => window.location.reload());
  };
  if (!hasChromeStorage()) {
    reload();
    return;
  }

  // The normal option writer runs after feature callbacks. Confirm this one
  // setting before navigation so the fresh document cannot observe the old
  // value and briefly boot native chat.
  try {
    chrome.storage.sync.set({ liteModeEnabled: true }, reload);
  } catch {
    reload();
  }
}

export function consumeLiteModeFallbackNotice(): LiteModeFallbackCode | null {
  const value = document.documentElement.getAttribute(NATIVE_RESTORE_FALLBACK_ATTRIBUTE);
  document.documentElement.removeAttribute(NATIVE_RESTORE_FALLBACK_ATTRIBUTE);
  if (value === 'true') return 'LM00';
  return parseLiteModeFallbackCode(value);
}

export function isSupportedLiteModePage(locationValue: Location = window.location): boolean {
  if (locationValue.hostname === 'studio.youtube.com') return false;
  if (locationValue.hostname !== 'www.youtube.com' && locationValue.hostname !== 'youtube.com') {
    return false;
  }
  return locationValue.pathname === '/live_chat' || locationValue.pathname === '/live_chat_replay';
}

function handleLiteModeBootstrapStorageChange(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
): void {
  if (areaName !== 'sync' || !changes.liteModeEnabled) return;
  const enabled = changes.liteModeEnabled.newValue === true;
  applyStoredLiteModeIntent(enabled, enabled);
}

function applyStoredLiteModeIntent(enabled: boolean, userInitiatedRetry: boolean): void {
  if (!enabled) {
    clearReplayLiteModeStartRequest();
    clearLiteModeBootstrapIntent();
    dispatchLiteChatControl(false);
    return;
  }

  if (userInitiatedRetry) clearLiteModeSessionCooldown();
  if (hasLiteModeSessionCooldown()) {
    clearLiteModeBootstrapIntent();
    return;
  }

  setLiteModeBootstrapIntent(true);
  // Document start prebuffers YouTube's initial history. The idle controller
  // sends the explicit request only after its batch receiver is attached.
  dispatchLiteChatControl(true);
}

function ensureLiteModeBootstrapStyle(): void {
  if (document.getElementById(BOOTSTRAP_STYLE_ID)) return;
  const style = el<HTMLStyleElement>(
    <style id={BOOTSTRAP_STYLE_ID}>{`
    html[${YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE}="true"] yt-live-chat-item-list-renderer,
    html[${YOUTUBE_CHAT_FEED_BOOTSTRAP_INTENT_ATTRIBUTE}="true"] #chat > #item-list {
      visibility: hidden !important;
    }

    #${NATIVE_RESTORE_ROOT_ID} {
      position: fixed;
      z-index: 2147483647;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      box-sizing: border-box;
      padding: 24px;
      color: #0f0f0f;
      background: #fff;
      font: 13px/1.4 Roboto, Arial, sans-serif;
    }

    html[dark] #${NATIVE_RESTORE_ROOT_ID} {
      color: #f1f1f1;
      background: #0f0f0f;
    }

    #${NATIVE_RESTORE_ROOT_ID} .ytcq-lite-native-restore-spinner {
      width: 16px;
      height: 16px;
      box-sizing: border-box;
      border: 2px solid color-mix(in srgb, currentColor 24%, transparent);
      border-top-color: currentColor;
      border-radius: 50%;
      animation: ytcq-lite-native-restore-spin 850ms linear infinite;
    }

    @keyframes ytcq-lite-native-restore-spin {
      to { transform: rotate(360deg); }
    }
  `}</style>
  );
  (document.head || document.documentElement).append(style);
}

function consumeNativeRestoreRequest(): NativeRestoreRequest | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(LITE_MODE_NATIVE_RESTORE_KEY);
    window.sessionStorage.removeItem(LITE_MODE_NATIVE_RESTORE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<NativeRestoreRequest>;
    if (
      typeof value.automaticFailure !== 'boolean' ||
      typeof value.message !== 'string' ||
      typeof value.requestedAt !== 'number' ||
      Date.now() - value.requestedAt > DOCUMENT_RELOAD_REQUEST_MAX_AGE_MS
    ) {
      return null;
    }
    const fallbackCode = parseLiteModeFallbackCode(value.fallbackCode);
    return {
      automaticFailure: value.automaticFailure,
      ...(fallbackCode ? { fallbackCode } : {}),
      message: value.message.slice(0, 240),
      requestedAt: value.requestedAt
    };
  } catch {
    return null;
  }
}

function consumeReplayLiteModeStartRequest(): boolean {
  let requestedAt = NaN;
  try {
    requestedAt = Number(window.sessionStorage.getItem(LITE_MODE_REPLAY_START_KEY));
    window.sessionStorage.removeItem(LITE_MODE_REPLAY_START_KEY);
  } catch {
    return false;
  }
  const age = Date.now() - requestedAt;
  return (
    Number.isFinite(requestedAt) &&
    requestedAt > 0 &&
    age >= 0 &&
    age <= DOCUMENT_RELOAD_REQUEST_MAX_AGE_MS
  );
}

function clearReplayLiteModeStartRequest(): void {
  try {
    window.sessionStorage.removeItem(LITE_MODE_REPLAY_START_KEY);
  } catch {
    // A missing session-storage cleanup cannot change the persisted preference.
  }
}

function showNativeRestoreOverlay(message: string): void {
  document.getElementById(NATIVE_RESTORE_ROOT_ID)?.remove();
  const root = el<HTMLDivElement>(
    <div id={NATIVE_RESTORE_ROOT_ID} role="status" aria-live="polite" aria-busy="true">
      <span class="ytcq-lite-native-restore-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
  document.documentElement.append(root);

  let cleaned = false;
  let removalFrames: number[] = [];
  let minimumVisible = false;
  const observer = new MutationObserver(scheduleRemovalWhenNativeReady);
  const minimumTimer = window.setTimeout(() => {
    minimumVisible = true;
    scheduleRemovalWhenNativeReady();
  }, NATIVE_RESTORE_MINIMUM_VISIBLE_MS);
  const timeout = window.setTimeout(cleanup, NATIVE_RESTORE_OVERLAY_TIMEOUT_MS);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleRemovalWhenNativeReady();

  function scheduleRemovalWhenNativeReady(): void {
    // A rapid off-to-on change can start Lite again before native restoration
    // finishes. The active Lite root is then the ready surface for this handoff.
    if (document.querySelector('.ytcq-lite-root')) {
      cleanup();
      return;
    }
    if (!minimumVisible || removalFrames.length || !isNativeChatReady()) return;
    removalFrames.push(
      window.requestAnimationFrame(() => {
        removalFrames.push(window.requestAnimationFrame(cleanup));
      })
    );
  }

  function cleanup(): void {
    if (cleaned) return;
    cleaned = true;
    observer.disconnect();
    window.clearTimeout(minimumTimer);
    window.clearTimeout(timeout);
    removalFrames.forEach((frame) => window.cancelAnimationFrame(frame));
    removalFrames = [];
    root.remove();
  }
}

function isNativeChatReady(): boolean {
  const nativeList = document.querySelector<HTMLElement>(NATIVE_LIST_SELECTOR);
  return Boolean(nativeList?.querySelector(CHAT_SCROLLER_SELECTOR));
}

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync && chrome.storage?.onChanged)
  );
}
