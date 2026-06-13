/**
 * Lightweight service health route.
 *
 * This is a static route because it is not tied to a YouTube stream room.
 */
import { createJsonResponse } from '../http';
import { createRouteResult, type RouteContext, type RouteModule, type RouteResult } from './types';

export const healthRouteModule = {
  staticRoutes: [
    {
      handle: handleHealthRoute,
      path: '/health'
    }
  ]
} satisfies RouteModule;

function handleHealthRoute(_context: RouteContext): RouteResult {
  return createRouteResult(createJsonResponse({
    ok: true,
    service: 'chat-enhancer-playground'
  }));
}
