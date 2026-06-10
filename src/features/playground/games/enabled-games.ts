/**
 * Enabled Playground games.
 *
 * Import a game adapter here when that game should be offered by the Games
 * lobby. This mirrors `content/enabled-features.ts` at the game level:
 * registration is explicit, while individual game modules own rendering and
 * action translation.
 */
import type { GamePanelAdapter } from './adapter';
import { chessGameAdapter } from './chess/adapter';

export const GAME_ADAPTERS: readonly GamePanelAdapter[] = [
  chessGameAdapter
];
