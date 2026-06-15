import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamRoom } from './stream-room';
import type { PublicChessGame } from '../../games/chess';
import {
  createChallenge,
  createSignaturePayload,
  encodeBase64Url
} from '../../protocol/identity';
import { TokenBucket } from '../../rate-limit';
import {
  CHESS_COMPUTER_PLAYER_CLUB_PROFILE,
  CHESS_COMPUTER_PLAYER_PROFILES
} from '../../features/computer-player/actions';
import {
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type GameId,
  type LobbySnapshot,
  type ServerMessage,
  type SignedClientIdentity
} from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';
import type { DurableObjectNamespace, DurableObjectState, DurableObjectStorage, Env } from '../../types';

interface TestSession {
  availableGames: Set<GameId>;
  challenge: string;
  connectionId: string;
  displayName: string;
  joinedAt: number;
  rateLimit: TokenBucket;
  socket: FakeSocket;
  userId: string;
}

interface PrivateStreamRoom {
  createSnapshot(forUserId?: string): LobbySnapshot;
  fetch(request: Request): Promise<Response>;
  handleGameAction(
    session: TestSession,
    gameId: string,
    action: { action: string; payload?: Record<string, unknown>; userId: string }
  ): void;
  handleHello(session: TestSession, message: Extract<ClientMessage, { type: 'hello' }>): Promise<void>;
  handleInvite(session: TestSession, gameId: GameId, toUserId: string): void;
  handleInviteResponse(session: TestSession, inviteId: string, accept: boolean): void;
  handleSocketMessage(session: TestSession, data: unknown): Promise<void>;
  removeClient(connectionId: string): void;
}

class FakeSocket {
  closed = false;
  closeCode = 0;
  closeReason = '';
  messages: ServerMessage[] = [];

  close(code = 1000, reason = ''): void {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }

  send(data: string): void {
    this.messages.push(JSON.parse(data) as ServerMessage);
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
    toString: () => 'stream-room-id'
  };

  private readonly pending: Promise<unknown>[] = [];

  constructor(readonly storage: FakeDurableObjectStorage) {}

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

class FakePlayerStatsNamespace implements DurableObjectNamespace {
  private readonly wins = new Map<string, Map<string, number>>();

  idFromName(name: string): { toString(): string } {
    return {
      toString: () => name
    };
  }

  get(): { fetch: typeof fetch } {
    return {
      fetch: async (request) => this.handleFetch(request)
    };
  }

  getWins(userId: string, gameId: GameId): number {
    return this.wins.get(userId)?.get(gameId) || 0;
  }

