import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ComputerPlayer } from './computer-player';
import { applyChessMove, createChessGame, toPublicChessGame } from '../../games/chess';
import { getStockfishBestMove } from '../stockfish-container/client';
import {
  COMPUTER_PLAYER_AVAILABLE_GAMES,
  COMPUTER_PLAYER_DISPLAY_NAME
} from './actions';
import {
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type GameId,
  type LobbySnapshot,
  type PublicGame,
  type ServerMessage
} from '../../protocol/messages';
import type { DurableObjectNamespace, DurableObjectState, DurableObjectStorage, Env } from '../../types';

vi.mock('../stockfish-container/client', () => ({
  createStockfishBestMoveProvider: () => getStockfishBestMove,
  getStockfishBestMove: vi.fn(() => Promise.resolve({
    elapsedMs: 512,
    elo: 1700,
    fenHash: 'h_testfen',
    move: {
      from: 'e7',
      to: 'e5'
    },
    moveTimeMs: 500
  }))
}));

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  listeners = new Map<string, Set<(event: { data?: string }) => void>>();
  readyState = FakeSocket.OPEN;
  sent: ClientMessage[] = [];

  accept(): void {}

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const listeners = this.listeners.get(type) || new Set<(event: { data?: string }) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.readyState = FakeSocket.CLOSED;
  }

  emit(type: string, message?: ServerMessage): void {
    const data = message ? JSON.stringify(message) : undefined;
    this.listeners.get(type)?.forEach((listener) => listener({ data }));
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
}

class FakeDurableObjectStorage implements DurableObjectStorage {
  private readonly records = new Map<string, unknown>();

  async deleteAll(): Promise<void> {
    this.records.clear();
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return cloneStoredValue(this.records.get(key)) as T | undefined;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.records.set(key, cloneStoredValue(value));
  }
}

class FakeDurableObjectState implements DurableObjectState {
  readonly id = {
    toString: () => 'computer-player-id'
  };

  private readonly pending: Promise<unknown>[] = [];

  constructor(readonly storage = new FakeDurableObjectStorage()) {}

  blockConcurrencyWhile(callback: () => Promise<void> | void): void {
    this.waitUntil(Promise.resolve(callback()));
  }

  waitUntil(promise: Promise<unknown>): void {
    this.pending.push(promise);
  }

  async flushWaitUntil(): Promise<void> {
    while (this.pending.length > 0) {
      await Promise.all(this.pending.splice(0));
    }
  }
}

class FakeRoomNamespace implements DurableObjectNamespace {
  readonly requests: Request[] = [];
  readonly socket = new FakeSocket();

  idFromName(name: string) {
    return {
      toString: () => name
    };
  }

  get() {
    return {
      fetch: vi.fn(async (request: Request) => {
        this.requests.push(request);
        const response = new Response(null) as Response & { webSocket: FakeSocket };
        response.webSocket = this.socket;
        return response;
      })
    };
  }
}

