/**
 * Server-owned computer player decision logic.
 *
 * This module is intentionally transport-free. It chooses actions for built-in
 * bot users; `computer-player.ts` owns scheduling and room integration.
 */
import {
  getStockfishBestMove,
  type StockfishBestMoveProvider,
  type StockfishResult
} from '../stockfish-container/client';
import type { ChessGameRecord, ChessMoveInput } from '../../games/chess';
import type { PublicChessGame } from '../../games/chess';
import {
  type PublicReplayTriviaGame,
  REPLAY_TRIVIA_ANSWER_TIME_MS,
  REPLAY_TRIVIA_QUESTION_READ_MS
} from '../../games/replay-trivia';
import type { GameActionInput, GameRecord } from '../../games/types';
import type { GameId, PublicGame } from '../../protocol/messages';

type ChoiceIndex = 0 | 1 | 2 | 3;
type ChessBotMove = Pick<ChessMoveInput, 'from' | 'promotion' | 'to'>;
type ChessBotStockfishFailureReason = 'stockfish_error' | 'stockfish_no_move';

export interface ChessBotStockfishFailure {
  error?: unknown;
  reason: ChessBotStockfishFailureReason;
}

export interface ComputerActionCallbacks {
  onChessBotStockfishFailure?(failure: ChessBotStockfishFailure): void;
  onChessBotStockfishMove?(result: StockfishResult): void;
}

export interface ComputerActionOptions extends ComputerActionCallbacks {
  getStockfishBestMove?: StockfishBestMoveProvider;
  now?: number;
  random?: () => number;
}

export const COMPUTER_PLAYER_CONNECTION_ID = 'server:computer';
export const COMPUTER_PLAYER_USER_ID = 'server:computer';
export const COMPUTER_PLAYER_DISPLAY_NAME = 'Computer';
export const COMPUTER_PLAYER_AVAILABLE_GAMES: readonly GameId[] = ['chess', 'replay-trivia'];

const CHESS_RESPONSE_MIN_DELAY_MS = 700;
const CHESS_RESPONSE_MAX_DELAY_MS = 1_500;
const TRIVIA_RESPONSE_MIN_DELAY_MS = 1_800;
const TRIVIA_RESPONSE_MAX_DELAY_MS = 5_500;
const TRIVIA_BOT_ANSWER_ACCURACY = 0.65;

export function shouldComputerPlayerAct(game: GameRecord, userId = COMPUTER_PLAYER_USER_ID, now = Date.now()): boolean {
  if (!hasPlayer(game, userId)) return false;

  switch (game.gameType) {
    case 'chess':
      return isChessTurnForPlayer(game, userId);
    case 'replay-trivia':
      return isReplayTriviaAnswerNeeded(game, userId, now);
    default:
      return false;
  }
}

export function getComputerPlayerActionDelayMs(game: GameRecord, random = Math.random): number {
  switch (game.gameType) {
    case 'chess':
      return getRandomDelay(CHESS_RESPONSE_MIN_DELAY_MS, CHESS_RESPONSE_MAX_DELAY_MS, random);
    case 'replay-trivia':
      return getRandomDelay(TRIVIA_RESPONSE_MIN_DELAY_MS, TRIVIA_RESPONSE_MAX_DELAY_MS, random);
    default:
      return 0;
  }
}

export function createComputerPlayerAction(
  game: GameRecord,
  options: ComputerActionOptions = {}
): Promise<GameActionInput | null> | GameActionInput | null {
  switch (game.gameType) {
    case 'chess':
      return createStockfishChessBotAction(
        game,
        COMPUTER_PLAYER_USER_ID,
        options.onChessBotStockfishFailure,
        options.onChessBotStockfishMove,
        options.getStockfishBestMove
      );
    case 'replay-trivia':
      return createReplayTriviaBotAnswerAction(
        game,
        COMPUTER_PLAYER_USER_ID,
        options.random,
        options.now
      );
    default:
      return null;
  }
}

