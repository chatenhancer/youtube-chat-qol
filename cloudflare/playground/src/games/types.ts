import type { GameId, PublicGame, PublicUserIdentity } from '../protocol/messages';

export interface GameRecord {
  gameId: string;
  gameType: GameId;
  status: string;
}

export interface GameActionInput {
  action: string;
  payload?: Record<string, unknown>;
  userId: string;
}

export interface GameModule {
  createGame(gameId: string, playerUserIds: [string, string]): GameRecord;
  applyAction(game: GameRecord, input: GameActionInput): GameRecord;
  canUserAccessGame(game: GameRecord, userId: string): boolean;
  getRecipientUserIds(game: GameRecord): string[];
  toPublicGame(game: GameRecord, getUser: (userId: string) => PublicUserIdentity): PublicGame;
}
