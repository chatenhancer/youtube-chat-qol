/**
 * Server-owned computer player hosted inside a stream room.
 *
 * The room sends normal server messages to this socket-shaped receiver, and the
 * computer player responds by submitting normal client messages back through
 * the room's existing message handler. There is no separate network socket or
 * Durable Object lifecycle for the bot to lose.
 */
import {
  createComputerPlayerAction,
  getComputerPlayerActionDelayMs,
  shouldComputerPlayerAct,
  type ChessBotStockfishFailure
} from './actions';
import {
  DEFAULT_COMPUTER_PLAYER_PROFILE,
  type ComputerPlayerProfile,
  getChessComputerPlayerStockfishElo,
  isComputerPlayerUserId
} from './profiles';
import {
  createStockfishBestMoveProvider,
  type StockfishResult
} from '../../durable-objects/stockfish-container/client';
import type { GameRecord } from '../../games/types';
import { getLogErrorMessage, getLogErrorType, hashLogValue, shortLogId } from '../../logging';
import type { ClientMessage, GameId, ServerMessage } from '../../protocol/messages';
import type { Env } from '../../types';

const STOCKFISH_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;
const MAX_LOG_MESSAGE_LENGTH = 180;

type LogDetails = Record<string, boolean | number | string | undefined>;

export interface ComputerPlayerHost {
  env: Env;
  getGame(gameId: string): GameRecord | undefined;
  logEvent(event: string, details?: LogDetails, level?: 'error' | 'info' | 'warn'): void;
  sendClientMessage(message: Exclude<ClientMessage, { type: 'hello' }>): void;
  waitUntil(promise: Promise<unknown>): void;
}

export interface ComputerPlayer {
  readonly availableGames: readonly GameId[];
  readonly connectionId: string;
  readonly displayName: string;
  readonly socket: WebSocket;
  readonly userId: string;
  reset(): void;
}

export function createComputerPlayer(
  host: ComputerPlayerHost,
  profile: ComputerPlayerProfile = DEFAULT_COMPUTER_PLAYER_PROFILE
): ComputerPlayer {
  return new StreamRoomComputerPlayer(host, profile);
}

class StreamRoomComputerPlayer implements ComputerPlayer {
  readonly availableGames: readonly GameId[];
  readonly connectionId: string;
  readonly displayName: string;
  readonly socket = createComputerSocket((message) => this.receive(message), () => this.reset());
  readonly userId: string;
  private readonly actionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly stockfishRetryAttempts = new Map<string, number>();

  constructor(
    private readonly host: ComputerPlayerHost,
    profile: ComputerPlayerProfile
  ) {
    this.availableGames = profile.availableGames;
    this.connectionId = profile.connectionId;
    this.displayName = profile.displayName;
    this.userId = profile.userId;
  }

