import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseYouTubeChatContextMenuResult,
  YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT,
  YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT
} from './context-menu';
import { createYouTubeChatContextMenuPageBridge } from './page-context-menu';
import type { YouTubeChatContextMenuEndpoint } from './parser';
import type { YouTubeChatFeedAction } from './protocol';

type NativeContextMenuProbe = HTMLElement & {
  data?: {
    contextMenuEndpoint?: YouTubeChatContextMenuEndpoint;
    id?: string;
  };
  fetchContextMenu?: () => void;
};

const endpoint: YouTubeChatContextMenuEndpoint = {
  clickTrackingParams: 'tracking-token',
  commandMetadata: {
    webCommandMetadata: { ignoreNavigation: true }
  },
  liveChatItemContextMenuEndpoint: {
    params: 'opaque-menu-params'
  }
};

describe('YouTube chat context-menu page bridge', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="chat"></div>';
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'fetchContextMenu');
    Reflect.deleteProperty(HTMLElement.prototype, 'menuButton');
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('opens YouTube through a positioned temporary renderer and cleans it on close', () => {
    const results: string[] = [];
    const fetchContextMenu = vi.fn(function (this: NativeContextMenuProbe) {
      expect(this.data).toEqual({
        contextMenuEndpoint: endpoint,
        id: 'message-1'
      });
      this.dispatchEvent(new CustomEvent('yt-live-chat-context-menu-opened'));
    });
    Object.defineProperty(HTMLElement.prototype, 'fetchContextMenu', {
      configurable: true,
      value: fetchContextMenu
    });
    Object.defineProperty(HTMLElement.prototype, 'menuButton', {
      configurable: true,
      get: function (this: HTMLElement) {
        if (this.tagName.toLowerCase() !== 'yt-live-chat-text-message-renderer') {
          return undefined;
        }
        const existing = this.querySelector<HTMLElement>('[data-native-menu-button]');
        if (existing) return existing;
        const button = document.createElement('button');
        button.dataset.nativeMenuButton = 'true';
        this.append(button);
        return button;
      }
    });
    const resultListener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const result = parseYouTubeChatContextMenuResult(event.detail);
      if (result?.requestId === 'request-1') results.push(result.status);
    };
    window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, resultListener);
    const bridge = createYouTubeChatContextMenuPageBridge();
    bridge.apply([upsertAction('message-1')], new Map([['message-1', endpoint]]));

    dispatchRequest('request-1', 'message-1', 120, 240);

    const probe = document.querySelector<NativeContextMenuProbe>(
      '[data-ytcq-context-menu-probe]'
    );
    expect(fetchContextMenu).toHaveBeenCalledOnce();
    expect(results).toEqual(['opening', 'opened']);
    expect(probe?.style.getPropertyValue('position')).toBe('fixed');
    expect(probe?.style.getPropertyValue('left')).toBe('120px');
    expect(probe?.style.getPropertyValue('top')).toBe('240px');
    const nativeMenuButton = probe?.querySelector<HTMLElement>('[data-native-menu-button]');
    expect(nativeMenuButton?.style.getPropertyValue('left')).toBe('0px');
    expect(nativeMenuButton?.style.getPropertyValue('top')).toBe('0px');

    probe?.dispatchEvent(new CustomEvent('yt-live-chat-context-menu-closed'));
    expect(results).toEqual(['opening', 'opened', 'closed']);
    expect(document.querySelector('[data-ytcq-context-menu-probe]')).toBeNull();

    bridge.destroy();
    window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, resultListener);
  });

  it('waits for YouTube lifecycle events without local open or cleanup deadlines', async () => {
    vi.useFakeTimers();
    const results: string[] = [];
    Object.defineProperty(HTMLElement.prototype, 'fetchContextMenu', {
      configurable: true,
      value: vi.fn()
    });
    const resultListener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const result = parseYouTubeChatContextMenuResult(event.detail);
      if (result?.requestId === 'request-1') results.push(result.status);
    };
    window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, resultListener);
    const bridge = createYouTubeChatContextMenuPageBridge();

    try {
      bridge.apply([upsertAction('message-1')], new Map([['message-1', endpoint]]));
      dispatchRequest('request-1', 'message-1', 1, 2);
      const probe = document.querySelector<NativeContextMenuProbe>(
        '[data-ytcq-context-menu-probe]'
      );

      await vi.advanceTimersByTimeAsync(5_000);
      expect(results).toEqual(['opening']);
      expect(probe?.isConnected).toBe(true);

      probe?.dispatchEvent(new CustomEvent('yt-live-chat-context-menu-opened'));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(results).toEqual(['opening', 'opened']);
      expect(probe?.isConnected).toBe(true);

      probe?.dispatchEvent(new CustomEvent('yt-live-chat-context-menu-closed'));
      expect(results).toEqual(['opening', 'opened', 'closed']);
      expect(probe?.isConnected).toBe(false);
    } finally {
      bridge.destroy();
      window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, resultListener);
    }
  });

  it('returns unavailable for unknown and removed message IDs', () => {
    const results: string[] = [];
    const resultListener = (event: Event): void => {
      if (!(event instanceof CustomEvent)) return;
      const result = parseYouTubeChatContextMenuResult(event.detail);
      if (result) results.push(result.status);
    };
    window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, resultListener);
    const bridge = createYouTubeChatContextMenuPageBridge();
    bridge.apply([upsertAction('message-1')], new Map([['message-1', endpoint]]));
    bridge.apply([{ id: 'message-1', type: 'remove' }]);

    dispatchRequest('request-1', 'message-1', 1, 2);

    expect(results).toEqual(['unavailable']);
    bridge.destroy();
    window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, resultListener);
  });
});

function dispatchRequest(
  requestId: string,
  messageId: string,
  x: number,
  y: number
): void {
  window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, {
    detail: JSON.stringify({
      messageId,
      requestId,
      x,
      y
    })
  }));
}

function upsertAction(messageId: string): YouTubeChatFeedAction {
  return {
    record: {
      id: messageId,
      kind: 'text',
      plainText: 'Message',
      runs: [{ text: 'Message', type: 'text' }]
    },
    type: 'upsert'
  };
}
