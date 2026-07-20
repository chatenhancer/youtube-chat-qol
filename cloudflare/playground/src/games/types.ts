/**
 * Contract implemented by realtime game modules.
 *
 * The Durable Object stores generic `GameRecord` values and delegates all
 * game-specific rules, visibility, recipients, and public serialization to the
 * owning game module.
 */
import type {
  GameId,
  PlaygroundUserLanguage,
  PublicGame,
  PublicUserIdentity,
  ServerMessage
} from '../protocol/messages';

export interface GameRecord {
  gameId: string;
  gameType: GameId;
  gameVersion: number;
  status: string;
}

export interface GameActionInput {
  action: string;
  payload?: Record<string, unknown>;
  userId: string;
}

export interface GameActionRateLimitInput {
  action: string;
  game: GameRecord;
  payload?: Record<string, unknown>;
}

export interface GameGenerationTokenInput {
  now: number;
  userId: string;
}

export interface GameGenerationTokenGrant {
  expiresAt: number;
  tokenPrefix?: string;
}

export interface GameGenerationTokenMessageInput {
  expiresAt: number;
  gameId: string;
  generationToken: string;
}

export interface PublicGameContext {
  getUserLanguage?: (userId: string) => PlaygroundUserLanguage;
  recipientUserId?: string;
}

export type GameStatePersistence = 'deferred' | 'immediate';

export interface GameStatePersistenceInput {
  action: GameActionInput;
  nextGame: GameRecord;
  previousGame: GameRecord;
}

export interface GameModule {
  createGame(gameId: string, playerUserIds: [string, string]): GameRecord;
  applyAction(game: GameRecord, input: GameActionInput): GameRecord;
  canUserAccessGame(game: GameRecord, userId: string): boolean;
  createGenerationToken?(game: GameRecord, input: GameGenerationTokenInput): GameGenerationTokenGrant;
  createGenerationTokenMessage?(input: GameGenerationTokenMessageInput): ServerMessage;
  getActionRateCost?(input: GameActionRateLimitInput): number | null | undefined;
  getRecipientUserIds(game: GameRecord): string[];
  getStatePersistence?(input: GameStatePersistenceInput): GameStatePersistence;
  getWinnerUserId?(game: GameRecord): string | null;
  isTerminal(game: GameRecord): boolean;
  /** Validates the complete persisted record before it is restored. */
  isStoredGameRecord(value: unknown): value is GameRecord;
  toPublicGame(game: GameRecord, getUser: (userId: string) => PublicUserIdentity, context?: PublicGameContext): PublicGame;
  validateGenerationToken?(game: GameRecord, input: GameGenerationTokenInput): void;
}
