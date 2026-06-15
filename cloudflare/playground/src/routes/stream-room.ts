/**
 * HTTP routes backed by the stream Durable Object.
 *
 * `snapshot` and `socket` are transport/lobby entrypoints. They forward the
 * sanitized stream key to `StreamRoom`, which owns presence, invites, and
 * realtime game state.
 */
import { createErrorResponse, isWebSocketUpgrade } from '../http';
import { getLogErrorType, hashLogValue, logPlaygroundEvent } from '../logging';
import { createRouteResult, type RouteModule, type RouteResult, type StreamRouteContext } from './types';

export const streamRoomRouteModule = {
  streamRoutes: [
    {
      handle: handleStreamSnapshotRoute,
      name: 'snapshot',
      path: 'snapshot'
    },
    {
      handle: handleStreamSocketRoute,
      name: 'socket',
      path: 'socket'
    }
  ]
} satisfies RouteModule;

function handleStreamSnapshotRoute(context: StreamRouteContext): Promise<RouteResult> {
  return handleStreamRoomRoute(context, 'snapshot');
}

function handleStreamSocketRoute(context: StreamRouteContext): Promise<RouteResult> {
  return handleStreamRoomRoute(context, 'socket');
}

async function handleStreamRoomRoute(
  { env, request, streamKey }: StreamRouteContext,
  endpoint: 'snapshot' | 'socket'
): Promise<RouteResult> {
  if (endpoint === 'socket' && !isWebSocketUpgrade(request)) {
    logPlaygroundEvent('websocket_upgrade_missing', {
      room: hashLogValue(streamKey)
    }, 'warn');
    return createRouteResult(createErrorResponse('websocket_required', 'Expected WebSocket upgrade.', 426));
  }

  if (endpoint === 'snapshot' && request.method !== 'GET') {
    logPlaygroundEvent('method_not_allowed', {
      method: request.method,
      room: hashLogValue(streamKey)
    }, 'warn');
    return createRouteResult(createErrorResponse('method_not_allowed', 'Only GET is supported.', 405));
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
      errorMessage: getRouteErrorMessage(error),
      errorType: getLogErrorType(error),
      room: hashLogValue(streamKey)
    }, 'error');
    throw error;
  }

  return createRouteResult(response, endpoint !== 'socket');
}

function getRouteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= 180) return message;
  return `${message.slice(0, 177)}...`;
}
