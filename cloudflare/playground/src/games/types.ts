/**
 * Contract implemented by realtime game modules.
 *
 * The Durable Object stores generic `GameRecord` values and delegates all
 * game-specific rules, visibility, recipients, and public serialization to the
 * owning game module.
 */
import type { GameId, PlaygroundUserLanguage, PublicGame, PublicUserIdentity } from '../protocol/messages';

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

export interface GameGenerationTokenInput {
  now: number;
  userId: string;
}

export interface GameGenerationTokenGrant {
  expiresAt: number;
}

export interface PublicGameContext {
  getUserLanguage?: (userId: string) => PlaygroundUserLanguage;
  recipientUserId?: string;
}

export interface GameModule {
  createGame(gameId: string, playerUserIds: [string, string]): GameRecord;
  applyAction(game: GameRecord, input: GameActionInput): GameRecord;
  canUserAccessGame(game: GameRecord, userId: string): boolean;
  createGenerationToken?(game: GameRecord, input: GameGenerationTokenInput): GameGenerationTokenGrant;
  getRecipientUserIds(game: GameRecord): string[];
  getWinnerUserId?(game: GameRecord): string | null;
  toPublicGame(game: GameRecord, getUser: (userId: string) => PublicUserIdentity, context?: PublicGameContext): PublicGame;
  validateGenerationToken?(game: GameRecord, input: GameGenerationTokenInput): void;
}