describe('computer player Durable Object', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.mocked(getStockfishBestMove).mockClear();
    vi.mocked(getStockfishBestMove).mockResolvedValue(createStockfishResult({ from: 'e7', to: 'e5' }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('connects to the room socket, authenticates as Computer, and accepts invites', async () => {
    const harness = createComputerPlayerHarness();
    await startComputerPlayer(harness);
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] computer_player_socket_connected',
      expect.objectContaining({
        event: 'computer_player_socket_connected',
        room: expect.stringMatching(/^h_[a-z0-9]+$/)
      })
    );

    harness.room.socket.emit('message', {
      challenge: 'challenge-1',
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });

    await vi.waitFor(() => {
      expect(harness.room.socket.sent).toHaveLength(1);
    });
    expect(harness.room.socket.sent[0]).toMatchObject({
      availableGames: [...COMPUTER_PLAYER_AVAILABLE_GAMES],
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    });
    expect(harness.room.requests[0].headers.get('X-Chat-Enhancer-Client-Display-Name')).toBe(COMPUTER_PLAYER_DISPLAY_NAME);

    emitAuthenticatedComputerPlayer(harness);
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] computer_player_authenticated',
      expect.objectContaining({
        event: 'computer_player_authenticated',
        gameCount: 0,
        user: expect.stringMatching(/^h_[a-z0-9]+$/)
      })
    );
    harness.room.socket.emit('message', {
      invite: {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromUser: { displayName: 'Alice', userId: 'human-user' },
        gameId: 'chess',
        inviteId: 'inv_1',
        status: 'pending',
        toUser: { displayName: 'Computer', userId: 'bot-user' }
      },
      type: 'inviteReceived'
    });

    expect(harness.room.socket.sent.at(-1)).toEqual({
      accept: true,
      inviteId: 'inv_1',
      type: 'respondInvite'
    });
  });

  it('submits a Stockfish chess move as a normal game action', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    await startComputerPlayer(harness);
    emitAuthenticatedComputerPlayer(harness);

    const game = applyChessMove(createChessGame('game_chess_1', 'human-user', 'bot-user'), {
      from: 'e2',
      to: 'e4',
      userId: 'human-user'
    });
    harness.room.socket.emit('message', {
      game: toPublicChessGame(game, (userId) => ({
        displayName: userId === 'bot-user' ? 'Computer' : 'Alice',
        userId
      })),
      type: 'gameUpdated'
    });
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] computer_player_action_scheduled',
      expect.objectContaining({
        delayMs: expect.any(Number),
        event: 'computer_player_action_scheduled',
        game: 'game_chess_1',
        gameType: 'chess',
        user: expect.stringMatching(/^h_[a-z0-9]+$/)
      })
    );

    await vi.runAllTimersAsync();
    await harness.state.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledWith(game.fen);
    expect(harness.room.socket.sent.at(-1)).toEqual({
      action: 'move',
      gameId: 'game_chess_1',
      payload: {
        from: 'e7',
        to: 'e5'
      },
      type: 'gameAction'
    });
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] chess_bot_stockfish_move',
      expect.objectContaining({
        event: 'chess_bot_stockfish_move',
        from: 'e7',
        gameType: 'chess',
        source: 'container',
        to: 'e5'
      })
    );
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] computer_player_action_sent',
      expect.objectContaining({
        action: 'move',
        event: 'computer_player_action_sent',
        game: 'game_chess_1',
        gameType: 'chess',
        user: expect.stringMatching(/^h_[a-z0-9]+$/)
      })
    );
  });

  it('leaves active games and closes only after the human is absent for the grace period', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    await startComputerPlayer(harness);
    emitAuthenticatedComputerPlayer(harness);

    const { publicGame } = emitBotTurnChessGame(harness);
    emitPresenceSnapshot(harness, { games: [publicGame], humanConnected: false });

    await vi.advanceTimersByTimeAsync(30_000);
    await harness.state.flushWaitUntil();

    expect(harness.room.socket.readyState).toBe(FakeSocket.OPEN);
    expect(getStockfishBestMove).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(90_000);
    await harness.state.flushWaitUntil();

    expect(harness.room.socket.sent.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game_chess_1',
      type: 'gameAction'
    });
    expect(harness.room.socket.readyState).toBe(FakeSocket.CLOSED);
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] computer_player_human_absent_closed',
      expect.objectContaining({
        activeGameCount: 1,
        event: 'computer_player_human_absent_closed'
      })
    );
  });

  it('cancels the human absence close when a human reconnects', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    await startComputerPlayer(harness);
    emitAuthenticatedComputerPlayer(harness);

    const { publicGame } = emitBotTurnChessGame(harness);
    emitPresenceSnapshot(harness, { games: [publicGame], humanConnected: false });

    await vi.advanceTimersByTimeAsync(60_000);
    await harness.state.flushWaitUntil();
    emitPresenceSnapshot(harness, { games: [publicGame], humanConnected: true });

    await vi.advanceTimersByTimeAsync(120_000);
    await harness.state.flushWaitUntil();

    expect(harness.room.socket.readyState).toBe(FakeSocket.OPEN);
    expect(harness.room.socket.sent).not.toContainEqual({
      action: 'leave',
      gameId: 'game_chess_1',
      type: 'gameAction'
    });
  });

  it('retries a Stockfish chess move after a transient failure', async () => {
    vi.useFakeTimers();
    const harness = createComputerPlayerHarness();
    const error = new Error('Stockfish is cold.');
    vi.mocked(getStockfishBestMove)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(createStockfishResult({ from: 'e7', to: 'e5' }));
    await startComputerPlayer(harness);
    emitAuthenticatedComputerPlayer(harness);

    const { game } = emitBotTurnChessGame(harness);
    const sentBeforeAction = harness.room.socket.sent.length;

    await vi.advanceTimersByTimeAsync(1_500);
    await harness.state.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(1);
    expect(getStockfishBestMove).toHaveBeenCalledWith(game.fen);
    expect(harness.room.socket.sent).toHaveLength(sentBeforeAction);
    expect(console.warn).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] chess_bot_stockfish_unavailable',
      expect.objectContaining({
        errorMessage: 'Stockfish is cold.',
        event: 'chess_bot_stockfish_unavailable',
        game: 'game_chess_1',
        reason: 'stockfish_error'
      })
    );
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] chess_bot_stockfish_retry_scheduled',
      expect.objectContaining({
        attempt: 1,
        delayMs: 2_000,
        event: 'chess_bot_stockfish_retry_scheduled',
        game: 'game_chess_1',
        reason: 'stockfish_error'
      })
    );

    await vi.advanceTimersByTimeAsync(2_000);
    await harness.state.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(2);
    expect(harness.room.socket.sent.at(-1)).toEqual({
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
    await startComputerPlayer(harness);
    emitAuthenticatedComputerPlayer(harness);
    emitBotTurnChessGame(harness);

    await vi.advanceTimersByTimeAsync(1_500);
    await harness.state.flushWaitUntil();
    await vi.advanceTimersByTimeAsync(2_000);
    await harness.state.flushWaitUntil();
    await vi.advanceTimersByTimeAsync(5_000);
    await harness.state.flushWaitUntil();
    await vi.advanceTimersByTimeAsync(10_000);
    await harness.state.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(4);
    expect(harness.room.socket.sent.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game_chess_1',
      type: 'gameAction'
    });
    expect(console.warn).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] chess_bot_stockfish_retry_exhausted',
      expect.objectContaining({
        attempts: 3,
        event: 'chess_bot_stockfish_retry_exhausted',
        game: 'game_chess_1',
        lastReason: 'stockfish_error'
      })
    );
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] computer_player_action_sent',
      expect.objectContaining({
        action: 'leave',
        event: 'computer_player_action_sent',
        game: 'game_chess_1',
        gameType: 'chess'
      })
    );

    await vi.advanceTimersByTimeAsync(9_000);
    await harness.state.flushWaitUntil();

    expect(getStockfishBestMove).toHaveBeenCalledTimes(4);
  });
});

