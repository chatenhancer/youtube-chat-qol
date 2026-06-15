import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyChessMove, createChessGame, toPublicChessGame } from '../games/chess';
import type { ClientMessage, PublicUserIdentity } from '../protocol/messages';
import {
  COMPUTER_PLAYER_CONNECTION_ID,
  COMPUTER_PLAYER_USER_ID
} from './computer-player';
import {
  attachBotClientsToRoom,
  type ConnectedBotClientSession
} from './room-adapter';

describe('bot room adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes the configured Stockfish provider to the computer chess player', async () => {
    vi.useFakeTimers();

    const pending: Promise<unknown>[] = [];
    const clients = new Map<string, ConnectedBotClientSession>();
    const humanUserId = 'user:human';
    const game = applyChessMove(
      createChessGame('game_chess_1', humanUserId, COMPUTER_PLAYER_USER_ID),
      {
        from: 'e2',
        to: 'e4',
        userId: humanUserId
      }
    );
    const getStockfishBestMove = vi.fn(async () => ({
      from: 'e7',
      to: 'e5'
    }));
    const handleMessage = vi.fn(async (_session: ConnectedBotClientSession, _message: string) => undefined);

    attachBotClientsToRoom({
      clients,
      connectionRateLimitOptions: {
        capacity: 30,
        refillPerSecond: 10
      },
      createSnapshot: () => ({
        games: [],
        invites: [],
        users: []
      }),
      getGame: (gameId) => gameId === game.gameId ? game : undefined,
      getStockfishBestMove,
      handleMessage,
      logEvent: vi.fn(),
      setAvailableGames: vi.fn(),
      waitUntil: (promise) => {
        pending.push(promise);
      }
    });

    const botSession = clients.get(COMPUTER_PLAYER_CONNECTION_ID);
    expect(botSession).toBeDefined();
    botSession?.socket.send(JSON.stringify({
      game: toPublicChessGame(game, getPublicUser),
      type: 'gameUpdated'
    }));

    await vi.runAllTimersAsync();
    await flushPending(pending);

    expect(getStockfishBestMove).toHaveBeenCalledWith(game.fen);
    expect(handleMessage).toHaveBeenCalledTimes(1);
    expect(JSON.parse(handleMessage.mock.calls[0][1]) as ClientMessage).toMatchObject({
      action: 'move',
      gameId: game.gameId,
      payload: {
        from: 'e7',
        to: 'e5'
      },
      type: 'gameAction'
    });
  });
});

function getPublicUser(userId: string): PublicUserIdentity {
  return {
    displayName: userId,
    userId
  };
}

async function flushPending(pending: Promise<unknown>[]): Promise<void> {
  while (pending.length > 0) {
    await Promise.all(pending.splice(0));
  }
}