export function shouldComputerPlayerActFromPublicGame(
  game: PublicGame,
  userId: string,
  now = Date.now()
): boolean {
  switch (game.gameType) {
    case 'chess':
      return isPublicChessTurnForPlayer(game as PublicChessGame, userId);
    case 'replay-trivia':
      return isPublicReplayTriviaAnswerNeeded(game as PublicReplayTriviaGame, userId, now);
    default:
      return false;
  }
}

export function createComputerPlayerActionFromPublicGame(
  game: PublicGame,
  userId: string,
  options: ComputerActionOptions = {}
): Promise<GameActionInput | null> | GameActionInput | null {
  switch (game.gameType) {
    case 'chess':
      return createStockfishChessBotAction(
        toChessGameRecord(game as PublicChessGame),
        userId,
        options.onChessBotStockfishFailure,
        options.onChessBotStockfishMove,
        options.getStockfishBestMove
      );
    case 'replay-trivia':
      return createPublicReplayTriviaBotAnswerAction(
        game as PublicReplayTriviaGame,
        userId,
        options.random,
        options.now
      );
    default:
      return null;
  }
}

export async function createStockfishChessBotAction(
  game: GameRecord,
  userId: string,
  onStockfishFailure?: (failure: ChessBotStockfishFailure) => void,
  onStockfishMove?: (result: StockfishResult) => void,
  getBestMove: StockfishBestMoveProvider = getStockfishBestMove
): Promise<GameActionInput | null> {
  const chessGame = getChessBotGame(game);
  if (!chessGame) return null;
  if (chessGame.status !== 'active') return null;
  if (chessGame.players[chessGame.turn] !== userId) return null;

  let stockfishResult: StockfishResult;
  try {
    stockfishResult = await getBestMove(chessGame.fen);
  } catch (error) {
    onStockfishFailure?.({ error, reason: 'stockfish_error' });
    return null;
  }

  const move = stockfishResult.move;
  if (!move) {
    onStockfishFailure?.({ reason: 'stockfish_no_move' });
    return null;
  }

  onStockfishMove?.(stockfishResult);

  return {
    action: 'move',
    payload: toChessMovePayload(move),
    userId
  };
}

export function createReplayTriviaBotAnswerAction(
  game: GameRecord,
  userId: string,
  random = Math.random,
  now = Date.now()
): GameActionInput | null {
  const triviaGame = getReplayTriviaBotGame(game);
  if (!triviaGame) return null;
  if (triviaGame.status !== 'question') return null;
  if (isReplayTriviaQuestionDeadlinePassed(triviaGame, now)) return null;
  if (triviaGame.answers[userId] !== undefined) return null;
  if (!Object.values(triviaGame.players).includes(userId)) return null;

  const question = triviaGame.questions[triviaGame.currentQuestionIndex];
  if (!question) return null;

  const choiceIndex = random() < TRIVIA_BOT_ANSWER_ACCURACY
    ? question.correctChoiceIndex
    : pickWrongChoiceIndex(question.correctChoiceIndex, random);

  return {
    action: 'answer',
    payload: { choiceIndex },
    userId
  };
}

function getRandomDelay(minMs: number, maxMs: number, random: () => number): number {
  return Math.round(minMs + random() * (maxMs - minMs));
}

function hasPlayer(game: GameRecord, userId: string): boolean {
  return Object.values(getGamePlayers(game)).includes(userId);
}

function isChessTurnForPlayer(game: GameRecord, userId: string): boolean {
  const chessGame = getChessBotGame(game);
  if (!chessGame) return false;
  if (chessGame.status !== 'active') return false;
  return chessGame.players[chessGame.turn] === userId;
}

function isPublicChessTurnForPlayer(game: PublicChessGame, userId: string): boolean {
  if (game.status !== 'active') return false;
  return game.players[game.turn]?.userId === userId;
}

