/**
 * Generic backend route dispatcher.
 *
 * Backend capabilities expose route modules, and `routes/enabled-routes.ts` decides
 * which ones are active. Static routes match exact paths; stream routes share
 * `/v1/streams/:streamKey/...` and receive the sanitized stream key.
 */
import { ENABLED_ROUTE_MODULES } from './routes/enabled-routes';
import { createErrorResponse } from './http';
import { getLogErrorMessage, getLogErrorType, logPlaygroundEvent } from './logging';
import { sanitizeStreamKey } from './protocol/validation';
import {
  createRouteResult,
  type RouteResult,
  type StaticRouteDefinition,
  type StreamRouteDefinition
} from './routes/types';
import type { Env } from './types';

const STREAM_ROUTE_PATTERN = /^\/v1\/streams\/([^/]+)\/(.+)$/;
const STATIC_ROUTES: readonly StaticRouteDefinition[] = ENABLED_ROUTE_MODULES
  .flatMap((routeModule) => routeModule.staticRoutes || []);
const STREAM_ROUTES: readonly StreamRouteDefinition[] = ENABLED_ROUTE_MODULES
  .flatMap((routeModule) => routeModule.streamRoutes || []);

export async function handlePlaygroundRoute(request: Request, env: Env): Promise<RouteResult> {
  const url = new URL(request.url);
  const routeContext = { env, request };
  const staticRoute = STATIC_ROUTES.find((route) => route.path === url.pathname);
  if (staticRoute) return staticRoute.handle(routeContext);

  const streamMatch = STREAM_ROUTE_PATTERN.exec(url.pathname);
  if (!streamMatch) return createRouteResult(createErrorResponse('not_found', 'Not found.', 404));

  const route = STREAM_ROUTES.find((candidate) => candidate.path === streamMatch[2]);
  if (!route) return createRouteResult(createErrorResponse('not_found', 'Not found.', 404));

  const streamKey = getSanitizedStreamKey(streamMatch[1], route.name);
  if (streamKey instanceof Response) return createRouteResult(streamKey);

  return route.handle({
    ...routeContext,
    streamKey
  });
}

function getSanitizedStreamKey(rawStreamKey: string, routeName: string): string | Response {
  try {
    return sanitizeStreamKey(decodeURIComponent(rawStreamKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid stream key.';
    logPlaygroundEvent('invalid_stream_key', {
      endpoint: routeName,
      errorMessage: getLogErrorMessage(error),
      errorType: getLogErrorType(error)
    }, 'warn');
    return createErrorResponse('invalid_stream', message, 400);
  }
}
