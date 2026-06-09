import { chessGameModule } from './chess';
import type { GameId } from '../protocol/messages';
import { ProtocolError } from '../protocol/validation';
import type { GameModule, GameRecord } from './types';

const GAME_MODULES: Record<GameId, GameModule> = {
  chess: chessGameModule
};

export function getGameModule(gameId: GameId): GameModule {
  return GAME_MODULES[gameId];
}

export function getGameModuleForRecord(game: GameRecord): GameModule {
  const module = GAME_MODULES[game.gameType];
  if (!module) throw new ProtocolError('unsupported_game', 'Unsupported game.');
  return module;
}
