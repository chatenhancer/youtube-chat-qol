import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createComputerPlayer } from './computer-player';
import {
  BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE,
  CHESS_COMPUTER_PLAYER_CLUB_PROFILE,
  REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE,
  getChessComputerPlayerStockfishElo,
  type ComputerPlayerProfile
} from './profiles';
import { applyChessMove, createChessGame, toPublicChessGame, type ChessGameRecord } from '../../games/chess';
import {
  claimBountyHuntingBounty,
  createBountyHuntingGame,
  observeBountyHuntingMessage,
  readyBountyHuntingPlayer,
  startBountyHuntingRound,
  submitBountyHunting,
  toPublicBountyHuntingGame
} from '../../games/bounty-hunting';
import {
  createStockfishBestMoveProvider,
  getStockfishBestMove
} from '../../durable-objects/stockfish-container/client';
import type { GameRecord } from '../../games/types';
import type { ClientMessage, ServerMessage } from '../../protocol/messages';
import type { Env } from '../../types';

vi.mock('../../durable-objects/stockfish-container/client', () => ({
  createStockfishBestMoveProvider: vi.fn(() => getStockfishBestMove),
  getStockfishBestMove: vi.fn(() => Promise.resolve(createStockfishResult({
    from: 'e7',
    to: 'e5'
  })))
}));

describe('in-room computer player', () => {
  beforeEach(() => {
    vi.mocked(createStockfishBestMoveProvider).mockClear();
    vi.mocked(createStockfishBestMoveProvider).mockReturnValue(getStockfishBestMove);
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

  it('exposes a server-owned Replay Trivia Computer session and accepts invites', () => {
    const harness = createComputerPlayerHarness(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE);

    expect(harness.player.connectionId).toBe(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.connectionId);
    expect(harness.player.displayName).toBe(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.displayName);
    expect(harness.player.userId).toBe(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId);
    expect(harness.player.availableGames).toEqual(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.availableGames);

    sendServerMessage(harness, {
      invite: {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromUser: { displayName: 'Alice', userId: 'human-user' },
        gameId: 'replay-trivia',
        inviteId: 'inv_1',
        status: 'pending',
        toUser: { displayName: 'Computer', userId: REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId }
      },
      type: 'inviteReceived'
    });

    expect(harness.sentMessages.at(-1)).toEqual({
      accept: true,
      inviteId: 'inv_1',
      type: 'respondInvite'
    });
  });

  it('ignores unrelated invites, logs socket errors, and stops receiving after close', () => {
    const harness = createComputerPlayerHarness(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE);

    harness.player.socket.accept();
    sendServerMessage(harness, {
      invite: {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromUser: { displayName: 'Alice', userId: 'human-user' },
        gameId: 'replay-trivia',
        inviteId: 'inv_ignored',
        status: 'pending',
        toUser: { displayName: 'Other bot', userId: 'server:computer:other' }
      },
      type: 'inviteReceived'
    });
    expect(harness.sentMessages).toEqual([]);

    sendServerMessage(harness, {
      code: 'bad_message',
      message: 'x'.repeat(220),
      type: 'error'
    });

    expect(harness.logEvent).toHaveBeenCalledWith(
      'computer_player_socket_error',
      expect.objectContaining({
        code: 'bad_message',
        message: `${'x'.repeat(177)}...`
      }),
      'warn'
    );

    sendServerMessage(harness, {
      gameId: 'missing-game',
      reason: 'playerLeft',
      type: 'gameEnded',
      userId: 'human-user'
    });

    harness.player.socket.close();
    sendServerMessage(harness, {
      invite: {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromUser: { displayName: 'Alice', userId: 'human-user' },
        gameId: 'replay-trivia',
        inviteId: 'inv_after_close',
        status: 'pending',
        toUser: { displayName: 'Computer', userId: REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId }
      },
      type: 'inviteReceived'
    });

    expect(harness.sentMessages).toEqual([]);
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
    expect(createStockfishBestMoveProvider).toHaveBeenCalledWith(expect.any(Object), {
      elo: getChessComputerPlayerStockfishElo(CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)
    });
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

  it('readies, witnesses, and claims Bounty Hunting bounties as normal game actions', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness(BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE);
    let game = submitBountyHunting(
      createBountyHuntingGame('game_bounty_1', 'human-user', harness.player.userId, 0),
      {
        action: 'submitBounties',
        payload: { bounties: createBounties() },
        userId: 'human-user'
      },
      1_000
    );
    harness.games.set(game.gameId, game);

    sendServerMessage(harness, {
      game: toPublicBountyHuntingGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(harness.sentMessages.at(-1)).toEqual({
      action: 'ready',
      gameId: 'game_bounty_1',
      type: 'gameAction'
    });

    game = readyBountyHuntingPlayer(game, harness.player.userId, 2_000);
    game = readyBountyHuntingPlayer(game, 'human-user', 2_000);
    game = startBountyHuntingRound(game, 5_000);
    game = claimBountyHuntingBounty(game, {
      action: 'claimBounty',
      payload: {
        bountyId: 'question',
        messageId: 'msg-question-1',
        messagePublishedAt: 5_500
      },
      userId: 'human-user'
    }, 6_050);
    expect(game.scores.host).toBe(0);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question-1',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1',
            messagePublishedAt: 5_600
          }
        ]
      },
      userId: 'human-user'
    }, 6_100);
    harness.games.set(game.gameId, game);
    vi.setSystemTime(6_100);

    sendServerMessage(harness, {
      game: toPublicBountyHuntingGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(harness.sentMessages.at(-1)).toEqual({
      action: 'observeBountyMessage',
      gameId: 'game_bounty_1',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question-1',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1',
            messagePublishedAt: 5_600
          }
        ]
      },
      type: 'gameAction'
    });

    const witnessAction = harness.sentMessages.at(-1);
    expect(witnessAction?.type).toBe('gameAction');
    if (witnessAction?.type !== 'gameAction') throw new Error('Expected bot witness game action.');

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: witnessAction.payload,
      userId: harness.player.userId
    }, 6_220);
    expect(game.scores.host).toBe(50);
    harness.games.set(game.gameId, game);
    vi.setSystemTime(7_000);

    sendServerMessage(harness, {
      game: toPublicBountyHuntingGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(harness.sentMessages.at(-1)).toEqual({
      action: 'claimBounty',
      gameId: 'game_bounty_1',
      payload: {
        bountyId: 'verified',
        messageId: 'msg-verified-1',
        messagePublishedAt: 5_600
      },
      type: 'gameAction'
    });
  });

  it('schedules from hello snapshots and clears timers when a game disappears', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      snapshot: {
        games: [toPublicChessGame(game, getPlayerInfo)],
        invites: [],
        users: [
          {
            availableGames: ['chess'],
            displayName: 'Alice',
            joinedAt: Date.now(),
            userId: 'human-user'
          },
          {
            availableGames: [...CHESS_COMPUTER_PLAYER_CLUB_PROFILE.availableGames],
            displayName: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.displayName,
            joinedAt: Date.now(),
            userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
          }
        ]
      },
      type: 'helloAccepted',
      userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
    });

    harness.games.delete(game.gameId);
    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).not.toHaveBeenCalled();
  });

  it('skips a pending action when the bot no longer needs to act', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });
    harness.games.set(game.gameId, {
      ...game,
      turn: 'white'
    } as ChessGameRecord);

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(getStockfishBestMove).not.toHaveBeenCalled();
    expect(harness.sentMessages).toEqual([]);
  });

  it('logs and suppresses Stockfish no-move responses before retrying', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    vi.mocked(getStockfishBestMove).mockResolvedValueOnce(createStockfishResult(null));
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.advanceTimersByTimeAsync(1_500);
    await harness.flushWaitUntil();

    expect(harness.sentMessages).toEqual([]);
    expect(harness.logEvent).toHaveBeenCalledWith(
      'chess_bot_stockfish_unavailable',
      expect.objectContaining({
        errorMessage: undefined,
        errorType: undefined,
        reason: 'stockfish_no_move'
      }),
      'warn'
    );
    expect(harness.logEvent).toHaveBeenCalledWith(
      'chess_bot_stockfish_retry_scheduled',
      expect.objectContaining({
        attempt: 1,
        delayMs: 2_000,
        reason: 'stockfish_no_move'
      }),
      'info'
    );
  });

  it('logs send failures when a computed action cannot be sent', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness(CHESS_COMPUTER_PLAYER_CLUB_PROFILE, {
      sendClientMessage: () => {
        throw new Error('room rejected bot action');
      }
    });
    const game = setBotTurnChessGame(harness);

    sendServerMessage(harness, {
      game: toPublicChessGame(game, getPlayerInfo),
      type: 'gameUpdated'
    });

    await vi.runAllTimersAsync();
    await harness.flushWaitUntil();

    expect(harness.sentMessages).toEqual([]);
    expect(harness.logEvent).toHaveBeenCalledWith(
      'computer_player_action_send_failed',
      expect.objectContaining({
        action: 'move',
        errorMessage: 'room rejected bot action',
        errorType: 'Error',
        game: 'game_chess_1'
      }),
      'warn'
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
          availableGames: [...CHESS_COMPUTER_PLAYER_CLUB_PROFILE.availableGames],
          displayName: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.displayName,
          joinedAt: Date.now(),
          userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
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

function createComputerPlayerHarness(
  profile: ComputerPlayerProfile = CHESS_COMPUTER_PLAYER_CLUB_PROFILE,
  options: {
    sendClientMessage?: (message: Exclude<ClientMessage, { type: 'hello' }>) => void;
  } = {}
): {
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
      options.sendClientMessage?.(message);
      sentMessages.push(message);
    },
    waitUntil: (promise) => {
      pending.push(promise);
    }
  }, profile);

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

