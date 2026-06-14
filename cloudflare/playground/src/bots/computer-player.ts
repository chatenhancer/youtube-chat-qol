/**
 * Server-owned computer player.
 *
 * This behaves like a connected client from the room's point of view: it has a
 * socket-shaped receiver for server messages and responds by submitting normal
 * client messages back to the room.
 */
import { Chess, type Move } from 'chess.js';
import { getStockfishBestMove, type StockfishMove } from './stockfish';
import type { ChessGameRecord, ChessMoveInput } from '../games/chess';
import {
  REPLAY_TRIVIA_ANSWER_TIME_MS,
  REPLAY_TRIVIA_QUESTION_READ_MS
} from '../games/replay-trivia';
import type { GameActionInput, GameRecord } from '../games/types';
import type { ClientMessage, GameId, PublicGame, ServerMessage } from '../protocol/messages';
import type { ServerWebSocket } from '../types';

type ChoiceIndex = 0 | 1 | 2 | 3;
type ChessBotMove = Pick<ChessMoveInput, 'from' | 'promotion' | 'to'>;
type ChessBotFallbackReason = 'stockfish_error' | 'stockfish_no_move';

export interface ChessBotFallback {
  error?: unknown;
  reason: ChessBotFallbackReason;
}

export const COMPUTER_PLAYER_CONNECTION_ID = 'server:computer';
export const COMPUTER_PLAYER_USER_ID = 'server:computer';
export const COMPUTER_PLAYER_DISPLAY_NAME = 'Computer';

const COMPUTER_AVAILABLE_GAMES: GameId[] = ['chess', 'replay-trivia'];
const CHESS_RESPONSE_MIN_DELAY_MS = 700;
const CHESS_RESPONSE_MAX_DELAY_MS = 1_500;
const TRIVIA_RESPONSE_MIN_DELAY_MS = 1_800;
const TRIVIA_RESPONSE_MAX_DELAY_MS = 5_500;
const TRIVIA_BOT_ANSWER_ACCURACY = 0.65;

export interface ComputerPlayerHost {
  getGame(gameId: string): GameRecord | undefined;
  onActionError?(gameId: string, error: unknown): void;
  onChessBotFallback?(gameId: string, fallback: ChessBotFallback): void;
  sendClientMessage(message: Exclude<ClientMessage, { type: 'hello' }>): void;
  waitUntil(promise: Promise<unknown>): void;
}

export interface ComputerPlayer {
  readonly availableGames: readonly GameId[];
  readonly connectionId: string;
  readonly displayName: string;
  readonly socket: ServerWebSocket;
  readonly userId: string;
  reset(): void;
}

export function createComputerPlayer(host: ComputerPlayerHost): ComputerPlayer {
  return new ServerComputerPlayer(host);
}

