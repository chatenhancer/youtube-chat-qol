/**
 * Enabled Playground backend routes.
 *
 * Add a route module here when a backend capability should be reachable from
 * the worker. The route module itself should live with the feature that owns
 * the behavior, such as `games/replay-trivia/routes.ts`.
 */
import { streamRoomRouteModule } from '../durable-objects/stream-room/routes';
import { playerStatsRouteModule } from '../durable-objects/player-stats/routes';
import { replayTriviaRouteModule } from '../games/replay-trivia/routes';
import { healthRouteModule } from './health';
import type { RouteModule } from './types';

export const ENABLED_ROUTE_MODULES: readonly RouteModule[] = [
  healthRouteModule,
  playerStatsRouteModule,
  streamRoomRouteModule,
  replayTriviaRouteModule
];