function isReplayTriviaAnswerNeeded(game: GameRecord, userId: string, now: number): boolean {
  const triviaGame = getReplayTriviaBotGame(game);
  return Boolean(
    triviaGame
      && triviaGame.status === 'question'
      && triviaGame.answers[userId] === undefined
      && !isReplayTriviaQuestionDeadlinePassed(triviaGame, now)
  );
}

function isPublicReplayTriviaAnswerNeeded(game: PublicReplayTriviaGame, userId: string, now: number): boolean {
  const role = getPublicReplayTriviaPlayerRole(game, userId);
  return Boolean(
    role
      && game.status === 'question'
      && game.currentQuestion
      && game.answers[role] === undefined
      && now - game.phaseStartedAt < REPLAY_TRIVIA_ANSWER_TIME_MS
  );
}

function getGamePlayers(game: GameRecord): Record<string, string> {
  const candidate = (game as GameRecord & { players?: unknown }).players;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {};
  return candidate as Record<string, string>;
}

function getChessBotGame(game: GameRecord): ChessGameRecord | null {
  if (game.gameType !== 'chess') return null;
  return game as ChessGameRecord;
}

function toChessGameRecord(game: PublicChessGame): ChessGameRecord {
  return {
    fen: game.fen,
    gameId: game.gameId,
    gameType: 'chess',
    lastMoveSan: game.lastMoveSan,
    pgn: game.pgn,
    players: {
      black: game.players.black.userId,
      white: game.players.white.userId
    },
    status: game.status,
    turn: game.turn,
    winner: game.winner
  };
}

function createPublicReplayTriviaBotAnswerAction(
  game: PublicReplayTriviaGame,
  userId: string,
  random = Math.random,
  now = Date.now()
): GameActionInput | null {
  if (!isPublicReplayTriviaAnswerNeeded(game, userId, now)) return null;

  return {
    action: 'answer',
    payload: {
      choiceIndex: Math.floor(random() * 4) as ChoiceIndex
    },
    userId
  };
}

function getPublicReplayTriviaPlayerRole(
  game: PublicReplayTriviaGame,
  userId: string
): 'guest' | 'host' | null {
  if (game.players.host.userId === userId) return 'host';
  if (game.players.guest.userId === userId) return 'guest';
  return null;
}

function toChessMovePayload(move: ChessBotMove): Record<string, unknown> {
  return move.promotion
    ? { from: move.from, promotion: move.promotion, to: move.to }
    : { from: move.from, to: move.to };
}

interface ReplayTriviaBotGame extends GameRecord {
  answers: Record<string, ChoiceIndex | null | undefined>;
  currentQuestionIndex: number;
  gameType: 'replay-trivia';
  phaseStartedAt: number;
  players: Record<string, string>;
  questions: ReplayTriviaBotQuestion[];
}

interface ReplayTriviaBotQuestion {
  correctChoiceIndex: ChoiceIndex;
}

function getReplayTriviaBotGame(game: GameRecord): ReplayTriviaBotGame | null {
  if (game.gameType !== 'replay-trivia') return null;
  return game as ReplayTriviaBotGame;
}

function isReplayTriviaQuestionDeadlinePassed(game: ReplayTriviaBotGame, now: number): boolean {
  return now - game.phaseStartedAt >= REPLAY_TRIVIA_QUESTION_READ_MS + REPLAY_TRIVIA_ANSWER_TIME_MS;
}

function pickWrongChoiceIndex(correctChoiceIndex: ChoiceIndex, random: () => number): ChoiceIndex {
  const wrongChoices = ([0, 1, 2, 3] as ChoiceIndex[]).filter((choiceIndex) => choiceIndex !== correctChoiceIndex);
  const index = Math.min(Math.floor(random() * wrongChoices.length), wrongChoices.length - 1);
  return wrongChoices[index];
}
