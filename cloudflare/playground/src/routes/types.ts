/**
 * Shared route contracts for the backend router.
 *
 * Route modules return a `RouteResult` so the Worker entrypoint can decide
 * whether to add CORS headers. WebSocket upgrade responses intentionally skip
 * that wrapping.
 */
import type { Env } from '../types';

export type RouteResult = {
  applyCors: boolean;
  response: Response;
};

export type RouteContext = {
  env: Env;
  request: Request;
};

export type StreamRouteContext = RouteContext & {
  streamKey: string;
};

export type StaticRouteDefinition = {
  handle: (context: RouteContext) => Promise<RouteResult> | RouteResult;
  path: string;
};

export type StreamRouteDefinition = {
  handle: (context: StreamRouteContext) => Promise<RouteResult> | RouteResult;
  name: string;
  path: string;
};

export type RouteModule = {
  staticRoutes?: StaticRouteDefinition[];
  streamRoutes?: StreamRouteDefinition[];
};

export function createRouteResult(response: Response, applyCors = true): RouteResult {
  return {
    applyCors,
    response
  };
}