  reset(): void {
    this.actionTimers.forEach((timer) => clearTimeout(timer));
    this.actionTimers.clear();
    this.stockfishRetryAttempts.clear();
  }

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'helloAccepted':
        message.snapshot.games.forEach((game) => this.handleGameChanged(game.gameId));
        return;
      case 'presenceSnapshot':
        if (!message.snapshot.users.some((user) => !isComputerPlayerUserId(user.userId))) {
          this.reset();
          return;
        }
        message.snapshot.games.forEach((game) => this.handleGameChanged(game.gameId));
        return;
      case 'inviteReceived':
        if (message.invite.toUser.userId !== this.userId) return;
        this.host.sendClientMessage({
          accept: true,
          inviteId: message.invite.inviteId,
          type: 'respondInvite'
        });
        return;
      case 'gameStarted':
      case 'gameUpdated':
        this.handleGameChanged(message.game.gameId);
        return;
      case 'gameEnded':
        this.clearGameActionState(message.gameId);
        return;
      case 'error':
        this.logEvent('computer_player_socket_error', {
          code: message.code,
          message: truncateLogMessage(message.message)
        }, 'warn');
        return;
      case 'challenge':
      case 'inviteCreated':
      case 'inviteUpdated':
      case 'pong':
      case 'replayTriviaGenerationToken':
        return;
    }
  }

  private handleGameChanged(gameId: string): void {
    const game = this.host.getGame(gameId);
    if (!game) {
      this.clearGameActionState(gameId);
      return;
    }

    this.clearGameActionState(game.gameId);
    if (!shouldComputerPlayerAct(game, this.userId)) return;

    const delayMs = getComputerPlayerActionDelayMs(game, Math.random, this.userId);
    const timer = setTimeout(() => {
      this.actionTimers.delete(game.gameId);
      this.runActionInBackground(game.gameId);
    }, delayMs);
    this.actionTimers.set(game.gameId, timer);
    this.logEvent('computer_player_action_scheduled', {
      delayMs,
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      user: hashLogValue(this.userId)
    });
  }

  private runActionInBackground(gameId: string): void {
    this.host.waitUntil(this.runAction(gameId).catch((error) => {
      const game = this.host.getGame(gameId);
      this.logEvent('computer_player_action_failed', {
        errorMessage: getLogErrorMessage(error),
        errorType: getLogErrorType(error),
        game: shortLogId(gameId),
        gameType: game?.gameType,
        user: hashLogValue(this.userId)
      }, 'warn');
    }));
  }

  private async runAction(gameId: string): Promise<void> {
    const game = this.host.getGame(gameId);
    if (!game || !shouldComputerPlayerAct(game, this.userId)) return;

    let stockfishFailure: ChessBotStockfishFailure | null = null;
    const action = await createComputerPlayerAction(game, {
      getStockfishBestMove: createStockfishBestMoveProvider(this.host.env, {
        elo: getChessComputerPlayerStockfishElo(this.userId)
      }),
      onChessBotStockfishFailure: (failure) => {
        stockfishFailure = failure;
        this.logChessBotStockfishFailure(game, failure);
      },
      onChessBotStockfishMove: (result) => this.logChessBotStockfishMove(game, result),
      userId: this.userId
    });
    if (!action) {
      if (stockfishFailure) this.scheduleStockfishRetry(game, stockfishFailure);
      return;
    }

    this.stockfishRetryAttempts.delete(game.gameId);
    this.sendGameAction(game, action.action, action.payload);
  }

  private scheduleStockfishRetry(game: GameRecord, failure: ChessBotStockfishFailure): void {
    if (!shouldComputerPlayerAct(game, this.userId)) return;

    const attemptIndex = this.stockfishRetryAttempts.get(game.gameId) ?? 0;
    const delayMs = STOCKFISH_RETRY_DELAYS_MS[attemptIndex];
    if (delayMs === undefined) {
      this.stockfishRetryAttempts.set(game.gameId, STOCKFISH_RETRY_DELAYS_MS.length);
      this.logEvent('chess_bot_stockfish_retry_exhausted', {
        attempts: STOCKFISH_RETRY_DELAYS_MS.length,
        game: shortLogId(game.gameId),
        gameType: game.gameType,
        lastReason: failure.reason,
        user: hashLogValue(this.userId)
      }, 'warn');
      this.sendGameAction(game, 'leave');
      return;
    }

    const attempt = attemptIndex + 1;
    this.stockfishRetryAttempts.set(game.gameId, attempt);
    const timer = setTimeout(() => {
      this.actionTimers.delete(game.gameId);
      this.runActionInBackground(game.gameId);
    }, delayMs);
    this.actionTimers.set(game.gameId, timer);
    this.logEvent('chess_bot_stockfish_retry_scheduled', {
      attempt,
      delayMs,
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      reason: failure.reason,
      user: hashLogValue(this.userId)
    });
  }

  private sendGameAction(game: GameRecord, action: string, payload?: Record<string, unknown>): boolean {
    try {
      this.host.sendClientMessage({
        action,
        gameId: game.gameId,
        payload,
        type: 'gameAction'
      });
      this.logEvent('computer_player_action_sent', {
        action,
        game: shortLogId(game.gameId),
        gameType: game.gameType,
        user: hashLogValue(this.userId)
      });
      return true;
    } catch (error) {
      this.logEvent('computer_player_action_send_failed', {
        action,
        errorMessage: getLogErrorMessage(error),
        errorType: getLogErrorType(error),
        game: shortLogId(game.gameId),
        gameType: game.gameType,
        user: hashLogValue(this.userId)
      }, 'warn');
      return false;
    }
  }

  private clearActionTimer(gameId: string): void {
    const timer = this.actionTimers.get(gameId);
    if (!timer) return;
    clearTimeout(timer);
    this.actionTimers.delete(gameId);
  }

  private clearGameActionState(gameId: string): void {
    this.clearActionTimer(gameId);
    this.stockfishRetryAttempts.delete(gameId);
  }

  private logChessBotStockfishFailure(game: GameRecord, failure: ChessBotStockfishFailure): void {
    this.logEvent('chess_bot_stockfish_unavailable', {
      errorMessage: getStockfishFailureErrorMessage(failure.error),
      errorType: failure.error === undefined ? undefined : getLogErrorType(failure.error),
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      reason: failure.reason,
      user: hashLogValue(this.userId)
    }, 'warn');
  }

  private logChessBotStockfishMove(game: GameRecord, result: StockfishResult): void {
    this.logEvent('chess_bot_stockfish_move', {
      elapsedMs: result.elapsedMs,
      elo: result.elo,
      fen: result.fenHash,
      from: result.move?.from,
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      moveTimeMs: result.moveTimeMs,
      promotion: result.move?.promotion,
      source: 'container',
      to: result.move?.to,
      user: hashLogValue(this.userId)
    });
  }

  private logEvent(
    event: string,
    details: LogDetails = {},
    level: 'error' | 'info' | 'warn' = 'info'
  ): void {
    this.host.logEvent(event, details, level);
  }
}

function createComputerSocket(
  receive: (message: ServerMessage) => void,
  reset: () => void
): WebSocket {
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
  } as unknown as WebSocket;
}

function getStockfishFailureErrorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  const message = error instanceof Error ? error.message : String(error);
  return truncateLogMessage(message);
}

function truncateLogMessage(message: string): string {
  if (message.length <= MAX_LOG_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_LOG_MESSAGE_LENGTH - 3)}...`;
}
