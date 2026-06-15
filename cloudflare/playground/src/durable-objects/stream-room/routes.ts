/**
 * HTTP routes backed by the stream Durable Object.
 *
 * `snapshot` and `socket` are transport/lobby entrypoints. They forward the
 * sanitized stream key to `StreamRoom`, which owns presence, invites, and
 * realtime game state.
 */
import { createErrorResponse, isWebSocketUpgrade } from '../../http';
import { getLogErrorType, hashLogValue, logPlaygroundEvent } from '../../logging';
import { createRouteResult, type RouteModule, type RouteResult, type StreamRouteContext } from '../../routes/types';
import { connectComputerPlayer } from '../computer-player/client';
import { forwardStreamRoomRequest } from './client';

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

  if (endpoint === 'socket') await connectComputerPlayerWithLogging(env, streamKey);

  let response: Response;
  try {
    response = await forwardStreamRoomRequest(env, streamKey, request, {
      stripClientDisplayName: true
    });
    logPlaygroundEvent('room_fetch_succeeded', {
      endpoint,
      room: hashLogValue(streamKey),
      status: response.status
    });
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

async function connectComputerPlayerWithLogging(env: StreamRouteContext['env'], streamKey: string): Promise<void> {
  try {
    const response = await connectComputerPlayer(env, streamKey);
    if (!response.ok) {
      logPlaygroundEvent('computer_player_start_failed', {
        errorMessage: `Computer player returned status ${response.status}.`,
        room: hashLogValue(streamKey),
        status: response.status
      }, 'warn');
      return;
    }

    logPlaygroundEvent('computer_player_start_succeeded', {
      room: hashLogValue(streamKey),
      status: response.status
    });
  } catch (error) {
    logPlaygroundEvent('computer_player_start_failed', {
      errorMessage: getRouteErrorMessage(error),
      errorType: getLogErrorType(error),
      room: hashLogValue(streamKey)
    }, 'warn');
  }
}

function getRouteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= 180) return message;
  return `${message.slice(0, 177)}...`;
}
