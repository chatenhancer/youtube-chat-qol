/**
 * Enabled Playground backend routes.
 *
 * Add a route module here when a backend capability should be reachable from
 * the worker. The route module itself should live with the feature that owns
 * the behavior, such as `games/replay-trivia/routes.ts`.
 */
import type { RouteModule } from './routes/types';
import { replayTriviaRouteModule } from './games/replay-trivia/routes';
import { healthRouteModule } from './routes/health';
import { streamRoomRouteModule } from './routes/stream-room';

export const ENABLED_ROUTE_MODULES: readonly RouteModule[] = [
  healthRouteModule,
  streamRoomRouteModule,
  replayTriviaRouteModule
];