  private async handleFetch(request: RequestInfo | URL): Promise<Response> {
    const requestObject = request instanceof Request ? request : new Request(request);
    const url = new URL(requestObject.url);
    if (url.pathname !== '/internal/player-stats/record-win') {
      return Response.json({ error: { code: 'not_found', message: 'Not found.' } }, { status: 404 });
    }

    const body = await requestObject.json() as { gameId?: GameId; userId?: string };
    const userId = body.userId || '';
    const gameId = body.gameId || 'chess';
    let userWins = this.wins.get(userId);
    if (!userWins) {
      userWins = new Map();
      this.wins.set(userId, userWins);
    }
    userWins.set(gameId, (userWins.get(gameId) || 0) + 1);

    return Response.json({
      ok: true,
      stats: {
        games: Object.fromEntries([...userWins.entries()].map(([storedGameId, wins]) => [
          storedGameId,
          { wins }
        ])),
        userId,
        wins: [...userWins.values()].reduce((total, wins) => total + wins, 0)
      }
    });
  }
}

describe('playground stream room', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the authenticated invite, accept, and chess move flow', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    const aliceDisplayName = alice.displayName;
    const bobDisplayName = bob.displayName;
    expect(aliceDisplayName).toMatch(/^Player [A-Z0-9]{4}$/);
    expect(bobDisplayName).toMatch(/^Player [A-Z0-9]{4}$/);

    const alicePresence = lastMessage(alice, 'presenceSnapshot');
    expect(alicePresence.snapshot.users.map((user) => user.displayName)).toEqual(expect.arrayContaining([
      aliceDisplayName,
      bobDisplayName
    ]));

    room.handleInvite(alice, 'chess', bob.userId);
    const inviteReceived = lastMessage(bob, 'inviteReceived');
    expect(inviteReceived.invite.fromUser.displayName).toBe(aliceDisplayName);
    expect(inviteReceived.invite.toUser.displayName).toBe(bobDisplayName);

    room.handleInviteResponse(bob, inviteReceived.invite.inviteId, true);
    const gameStarted = lastMessage(alice, 'gameStarted');
    const startedChessGame = gameStarted.game as PublicChessGame;
    expect(console.info).toHaveBeenCalledWith('[Chat Enhancer Playground] game_started', expect.objectContaining({
      event: 'game_started',
      game: expect.stringMatching(/^game_[\w-]+$/),
      gameType: 'chess',
      service: 'chat-enhancer-playground'
    }));
    expect(startedChessGame.gameType).toBe('chess');
    expect(startedChessGame.players.white.displayName).toBe(aliceDisplayName);
    expect(startedChessGame.players.black.displayName).toBe(bobDisplayName);

    room.handleGameAction(alice, startedChessGame.gameId, {
      action: 'move',
      payload: {
        from: 'e2',
        to: 'e4'
      },
      userId: alice.userId
    });

    const gameUpdated = lastMessage(bob, 'gameUpdated');
    const updatedChessGame = gameUpdated.game as PublicChessGame;
    expect(updatedChessGame.lastMoveSan).toBe('e4');
    expect(updatedChessGame.turn).toBe('black');

    expect(room.createSnapshot(alice.userId).games).toHaveLength(1);
    expect(room.createSnapshot('other-user').games).toHaveLength(0);
  });

  it('rejects duplicate active games with the same player and game type', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess', 'replay-trivia']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess', 'replay-trivia']));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);

    expect(() => room.handleInvite(alice, 'chess', bob.userId)).toThrowError(new ProtocolError(
      'game_already_active',
      'You already have this game active with that player.'
    ));

    room.handleInvite(alice, 'replay-trivia', bob.userId);
    expect(lastMessage(bob, 'inviteReceived').invite.gameId).toBe('replay-trivia');
  });

  it('rejects accepting a stale duplicate same-game invite', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    room.handleInvite(alice, 'chess', bob.userId);
    const aliceInviteId = lastMessage(bob, 'inviteReceived').invite.inviteId;
    room.handleInvite(bob, 'chess', alice.userId);
    const bobInviteId = lastMessage(alice, 'inviteReceived').invite.inviteId;

    room.handleInviteResponse(bob, aliceInviteId, true);

    expect(() => room.handleInviteResponse(alice, bobInviteId, true)).toThrowError(new ProtocolError(
      'game_already_active',
      'You already have this game active with that player.'
    ));
  });

  it('uses the built-in Computer players for presence and games', async () => {
    const { room, state } = createRoomHarness();
    const alice = createSession('alice-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    const chessComputerUsers = room.createSnapshot(alice.userId).users
      .filter((user) => user.userId !== alice.userId && user.availableGames.includes('chess'));
    expect(chessComputerUsers.map((user) => user.displayName)).toEqual(
      CHESS_COMPUTER_PLAYER_PROFILES.map((profile) => profile.displayName)
    );

    const computerPresence = getPresenceUser(room, alice.userId, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId);
    expect(computerPresence).toMatchObject({
      availableGames: [...CHESS_COMPUTER_PLAYER_CLUB_PROFILE.availableGames],
      displayName: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.displayName,
      userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
    });

    room.handleInvite(alice, 'chess', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId);
    await state.flushWaitUntil();

    expect(lastMessage(alice, 'inviteUpdated').invite.status).toBe('accepted');
    const startedChessGame = lastMessage(alice, 'gameStarted').game as PublicChessGame;
    expect(startedChessGame.players.white.userId).toBe(alice.userId);
    expect(startedChessGame.players.black).toEqual({
      displayName: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.displayName,
      userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
    });
    expect(room.createSnapshot(alice.userId).games.map((game) => game.gameId)).toEqual([startedChessGame.gameId]);
  });

  it('mints one-use Replay Trivia generation tokens for the question provider', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['replay-trivia']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['replay-trivia']));
    room.handleInvite(alice, 'replay-trivia', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    expect(() => room.handleGameAction(bob, gameId, {
      action: 'requestGenerationToken',
      userId: bob.userId
    })).toThrowError(new ProtocolError(
      'not_question_provider',
      'Only the question provider can generate Replay Trivia questions.'
    ));

    room.handleGameAction(alice, gameId, {
      action: 'requestGenerationToken',
      userId: alice.userId
    });
    const tokenMessage = lastMessage(alice, 'replayTriviaGenerationToken');
    expect(tokenMessage).toMatchObject({
      expiresAt: expect.any(Number),
      gameId,
      generationToken: expect.stringMatching(/^rtg_[a-f0-9]+$/),
      type: 'replayTriviaGenerationToken'
    });

    const consumeResponse = await consumeGenerationToken(room, gameId, tokenMessage.generationToken);
    expect(consumeResponse.status).toBe(200);
    expect(await consumeResponse.json()).toMatchObject({
      gameId,
      ok: true,
      userId: alice.userId
    });

    const replayResponse = await consumeGenerationToken(room, gameId, tokenMessage.generationToken);
    expect(replayResponse.status).toBe(403);
    expect(await replayResponse.json()).toEqual({
      error: {
        code: 'invalid_generation_token',
        message: 'Replay Trivia generation token is invalid or expired.'
      }
    });
  });

  it('keeps ignored invites from starting a game', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    room.handleInvite(alice, 'chess', bob.userId);

    const inviteReceived = lastMessage(bob, 'inviteReceived');
    room.handleInviteResponse(bob, inviteReceived.invite.inviteId, false);

    expect(bob.socket.messages.some((message) => message.type === 'gameStarted')).toBe(false);
    expect(room.createSnapshot(bob.userId).games).toHaveLength(0);
    expect(lastMessage(alice, 'inviteUpdated').invite.status).toBe('ignored');
  });

  it('keeps active games resumable when a player disconnects', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    room.removeClient(bob.connectionId);

    expect(alice.socket.messages.some((message) => message.type === 'gameEnded')).toBe(false);
    expect(room.createSnapshot(alice.userId).games.map((game) => game.gameId)).toEqual([gameId]);
  });

  it('records completed game wins by user and game type', async () => {
    const storage = new FakeDurableObjectStorage();
    const { playerStats, room, state } = createRoomHarness(storage);
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    room.handleGameAction(bob, gameId, {
      action: 'resign',
      userId: bob.userId
    });

    await state.flushWaitUntil();

    expect(playerStats.getWins(alice.userId, 'chess')).toBe(1);
    expect(console.info).toHaveBeenCalledWith('[Chat Enhancer Playground] game_win_recorded', expect.objectContaining({
      event: 'game_win_recorded',
      game: expect.stringMatching(/^game_[\w-]+$/),
      gameType: 'chess',
      service: 'chat-enhancer-playground',
      wins: 1
    }));
  });

  it('restores active games from Durable Object storage after restart', async () => {
    const storage = new FakeDurableObjectStorage();
    const first = createRoomHarness(storage);
    const room = first.room;
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');
    const aliceKeyPair = await createIdentityKeyPair();
    const bobKeyPair = await createIdentityKeyPair();

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess'], aliceKeyPair));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess'], bobKeyPair));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;
    await first.state.flushWaitUntil();
    await expect(storage.get('roomState:v1')).resolves.toMatchObject({
      games: [expect.objectContaining({ gameId })]
    });

    const restarted = createRoomHarness(storage);
    await restarted.state.flushWaitUntil();
    const reconnectedAlice = createSession('alice-reconnected');
    await restarted.room.handleHello(
      reconnectedAlice,
      await createHello(reconnectedAlice.challenge, 'Alice', ['chess'], aliceKeyPair)
    );

    expect(lastMessage(reconnectedAlice, 'helloAccepted').snapshot.games.map((game) => game.gameId)).toEqual([gameId]);

    restarted.room.handleGameAction(reconnectedAlice, gameId, {
      action: 'move',
      payload: {
        from: 'e2',
        to: 'e4'
      },
      userId: reconnectedAlice.userId
    });

    const updatedChessGame = lastMessage(reconnectedAlice, 'gameUpdated').game as PublicChessGame;
    expect(updatedChessGame.lastMoveSan).toBe('e4');
  });

  it('restores the built-in Computer display name for active games after restart', async () => {
    const storage = new FakeDurableObjectStorage();
    const first = createRoomHarness(storage);
    const room = first.room;
    const alice = createSession('alice-connection');
    const aliceKeyPair = await createIdentityKeyPair();

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess'], aliceKeyPair));
    room.handleInvite(alice, 'chess', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId);
    await first.state.flushWaitUntil();
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;
    await first.state.flushWaitUntil();
    await expect(storage.get('roomState:v1')).resolves.toMatchObject({
      games: [expect.objectContaining({ gameId })]
    });

    const restarted = createRoomHarness(storage);
    await restarted.state.flushWaitUntil();
    const reconnectedAlice = createSession('alice-reconnected');
    await restarted.room.handleHello(
      reconnectedAlice,
      await createHello(reconnectedAlice.challenge, 'Alice', ['chess'], aliceKeyPair)
    );

    const restoredGame = lastMessage(reconnectedAlice, 'helloAccepted').snapshot.games[0] as PublicChessGame;
    expect(restoredGame.players.black).toEqual({
      displayName: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.displayName,
      userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
    });
  });

  it('destroys an active game when a player explicitly leaves', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    room.handleGameAction(bob, gameId, {
      action: 'leave',
      userId: bob.userId
    });

    expect(lastMessage(alice, 'gameEnded')).toEqual({
      gameId,
      reason: 'playerLeft',
      type: 'gameEnded',
      userId: bob.userId
    });
    expect(lastMessage(bob, 'gameEnded')).toEqual({
      gameId,
      reason: 'playerLeft',
      type: 'gameEnded',
      userId: bob.userId
    });
    expect(room.createSnapshot(alice.userId).games).toHaveLength(0);
    expect(room.createSnapshot(bob.userId).games).toHaveLength(0);
  });

  it('rejects self invites, unavailable players, and wrong-turn moves', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', []));

    expect(() => room.handleInvite(alice, 'chess', alice.userId)).toThrowError(new ProtocolError(
      'self_invite',
      'Choose another player.'
    ));
    expect(() => room.handleInvite(alice, 'chess', bob.userId)).toThrowError(new ProtocolError(
      'user_unavailable',
      'That player is not available for this game.'
    ));

    await room.handleSocketMessage(bob, JSON.stringify({
      availableGames: ['chess'],
      type: 'setAvailability'
    }));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    expect(() => room.handleGameAction(bob, gameId, {
      action: 'move',
      payload: {
        from: 'e7',
        to: 'e5'
      },
      userId: bob.userId
    })).toThrowError(new ProtocolError('not_your_turn', 'It is not your turn.'));
  });

  it('sends an error and closes when messages arrive before hello', async () => {
    const room = createRoom();
    const session = createSession('anonymous-connection');

    await room.handleSocketMessage(session, JSON.stringify({
      id: 'ping-1',
      type: 'ping'
    }));

    expect(lastMessage(session, 'error')).toEqual({
      code: 'hello_required',
      message: 'Send hello before other messages.',
      type: 'error'
    });
    expect(session.socket.closed).toBe(true);
    expect(session.socket.closeCode).toBe(1008);
  });

  it('rate limits noisy messages on one connection', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      for (let index = 0; index < 30; index += 1) {
        await room.handleSocketMessage(alice, JSON.stringify({
          id: `ping-${index}`,
          type: 'ping'
        }));
      }

      await room.handleSocketMessage(alice, JSON.stringify({
        id: 'ping-rate-limited',
        type: 'ping'
      }));
    } finally {
      vi.useRealTimers();
    }

    expect(lastMessage(alice, 'error')).toEqual({
      code: 'rate_limited',
      message: 'Slow down before sending more playground messages.',
      type: 'error'
    });
    expect(alice.socket.closed).toBe(false);
  });

  it('rate limits the same user identity across multiple connections', async () => {
    const room = createRoom();
    const aliceOne = createSession('alice-connection-1');
    const aliceTwo = createSession('alice-connection-2');
    const bob = createSession('bob-connection');
    const aliceKeyPair = await createIdentityKeyPair();

    await room.handleHello(aliceOne, await createHello(aliceOne.challenge, 'Alice', ['chess'], aliceKeyPair));
    await room.handleHello(aliceTwo, await createHello(aliceTwo.challenge, 'Alice', ['chess'], aliceKeyPair));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    expect(aliceOne.userId).toBe(aliceTwo.userId);

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      for (const session of [aliceOne, aliceOne, aliceTwo]) {
        await room.handleSocketMessage(session, JSON.stringify({
          gameId: 'chess',
          toUserId: bob.userId,
          type: 'invite'
        }));
      }

      await room.handleSocketMessage(aliceTwo, JSON.stringify({
        gameId: 'chess',
        toUserId: bob.userId,
        type: 'invite'
      }));
    } finally {
      vi.useRealTimers();
    }

    expect(lastMessage(aliceTwo, 'error')).toEqual({
      code: 'rate_limited',
      message: 'Slow down before sending more playground messages.',
      type: 'error'
    });
    expect(console.warn).toHaveBeenCalledWith('[Chat Enhancer Playground] rate_limit_rejected', expect.objectContaining({
      code: 'rate_limited',
      event: 'rate_limit_rejected',
      service: 'chat-enhancer-playground',
      user: expect.stringMatching(/^h_[a-z0-9]+$/)
    }));
    expect(lastMessage(bob, 'inviteReceived').invite.fromUser.userId).toBe(aliceOne.userId);
  });

  it('uses the latest availability for the same user across multiple connections', async () => {
    const room = createRoom();
    const aliceOne = createSession('alice-connection-1');
    const aliceTwo = createSession('alice-connection-2');
    const bob = createSession('bob-connection');
    const aliceKeyPair = await createIdentityKeyPair();

    await room.handleHello(aliceOne, await createHello(aliceOne.challenge, 'Alice', ['chess'], aliceKeyPair));
    await room.handleHello(aliceTwo, await createHello(aliceTwo.challenge, 'Alice', ['chess'], aliceKeyPair));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    expect(aliceOne.userId).toBe(aliceTwo.userId);
    expect(getPresenceUser(room, bob.userId, aliceOne.userId)?.availableGames).toEqual(['chess']);

    await room.handleSocketMessage(aliceTwo, JSON.stringify({
      availableGames: [],
      type: 'setAvailability'
    }));

    expect(getPresenceUser(room, bob.userId, aliceOne.userId)?.availableGames).toEqual([]);
    expect(() => room.handleInvite(bob, 'chess', aliceOne.userId)).toThrowError(new ProtocolError(
      'user_unavailable',
      'That player is not available for this game.'
    ));
  });
});

