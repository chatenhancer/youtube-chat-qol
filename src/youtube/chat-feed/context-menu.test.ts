import { afterEach, describe, expect, it } from 'vitest';
import {
  dispatchYouTubeChatContextMenuResult,
  parseYouTubeChatContextMenuRequest,
  parseYouTubeChatContextMenuResult,
  requestYouTubeChatContextMenu,
  YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT
} from './context-menu';

const requestListeners: EventListener[] = [];

afterEach(() => {
  requestListeners.splice(0).forEach((listener) => {
    window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, listener);
  });
});

describe('YouTube chat context-menu boundary', () => {
  it('accepts only a synchronously handled JSON request and follows its lifecycle', () => {
    const statuses: string[] = [];
    let requestId = '';
    const listener: EventListener = (event) => {
      if (!(event instanceof CustomEvent)) return;
      const request = parseYouTubeChatContextMenuRequest(event.detail);
      if (!request) return;
      requestId = request.requestId;
      expect(request).toMatchObject({
        messageId: 'message-1',
        x: 120,
        y: 240
      });
      dispatchYouTubeChatContextMenuResult(request.requestId, 'opening');
    };
    requestListeners.push(listener);
    window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, listener);

    const cleanup = requestYouTubeChatContextMenu(
      'message-1',
      { x: 120, y: 240 },
      (status) => statuses.push(status)
    );
    expect(cleanup).toEqual(expect.any(Function));
    expect(statuses).toEqual(['opening']);

    dispatchYouTubeChatContextMenuResult(requestId, 'opened');
    dispatchYouTubeChatContextMenuResult(requestId, 'closed');
    dispatchYouTubeChatContextMenuResult(requestId, 'opened');
    expect(statuses).toEqual(['opening', 'opened', 'closed']);
  });

  it('returns null when the page does not keep the request open', () => {
    expect(requestYouTubeChatContextMenu(
      'message-1',
      { x: 0, y: 0 },
      () => undefined
    )).toBeNull();

    const listener: EventListener = (event) => {
      if (!(event instanceof CustomEvent)) return;
      const request = parseYouTubeChatContextMenuRequest(event.detail);
      if (request) dispatchYouTubeChatContextMenuResult(request.requestId, 'unavailable');
    };
    requestListeners.push(listener);
    window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, listener);

    expect(requestYouTubeChatContextMenu(
      'missing-message',
      { x: 0, y: 0 },
      () => undefined
    )).toBeNull();
  });

  it('preserves opaque message IDs without imposing a local length limit', () => {
    const messageId = `message-${'m'.repeat(300)}`;
    const requestId = `request-${'r'.repeat(300)}`;

    expect(parseYouTubeChatContextMenuRequest(JSON.stringify({
      messageId,
      requestId,
      x: 1,
      y: 2
    }))).toEqual({ messageId, requestId, x: 1, y: 2 });
  });

  it('rejects malformed request and result details', () => {
    expect(parseYouTubeChatContextMenuRequest({
      messageId: 'message-1',
      requestId: 'request-1',
      x: 1,
      y: 2
    })).toBeNull();
    expect(parseYouTubeChatContextMenuRequest(JSON.stringify({
      messageId: '',
      requestId: 'request-1',
      x: 1,
      y: 2
    }))).toBeNull();
    expect(parseYouTubeChatContextMenuResult(JSON.stringify({
      requestId: 'request-1',
      status: 'report'
    }))).toBeNull();
  });
});
