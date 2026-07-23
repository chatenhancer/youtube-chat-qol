/** JSON-only boundary for opening YouTube's page-owned message menu. */

export const YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT =
  'ytcq:lite-chat-context-menu-request';
export const YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT =
  'ytcq:lite-chat-context-menu-result';

export type YouTubeChatContextMenuStatus =
  | 'opening'
  | 'opened'
  | 'closed'
  | 'unavailable';

export interface YouTubeChatContextMenuRequest {
  messageId: string;
  requestId: string;
  x: number;
  y: number;
}

let nextContextMenuRequestId = 0;

export function requestYouTubeChatContextMenu(
  messageId: string,
  point: { x: number; y: number },
  onStatus: (status: YouTubeChatContextMenuStatus) => void
): (() => void) | null {
  if (
    !isNonEmptyString(messageId) ||
    !isViewportCoordinate(point.x) ||
    !isViewportCoordinate(point.y)
  ) {
    return null;
  }

  nextContextMenuRequestId += 1;
  const requestId =
    `${Date.now().toString(36)}-${nextContextMenuRequestId.toString(36)}`;
  let handled = false;
  let terminal = false;
  const stopListening = (): void => {
    window.removeEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, handleResult);
  };
  const handleResult = (event: Event): void => {
    if (!(event instanceof CustomEvent)) return;
    const result = parseYouTubeChatContextMenuResult(event.detail);
    if (!result || result.requestId !== requestId) return;

    handled = true;
    terminal = result.status === 'closed' || result.status === 'unavailable';
    onStatus(result.status);
    if (terminal) stopListening();
  };

  window.addEventListener(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, handleResult);
  window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_CONTEXT_MENU_REQUEST_EVENT, {
    detail: JSON.stringify({
      messageId,
      requestId,
      x: point.x,
      y: point.y
    })
  }));

  if (!handled || terminal) {
    stopListening();
    return null;
  }
  return stopListening;
}

export function parseYouTubeChatContextMenuRequest(
  value: unknown
): YouTubeChatContextMenuRequest | null {
  const record = parseJsonRecord(value);
  if (
    !record ||
    !isNonEmptyString(record.requestId) ||
    !isNonEmptyString(record.messageId) ||
    !isViewportCoordinate(record.x) ||
    !isViewportCoordinate(record.y)
  ) {
    return null;
  }
  return {
    messageId: record.messageId,
    requestId: record.requestId,
    x: record.x,
    y: record.y
  };
}

export function parseYouTubeChatContextMenuResult(
  value: unknown
): { requestId: string; status: YouTubeChatContextMenuStatus } | null {
  const record = parseJsonRecord(value);
  if (
    !record ||
    !isNonEmptyString(record.requestId) ||
    !isYouTubeChatContextMenuStatus(record.status)
  ) {
    return null;
  }
  return { requestId: record.requestId, status: record.status };
}

export function dispatchYouTubeChatContextMenuResult(
  requestId: string,
  status: YouTubeChatContextMenuStatus
): void {
  window.dispatchEvent(new CustomEvent(YOUTUBE_CHAT_CONTEXT_MENU_RESULT_EVENT, {
    detail: JSON.stringify({ requestId, status })
  }));
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isViewportCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isYouTubeChatContextMenuStatus(
  value: unknown
): value is YouTubeChatContextMenuStatus {
  return value === 'opening' ||
    value === 'opened' ||
    value === 'closed' ||
    value === 'unavailable';
}