export async function createStockfishChessBotAction(
  game: GameRecord,
  userId: string,
  onFallback?: (fallback: ChessBotFallback) => void
): Promise<GameActionInput | null> {
  const chessGame = getChessBotGame(game);
  if (!chessGame) return null;
  if (chessGame.status !== 'active') return null;
  if (chessGame.players[chessGame.turn] !== userId) return null;

  let stockfishMove: StockfishMove | null = null;
  let fallback: ChessBotFallback | null = null;
  try {
    stockfishMove = await getStockfishBestMove(chessGame.fen);
    if (!stockfishMove) fallback = { reason: 'stockfish_no_move' };
  } catch (error) {
    fallback = { error, reason: 'stockfish_error' };
  }

  const move = stockfishMove || getFallbackLegalMove(chessGame.fen);
  if (!move) return null;
  if (!stockfishMove && fallback) onFallback?.(fallback);

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

class ServerComputerPlayer implements ComputerPlayer {
  readonly availableGames = COMPUTER_AVAILABLE_GAMES;
  readonly connectionId = COMPUTER_PLAYER_CONNECTION_ID;
  readonly displayName = COMPUTER_PLAYER_DISPLAY_NAME;
  readonly socket = createComputerSocket((message) => this.receive(message), () => this.reset());
  readonly userId = COMPUTER_PLAYER_USER_ID;
  private readonly actionTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly host: ComputerPlayerHost) {}

  reset(): void {
    this.actionTimers.forEach((timer) => clearTimeout(timer));
    this.actionTimers.clear();
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'helloAccepted':
        message.snapshot.games.forEach((game) => this.handleGameMessage(game));
        return;
      case 'presenceSnapshot':
        if (!message.snapshot.users.some((user) => user.userId !== COMPUTER_PLAYER_USER_ID)) this.reset();
        return;
      case 'inviteReceived':
        if (message.invite.toUser.userId !== COMPUTER_PLAYER_USER_ID) return;
        this.host.sendClientMessage({
          accept: true,
          inviteId: message.invite.inviteId,
          type: 'respondInvite'
        });
        return;
      case 'gameStarted':
      case 'gameUpdated':
        this.handleGameMessage(message.game);
        return;
      case 'gameEnded':
        this.clearActionTimer(message.gameId);
        return;
      default:
        return;
    }
  }

  private handleGameMessage(publicGame: PublicGame): void {
    const game = this.host.getGame(publicGame.gameId);
    if (!game) return;

    this.clearActionTimer(game.gameId);
    if (!this.shouldAct(game)) return;

    const timer = setTimeout(() => {
      this.actionTimers.delete(game.gameId);
      const actionPromise = this.runAction(game.gameId);
      this.host.waitUntil(actionPromise.catch((error) => {
        this.host.onActionError?.(game.gameId, error);
      }));
    }, this.getActionDelayMs(game));
    this.actionTimers.set(game.gameId, timer);
  }

  private clearActionTimer(gameId: string): void {
    const timer = this.actionTimers.get(gameId);
    if (!timer) return;
    clearTimeout(timer);
    this.actionTimers.delete(gameId);
  }

  private async runAction(gameId: string): Promise<void> {
    const game = this.host.getGame(gameId);
    if (!game || !this.shouldAct(game)) return;

    const action = await this.createAction(game);
    if (!action) return;

    this.host.sendClientMessage({
      action: action.action,
      gameId,
      payload: action.payload,
      type: 'gameAction'
    });
  }

  private createAction(game: GameRecord): Promise<GameActionInput | null> | GameActionInput | null {
    switch (game.gameType) {
      case 'chess':
        return createStockfishChessBotAction(game, COMPUTER_PLAYER_USER_ID, (fallback) => {
          this.host.onChessBotFallback?.(game.gameId, fallback);
        });
      case 'replay-trivia':
        return createReplayTriviaBotAnswerAction(game, COMPUTER_PLAYER_USER_ID);
      default:
        return null;
    }
  }

  private getActionDelayMs(game: GameRecord): number {
    switch (game.gameType) {
      case 'chess':
        return getRandomDelay(CHESS_RESPONSE_MIN_DELAY_MS, CHESS_RESPONSE_MAX_DELAY_MS);
      case 'replay-trivia':
        return getRandomDelay(TRIVIA_RESPONSE_MIN_DELAY_MS, TRIVIA_RESPONSE_MAX_DELAY_MS);
      default:
        return 0;
    }
  }

  private shouldAct(game: GameRecord): boolean {
    if (!hasPlayer(game, COMPUTER_PLAYER_USER_ID)) return false;

    switch (game.gameType) {
      case 'chess':
        return isChessTurnForPlayer(game, COMPUTER_PLAYER_USER_ID);
      case 'replay-trivia':
        return isReplayTriviaAnswerNeeded(game, COMPUTER_PLAYER_USER_ID);
      default:
        return false;
    }
  }
}

function createComputerSocket(
  receive: (message: ServerMessage) => void,
  reset: () => void
): ServerWebSocket {
  let closed = false;
  return {
    accept: () => undefined,
    close: () => {
      closed = true;
      reset();
    },
    send: (data: string) => {
      if (closed) return;
      receive(JSON.parse(data) as ServerMessage);
    }
  } as unknown as ServerWebSocket;
}

function getRandomDelay(minMs: number, maxMs: number): number {
  return Math.round(minMs + Math.random() * (maxMs - minMs));
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

function isReplayTriviaAnswerNeeded(game: GameRecord, userId: string): boolean {
  const triviaGame = getReplayTriviaBotGame(game);
  return Boolean(
    triviaGame
      && triviaGame.status === 'question'
      && triviaGame.answers[userId] === undefined
      && !isReplayTriviaQuestionDeadlinePassed(triviaGame, Date.now())
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

function getFallbackLegalMove(fen: string): ChessBotMove | null {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;

  const move = [...moves].sort(compareFallbackMoves)[0];
  return {
    from: move.from,
    promotion: getPromotion(move),
    to: move.to
  };
}

function compareFallbackMoves(a: Move, b: Move): number {
  return scoreFallbackMove(b) - scoreFallbackMove(a) || a.san.localeCompare(b.san);
}

function scoreFallbackMove(move: Move): number {
  let score = 0;
  if (move.captured) score += getPieceValue(move.captured) * 10 - getPieceValue(move.piece);
  if (move.san.includes('+')) score += 3;
  if (move.san.includes('#')) score += 100;
  if (move.isKingsideCastle() || move.isQueensideCastle()) score += 2;
  if (move.promotion) score += getPieceValue(move.promotion);
  return score;
}

function getPieceValue(piece: string): number {
  switch (piece) {
    case 'q':
      return 9;
    case 'r':
      return 5;
    case 'b':
    case 'n':
      return 3;
    case 'p':
      return 1;
    default:
      return 0;
  }
}

function getPromotion(move: Move): ChessBotMove['promotion'] {
  return move.promotion === 'b' || move.promotion === 'n' || move.promotion === 'q' || move.promotion === 'r'
    ? move.promotion
    : undefined;
}

function toChessMovePayload(move: ChessBotMove | StockfishMove): Record<string, unknown> {
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