function createComputerPlayerHarness(): {
  player: ComputerPlayer;
  room: FakeRoomNamespace;
  state: FakeDurableObjectState;
} {
  const state = new FakeDurableObjectState();
  const room = new FakeRoomNamespace();
  const env = {
    STREAM_ROOMS: room
  } as unknown as Env;

  return {
    player: new ComputerPlayer(state, env),
    room,
    state
  };
}

async function startComputerPlayer(harness: { player: ComputerPlayer; state: FakeDurableObjectState }): Promise<void> {
  const response = await harness.player.fetch(new Request('https://computer-player.internal/connect', {
    headers: {
      'X-Chat-Enhancer-Stream-Key': 'stream-a'
    },
    method: 'POST'
  }));
  expect(response.status).toBe(200);
  await harness.state.flushWaitUntil();
}

function emitAuthenticatedComputerPlayer(
  harness: { room: FakeRoomNamespace },
  options: { games?: PublicGame[]; humanConnected?: boolean } = {}
): void {
  harness.room.socket.emit('message', {
    snapshot: createLobbySnapshot(options),
    type: 'helloAccepted',
    userId: 'bot-user'
  });
}

function emitBotTurnChessGame(harness: { room: FakeRoomNamespace }) {
  const game = applyChessMove(createChessGame('game_chess_1', 'human-user', 'bot-user'), {
    from: 'e2',
    to: 'e4',
    userId: 'human-user'
  });
  const publicGame = toPublicChessGame(game, getPlayerInfo);
  harness.room.socket.emit('message', {
    game: publicGame,
    type: 'gameUpdated'
  });
  return { game, publicGame };
}

function emitPresenceSnapshot(
  harness: { room: FakeRoomNamespace },
  options: { games?: PublicGame[]; humanConnected?: boolean }
): void {
  harness.room.socket.emit('message', {
    snapshot: createLobbySnapshot(options),
    type: 'presenceSnapshot'
  });
}

function createLobbySnapshot(
  options: { games?: PublicGame[]; humanConnected?: boolean } = {}
): LobbySnapshot {
  const humanConnected = options.humanConnected ?? true;
  return {
    games: options.games ?? [],
    invites: [],
    users: [
      {
        availableGames: [...COMPUTER_PLAYER_AVAILABLE_GAMES],
        displayName: 'Computer',
        joinedAt: Date.now(),
        userId: 'bot-user'
      },
      ...(humanConnected ? [{
        availableGames: ['chess' as GameId],
        displayName: 'Alice',
        joinedAt: Date.now(),
        userId: 'human-user'
      }] : [])
    ]
  };
}

function getPlayerInfo(userId: string): { displayName: string; userId: string } {
  return {
    displayName: userId === 'bot-user' ? 'Computer' : 'Alice',
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

function cloneStoredValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}
