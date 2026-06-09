import { StreamRoom } from './durable-objects/stream-room';
import {
  createCorsHeaders,
  createErrorResponse,
  createJsonResponse,
  createOptionsResponse,
  isAllowedOrigin,
  isWebSocketUpgrade
} from './http';
import { getLogErrorType, hashLogValue, logPlaygroundEvent } from './logging';
import { sanitizeStreamKey } from './protocol/validation';
import type { Env } from './types';

export { StreamRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return createOptionsResponse(request, env);

    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin, env)) {
      logPlaygroundEvent('origin_rejected', {
        origin: origin ? hashLogValue(origin) : 'none'
      }, 'warn');
      return withCors(createErrorResponse('origin_not_allowed', 'This origin is not allowed.', 403), request, env);
    }

    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return withCors(createJsonResponse({
        ok: true,
        service: 'chat-enhancer-playground'
      }), request, env);
    }

    const route = /^\/v1\/streams\/([^/]+)\/(snapshot|socket)$/.exec(url.pathname);
    if (!route) return withCors(createErrorResponse('not_found', 'Not found.', 404), request, env);

    let streamKey = '';
    try {
      streamKey = sanitizeStreamKey(decodeURIComponent(route[1]));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid stream key.';
      logPlaygroundEvent('invalid_stream_key', {
        endpoint: route[2],
        errorType: getLogErrorType(error)
      }, 'warn');
      return withCors(createErrorResponse('invalid_stream', message, 400), request, env);
    }

    const endpoint = route[2];
    if (endpoint === 'socket' && !isWebSocketUpgrade(request)) {
      logPlaygroundEvent('websocket_upgrade_missing', {
        room: hashLogValue(streamKey)
      }, 'warn');
      return withCors(createErrorResponse('websocket_required', 'Expected WebSocket upgrade.', 426), request, env);
    }

    if (endpoint === 'snapshot' && request.method !== 'GET') {
      logPlaygroundEvent('method_not_allowed', {
        method: request.method,
        room: hashLogValue(streamKey)
      }, 'warn');
      return withCors(createErrorResponse('method_not_allowed', 'Only GET is supported.', 405), request, env);
    }

    const durableObjectId = env.STREAM_ROOMS.idFromName(streamKey);
    const room = env.STREAM_ROOMS.get(durableObjectId);
    const headers = new Headers(request.headers);
    headers.set('X-Chat-Enhancer-Stream-Key', streamKey);
    const roomRequest = new Request(request, { headers });
    let response: Response;
    try {
      response = await room.fetch(roomRequest);
    } catch (error) {
      logPlaygroundEvent('room_fetch_failed', {
        endpoint,
        errorType: getLogErrorType(error),
        room: hashLogValue(streamKey)
      }, 'error');
      throw error;
    }

    if (endpoint === 'socket') return response;
    return withCors(response, request, env);
  }
};

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  createCorsHeaders(request, env).forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}