function setBotTurnChessGame(harness: { games: Map<string, GameRecord>; player: ReturnType<typeof createComputerPlayer> }): ChessGameRecord {
  const game = applyChessMove(createChessGame('game_chess_1', 'human-user', harness.player.userId), {
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
    displayName: getTestDisplayName(userId),
    userId
  };
}

function getTestDisplayName(userId: string): string {
  if (userId === CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId) return CHESS_COMPUTER_PLAYER_CLUB_PROFILE.displayName;
  if (userId === BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId) return BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.displayName;
  return 'Alice';
}

function createBounties() {
  return [
    {
      amount: 50,
      description: 'a message that asks a question',
      id: 'question',
      matcher: { kind: 'question' }
    },
    {
      amount: 75,
      description: 'a message by a verified account',
      id: 'verified',
      matcher: { kind: 'verifiedAuthor' }
    },
    {
      amount: 100,
      description: 'a message in all caps',
      id: 'all-caps',
      matcher: { kind: 'allCaps' }
    },
    {
      amount: 125,
      description: 'a message with 3+ emojis',
      id: 'emoji',
      matcher: { kind: 'emojiCount', min: 3 }
    },
    {
      amount: 150,
      description: 'a message that mentions a user',
      id: 'mention',
      matcher: { kind: 'mention' }
    },
    {
      amount: 175,
      description: 'a message from a top fan',
      id: 'top-fan',
      matcher: { kind: 'topFanAuthor' }
    }
  ];
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
