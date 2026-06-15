import { createErrorResponse } from '../../http';
import { createRouteResult, type RouteContext, type RouteModule, type RouteResult } from '../../routes/types';
import { getPlayerStatsResponse } from './client';

export const PLAYER_STATS_ROUTE = '/v1/player-stats';

export const playerStatsRouteModule = {
  staticRoutes: [
    {
      handle: handlePlayerStatsRoute,
      path: PLAYER_STATS_ROUTE
    }
  ]
} satisfies RouteModule;

async function handlePlayerStatsRoute({ env, request }: RouteContext): Promise<RouteResult> {
  if (request.method !== 'GET') {
    return createRouteResult(createErrorResponse('method_not_allowed', 'Only GET is supported.', 405));
  }

  const userId = new URL(request.url).searchParams.get('userId') || '';
  if (!isValidUserId(userId)) {
    return createRouteResult(createErrorResponse('invalid_user', 'userId is required.', 400));
  }
  return createRouteResult(await getPlayerStatsResponse(env, userId));
}

function isValidUserId(userId: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(userId);
}