function createRoom(): PrivateStreamRoom {
  return createRoomHarness().room;
}

function createRoomHarness(storage = new FakeDurableObjectStorage()): {
  playerStats: FakePlayerStatsNamespace;
  room: PrivateStreamRoom;
  state: FakeDurableObjectState;
} {
  const state = new FakeDurableObjectState(storage);
  const playerStats = new FakePlayerStatsNamespace();
  const env = {
    PLAYER_STATS: playerStats
  } as unknown as Env;
  return {
    playerStats,
    room: new StreamRoom(state, env) as unknown as PrivateStreamRoom,
    state
  };
}

function cloneStoredValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

function createSession(connectionId: string): TestSession {
  return {
    availableGames: new Set(),
    challenge: createChallenge(),
    connectionId,
    displayName: 'Player',
    joinedAt: Date.now(),
    rateLimit: new TokenBucket({
      capacity: 30,
      refillPerSecond: 10
    }),
    socket: new FakeSocket(),
    userId: ''
  };
}

function consumeGenerationToken(room: PrivateStreamRoom, gameId: string, generationToken: string): Promise<Response> {
  return room.fetch(new Request('https://playground.chatenhancer.com/internal/replay-trivia/generation-token/consume', {
    body: JSON.stringify({
      gameId,
      generationToken
    }),
    headers: {
      'Content-Type': 'application/json',
      'X-Chat-Enhancer-Stream-Key': 'SHt3FyE-VIQ'
    },
    method: 'POST'
  }));
}

