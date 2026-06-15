/**
 * Lookup layer for enabled realtime game modules.
 *
 * `StreamRoom` uses this registry to create games, apply game actions, and
 * serialize private room state into public snapshots without knowing each
 * game's rules.
 */
import type { GameId } from '../protocol/messages';
import { ProtocolError } from '../protocol/validation';
import type { GameModule, GameRecord } from './types';
import { ENABLED_GAME_MODULES } from './enabled-games';

export interface EnabledGameModule {
  gameId: GameId;
  module: GameModule;
}

const ENABLED_MODULES: readonly EnabledGameModule[] = ENABLED_GAME_MODULES;
const GAME_MODULES: Partial<Record<GameId, GameModule>> = Object.fromEntries(
  ENABLED_MODULES.map(({ gameId, module }) => [gameId, module])
) as Partial<Record<GameId, GameModule>>;

export function getGameModule(gameId: GameId): GameModule {
  const module = GAME_MODULES[gameId];
  if (!module) throw new ProtocolError('unsupported_game', 'Unsupported game.');
  return module;
}

export function getGameModuleForRecord(game: GameRecord): GameModule {
  return getGameModule(game.gameType);
}
