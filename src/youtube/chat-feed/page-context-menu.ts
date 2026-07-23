/**
 * Page-world ownership of YouTube's opaque per-message context-menu endpoints.
 *
 * A bounded endpoint map follows the normalized feed actions. When Lite mode
 * asks for a menu by message ID, a short-lived native renderer delegates it to
 * YouTube.
 */
import {
  dispatchYouTubeChatContextMenuResult,
  parseYouTubeChatContextMenuRequest,
  YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT
} from './context-menu';
import type {
  YouTubeChatContextMenuEndpoint,
  YouTubeChatContextMenuEndpointObserver
} from './parser';
import type { YouTubeChatFeedAction } from './protocol';

type NativeContextMenuRenderer = HTMLElement & {
  data?: unknown;
  fetchContextMenu?: () => unknown;
  menuButton?: HTMLElement;
};

export interface YouTubeChatContextMenuPageBridge {
  apply(
    actions: readonly YouTubeChatFeedAction[],
    capturedEndpoints?: ReadonlyMap<string, YouTubeChatContextMenuEndpoint | null>
  ): void;
  clear(): void;
  destroy(): void;
}

const CONTEXT_MENU_OPENED_EVENT = 'yt-live-chat-context-menu-opened';
const CONTEXT_MENU_CLOSED_EVENT = 'yt-live-chat-context-menu-closed';
const CONTEXT_MENU_PROBE_ATTRIBUTE = 'data-ytcq-context-menu-probe';
const MAX_CONTEXT_MENU_ENDPOINTS = 500;

export function createYouTubeChatContextMenuEndpointCapture(): {
  endpoints: Map<string, YouTubeChatContextMenuEndpoint | null>;
  observe: YouTubeChatContextMenuEndpointObserver;
} {
  const endpoints = new Map<string, YouTubeChatContextMenuEndpoint | null>();
  return {
    endpoints,
    observe: (messageId, endpoint) => {
      endpoints.set(messageId, endpoint);
    }
  };
}

export function createYouTubeChatContextMenuPageBridge():
  YouTubeChatContextMenuPageBridge {
  const endpoints = new Map<string, YouTubeChatContextMenuEndpoint>();
  let activeCleanup: (() => void) | null = null;

  const stopActive = (): void => {
    const cleanup = activeCleanup;
    activeCleanup = null;
    cleanup?.();
  };
  const clear = (): void => {
    endpoints.clear();
    stopActive();
  };

  const handleRequest = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const request = parseYouTubeChatContextMenuRequest(event.detail);
    if (!request) return;

    const endpoint = endpoints.get(request.messageId);
    if (!endpoint) {
      dispatchYouTubeChatContextMenuResult(request.requestId, 'unavailable');
      return;
    }

    stopActive();
    activeCleanup = openYouTubeChatContextMenu(
      request.requestId,
      request.messageId,
      endpoint,
      { x: request.x, y: request.y }
    );
  };

  window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, handleRequest);

  return {
    apply(actions, capturedEndpoints): void {
      for (const action of actions) {
        if (action.type === 'reset') {
          clear();
          continue;
        }
        if (action.type === 'remove') {
          endpoints.delete(action.id);
          continue;
        }
        if (action.type !== 'upsert') continue;

        const messageId = action.record.id;
        const endpoint = capturedEndpoints?.get(messageId);
        endpoints.delete(messageId);
        if (endpoint) endpoints.set(messageId, endpoint);
      }
      while (endpoints.size > MAX_CONTEXT_MENU_ENDPOINTS) {
        const oldest = endpoints.keys().next().value;
        if (oldest === undefined) break;
        endpoints.delete(oldest);
      }
    },

    clear,

    destroy(): void {
      window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, handleRequest);
      clear();
    }
  };
}

function openYouTubeChatContextMenu(
  requestId: string,
  messageId: string,
  endpoint: YouTubeChatContextMenuEndpoint,
  point: { x: number; y: number }
): () => void {
  const chat = document.querySelector<HTMLElement>('#chat');
  if (!chat) {
    dispatchYouTubeChatContextMenuResult(requestId, 'unavailable');
    return () => undefined;
  }

  const probe = document.createElement(
    'yt-live-chat-text-message-renderer'
  ) as NativeContextMenuRenderer;
  probe.setAttribute(CONTEXT_MENU_PROBE_ATTRIBUTE, 'true');
  probe.setAttribute('aria-hidden', 'true');
  positionProbe(probe, point);
  probe.data = {
    contextMenuEndpoint: endpoint,
    id: messageId
  };
  chat.append(probe);

  const fetchContextMenu = probe.fetchContextMenu;
  if (typeof fetchContextMenu !== 'function') {
    probe.remove();
    dispatchYouTubeChatContextMenuResult(requestId, 'unavailable');
    return () => undefined;
  }
  // YouTube positions this fixed descendant relative to the renderer host.
  // Applying the viewport point here too doubles the offset.
  if (probe.menuButton) positionProbe(probe.menuButton, { x: 0, y: 0 });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    probe.removeEventListener(CONTEXT_MENU_OPENED_EVENT, handleOpened);
    probe.removeEventListener(CONTEXT_MENU_CLOSED_EVENT, handleClosed);
    probe.remove();
  };
  const finish = (status: 'closed' | 'unavailable'): void => {
    if (cleaned) return;
    dispatchYouTubeChatContextMenuResult(requestId, status);
    cleanup();
  };
  const handleOpened = (): void => {
    if (cleaned) return;
    dispatchYouTubeChatContextMenuResult(requestId, 'opened');
  };
  const handleClosed = (): void => {
    finish('closed');
  };
  probe.addEventListener(CONTEXT_MENU_OPENED_EVENT, handleOpened);
  probe.addEventListener(CONTEXT_MENU_CLOSED_EVENT, handleClosed);

  dispatchYouTubeChatContextMenuResult(requestId, 'opening');
  try {
    Reflect.apply(fetchContextMenu, probe, []);
  } catch {
    finish('unavailable');
    return () => undefined;
  }

  return () => finish('closed');
}

function positionProbe(element: HTMLElement, point: { x: number; y: number }): void {
  const x = Math.min(Math.max(0, point.x), window.innerWidth);
  const y = Math.min(Math.max(0, point.y), window.innerHeight);
  element.style.setProperty('position', 'fixed', 'important');
  element.style.setProperty('inset', 'auto', 'important');
  element.style.setProperty('left', `${Math.round(x)}px`, 'important');
  element.style.setProperty('top', `${Math.round(y)}px`, 'important');
  element.style.setProperty('width', '1px', 'important');
  element.style.setProperty('height', '1px', 'important');
  element.style.setProperty('min-width', '0', 'important');
  element.style.setProperty('min-height', '0', 'important');
  element.style.setProperty('margin', '0', 'important');
  element.style.setProperty('padding', '0', 'important');
  element.style.setProperty('opacity', '0', 'important');
  element.style.setProperty('pointer-events', 'none', 'important');
}
