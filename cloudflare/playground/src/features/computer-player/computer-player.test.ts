import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createComputerPlayer } from './computer-player';
import {
  COMPUTER_PLAYER_AVAILABLE_GAMES,
  COMPUTER_PLAYER_CONNECTION_ID,
  COMPUTER_PLAYER_DISPLAY_NAME,
  COMPUTER_PLAYER_USER_ID
} from './actions';
import { applyChessMove, createChessGame, toPublicChessGame, type ChessGameRecord } from '../../games/chess';
import { getStockfishBestMove } from '../../durable-objects/stockfish-container/client';
import type { GameRecord } from '../../games/types';
import type { ClientMessage, ServerMessage } from '../../protocol/messages';
import type { Env } from '../../types';

vi.mock('../../durable-objects/stockfish-container/client', () => ({
  createStockfishBestMoveProvider: () => getStockfishBestMove,
  getStockfishBestMove: vi.fn(() => Promise.resolve(createStockfishResult({
    from: 'e7',
    to: 'e5'
  })))
}));

describe('in-room computer player', () => {
  beforeEach(() => {
    vi.mocked(getStockfishBestMove).mockClear();
    vi.mocked(getStockfishBestMove).mockResolvedValue(createStockfishResult({
      from: 'e7',
      to: 'e5'
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exposes a server-owned Computer session and accepts invites', () => {
    const harness = createComputerPlayerHarness();

    expect(harness.player.connectionId).toBe(COMPUTER_PLAYER_CONNECTION_ID);
    expect(harness.player.displayName).toBe(COMPUTER_PLAYER_DISPLAY_NAME);
    expect(harness.player.userId).toBe(COMPUTER_PLAYER_USER_ID);
    expect(harness.player.availableGames).toEqual(COMPUTER_PLAYER_AVAILABLE_GAMES);

    sendServerMessage(harness, {
      invite: {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromUser: { displayName: 'Alice', userId: 'human-user' },
        gameId: 'chess',
        inviteId: 'inv_1',
        status: 'pending',
        toUser: { displayName: 'Computer', userId: COMPUTER_PLAYER_USER_ID }
      },
      type: 'inviteReceived'
    });

    expect(harness.sentMessages.at(-1)).toEqual({
      accept: true,
      inviteId: 'inv_1',
      type: 'respondInvite'
    });
  });

  it('submits a Stockfish chess move as a normal game action', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    expect(harness.logEvent).toHaveBeenCalledWith(
      'computer_player_action_scheduled',
      expect.objectContaining({
        delayMs: expect.any(Number),
        game: 'game_chess_1',
        gameType: 'chess',
        user: expect.stringMatching(/^h_[a-z0-9]+$/)
      }),
      'info'
    );

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledWith(game.fen);
    expect(harness.sentMessages.at(-1)).toEqual({
      action: 'move',
      gameId: 'game_chess_1',
      payload: {
        from: 'e7',
        to: 'e5'
      },
      type: 'gameAction'
    });
    expect(harness.logEvent).toHaveBeenCalledWith(
      'chess_bot_stockfish_move',
      expect.objectContaining({
        from: 'e7',
        gameType: 'chess',
        source: 'container',
        to: 'e5'
      }),
      'info'
    );
    expect(harness.logEvent).toHaveBeenCalledWith(
      'computer_player_action_sent',
      expect.objectContaining({
        action: 'move',
        game: 'game_chess_1',
        gameType: 'chess'
      }),
      'info'
    );
  });

  it('resets pending actions when the computer is alone instead of disconnecting', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });
    sendServerMessage(harness, {
      snapshot: {
        games: [toPublicChessGame(game, getPlayerInfo)],
        invites: [],
        users: [{
          availableGames: [...COMPUTER_PLAYER_AVAILABLE_GAMES],
          displayName: 'Computer',
          joinedAt: Date.now(),
          userId: COMPUTER_PLAYER_USER_ID
        }]
      },
      type: 'presenceSnapshot'
    });

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).not.toHaveBeenCalled();
    expect(harness.sentMessages).toEqual([]);
  });

  it('retries a Stockfish chess move after a transient failure', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    const error = new Error('Stockfish is cold.');
    vi.mocked(getStockfishBestMove)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(createStockfishResult({ from: 'e7', to: 'e5' }));
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.advanceTimersByTimeAsync(1_500);
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(1);
    expect(getStockfishBestMove).toHaveBeenCalledWith(game.fen);
    expect(harness.sentMessages).toEqual([]);
    expect(harness.logEvent).toHaveBeenCalledWith(
      'chess_bot_stockfish_unavailable',
      expect.objectContaining({
        errorMessage: 'Stockfish is cold.',
        game: 'game_chess_1',
        reason: 'stockfish_error'
      }),
      'warn'
    );
    expect(harness.logEvent).toHaveBeenCalledWith(
      'chess_bot_stockfish_retry_scheduled',
      expect.objectContaining({
        attempt: 1,
        delayMs: 2_000,
        game: 'game_chess_1',
        reason: 'stockfish_error'
      }),
      'info'
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(2);
    expect(harness.sentMessages.at(-1)).toEqual({
      action: 'move',
      gameId: 'game_chess_1',
      payload: {
        from: 'e7',
        to: 'e5'
      },
      type: 'gameAction'
    });
  });

  it('stops retrying a Stockfish chess move after the retry budget is exhausted', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    vi.mocked(getStockfishBestMove).mockRejectedValue(new Error('Stockfish is down.'));
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.advanceTimersByTimeAsync(1_500);
    await harness.flushWaitUntil();
    await vi.advanceTimersByTimeAsync(2_000);
    await harness.flushWaitUntil();
    await vi.advanceTimersByTimeAsync(5_000);
    await harness.flushWaitUntil();
    await vi.advanceTimersByTimeAsync(10_000);
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(4);
    expect(harness.sentMessages.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game_chess_1',
      type: 'gameAction'
    });
    expect(harness.logEvent).toHaveBeenCalledWith(
      'chess_bot_stockfish_retry_exhausted',
      expect.objectContaining({
        attempts: 3,
        game: 'game_chess_1',
        lastReason: 'stockfish_error'
      }),
      'warn'
    );

    await vi.advanceTimersByTimeAsync(9_000);
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(4);
  });
});

