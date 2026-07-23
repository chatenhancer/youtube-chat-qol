import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginLiteModeDocumentSession,
  consumeLiteModeFallbackNotice,
  hasLiteModeSessionCooldown,
  isSupportedLiteModePage,
  LITE_MODE_NATIVE_RESTORE_KEY,
  LITE_MODE_SESSION_COOLDOWN_KEY,
  requestNativeChatRestore
} from './bootstrap';

afterEach(async () => {
  window.sessionStorage.clear();
  await chrome.storage.sync.remove('liteModeEnabled');
  document.documentElement.removeAttribute('data-ytcq-lite-fallback-notice');
  document.documentElement.removeAttribute('data-ytcq-lite-mode-intent');
  vi.useRealTimers();
});

describe('Lite mode document-start bootstrap', () => {
  it('allows regular YouTube live/replay chat but never YouTube Studio', () => {
    expect(isSupportedLiteModePage(createLocation('www.youtube.com', '/live_chat'))).toBe(true);
    expect(isSupportedLiteModePage(createLocation('www.youtube.com', '/live_chat_replay'))).toBe(true);
    expect(isSupportedLiteModePage(createLocation('studio.youtube.com', '/live_chat'))).toBe(false);
    expect(isSupportedLiteModePage(createLocation('www.youtube.com', '/watch'))).toBe(false);
  });

  it('does not carry an automatic fallback cooldown across a document reload', () => {
    window.sessionStorage.setItem(LITE_MODE_SESSION_COOLDOWN_KEY, 'true');
    expect(hasLiteModeSessionCooldown()).toBe(true);

    beginLiteModeDocumentSession();

    expect(hasLiteModeSessionCooldown()).toBe(false);
  });

  it('preserves the cooldown only for an extension-initiated recovery reload', () => {
    beginLiteModeDocumentSession(true);
    expect(hasLiteModeSessionCooldown()).toBe(true);

    beginLiteModeDocumentSession();
    expect(hasLiteModeSessionCooldown()).toBe(false);
  });

  it('stores a bounded restore request before scheduling the chat-frame reload', () => {
    vi.useFakeTimers();
    requestNativeChatRestore({
      automaticFailure: true,
      fallbackCode: 'LM06',
      message: 'Loading chat'
    });

    const stored = JSON.parse(window.sessionStorage.getItem(LITE_MODE_NATIVE_RESTORE_KEY) || '{}');
    expect(stored).toMatchObject({
      automaticFailure: true,
      fallbackCode: 'LM06',
      message: 'Loading chat'
    });
    expect(stored.requestedAt).toEqual(expect.any(Number));
  });

  it('consumes a post-reload fallback notice once', () => {
    document.documentElement.setAttribute('data-ytcq-lite-fallback-notice', 'LM06');
    expect(consumeLiteModeFallbackNotice()).toBe('LM06');
    expect(consumeLiteModeFallbackNotice()).toBeNull();
  });
});

function createLocation(hostname: string, pathname: string): Location {
  return { hostname, pathname } as Location;
}