async function createHello(
  challenge: string,
  _displayName: string,
  availableGames: GameId[],
  keyPair?: CryptoKeyPair
): Promise<Extract<ClientMessage, { type: 'hello' }>> {
  return {
    availableGames,
    identity: await createSignedIdentity(challenge, keyPair),
    protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
    type: 'hello'
  };
}

async function createIdentityKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );
}

async function createSignedIdentity(
  challenge: string,
  keyPair?: CryptoKeyPair
): Promise<SignedClientIdentity> {
  const signingKeyPair = keyPair || await createIdentityKeyPair();
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', signingKeyPair.publicKey);
  const signature = new Uint8Array(await crypto.subtle.sign(
    {
      hash: 'SHA-256',
      name: 'ECDSA'
    },
    signingKeyPair.privateKey,
    createSignaturePayload(challenge)
  ));

  return {
    publicKeyJwk,
    signature: encodeBase64Url(signature)
  };
}

function lastMessage<Type extends ServerMessage['type']>(
  session: TestSession,
  type: Type
): Extract<ServerMessage, { type: Type }> {
  const message = [...session.socket.messages].reverse().find((candidate) => candidate.type === type);
  if (!message) throw new Error(`Expected ${type} message.`);
  return message as Extract<ServerMessage, { type: Type }>;
}

function getPresenceUser(
  room: PrivateStreamRoom,
  forUserId: string,
  userId: string
): LobbySnapshot['users'][number] | undefined {
  return room.createSnapshot(forUserId).users.find((user) => user.userId === userId);
}