function createComputerPlayerHarness(): {
  flushWaitUntil(): Promise<void>;
  games: Map<string, GameRecord>;
  logEvent: ReturnType<typeof vi.fn>;
  player: ReturnType<typeof createComputerPlayer>;
  sentMessages: Exclude<ClientMessage, { type: 'hello' }>[];
} {
  const games = new Map<string, GameRecord>();
  const pending: Promise<unknown>[] = [];
  const sentMessages: Exclude<ClientMessage, { type: 'hello' }>[] = [];
  const logEvent = vi.fn();
  const player = createComputerPlayer({
    env: {} as Env,
    getGame: (gameId) => games.get(gameId),
    logEvent: (event, details = {}, level = 'info') => logEvent(event, details, level),
    sendClientMessage: (message) => {
      sentMessages.push(message);
    },
    waitUntil: (promise) => {
      pending.push(promise);
    }
  });

  return {
    async flushWaitUntil() {
      while (pending.length > 0) {
        await Promise.all(pending.splice(0));
      }
    },
    games,
    logEvent,
    player,
    sentMessages
  };
}

function setBotTurnChessGame(harness: { games: Map<string, GameRecord> }): ChessGameRecord {
  const game = applyChessMove(createChessGame('game_chess_1', 'human-user', COMPUTER_PLAYER_USER_ID), {
    from: 'e2',
    to: 'e4',
    userId: 'human-user'
  });
  harness.games.set(game.gameId, game);
  return game;
}

function sendServerMessage(
  harness: { player: ReturnType<typeof createComputerPlayer> },
  message: ServerMessage
): void {
  harness.player.socket.send(JSON.stringify(message));
}

function getPlayerInfo(userId: string): { displayName: string; userId: string } {
  return {
    displayName: userId === COMPUTER_PLAYER_USER_ID ? 'Computer' : 'Alice',
    userId
  };
}

function createStockfishResult(move: { from: string; to: string } | null) {
  return {
    elapsedMs: 512,
    elo: 1700,
    fenHash: 'h_testfen',
    move,
    moveTimeMs: 500
  };
}
