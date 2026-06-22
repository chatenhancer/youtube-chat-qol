import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamRoom } from './stream-room';
import { GAME_STATE_DEFERRED_PERSIST_MS } from './game-state';
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
} from '../../features/computer-player/profiles';
import {
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type GameId,
  type LobbySnapshot,
  type ServerMessage,
  type SignedClientIdentity
} from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';
import type { Env } from '../../types';

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

class FakeDurableObjectStorage {
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

class FakeDurableObjectState {
  readonly id = {
    equals: (other: DurableObjectId) => other.toString() === 'stream-room-id',
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

class FakePlayerStatsNamespace {
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

class FailingPlayerStatsNamespace {
  idFromName(name: string): { toString(): string } {
    return {
      toString: () => name
    };
  }

  get(): { fetch: typeof fetch } {
    return {
      fetch: async () => {
        throw new Error('stats unavailable');
      }
    };
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
    expect(console.info).toHaveBeenCalledWith('[playground] game_started', expect.objectContaining({
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
    expect(updatedChessGame.lastMove).toEqual({
      from: 'e2',
      to: 'e4'
    });
    expect(updatedChessGame.lastMoveSan).toBe('e4');
    expect(updatedChessGame.turn).toBe('black');

    expect(room.createSnapshot(alice.userId).games).toHaveLength(1);
    expect(room.createSnapshot('other-user').games).toHaveLength(0);
  });

  it('uses custom display names from hello and broadcasts display name updates', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');
    const aliceHello = await createHello(alice.challenge, 'Alice', ['chess']);
    aliceHello.displayName = 'Alice Live';

    await room.handleHello(alice, aliceHello);
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));

    expect(alice.displayName).toBe('Alice Live');
    expect(lastMessage(bob, 'presenceSnapshot').snapshot.users).toEqual(expect.arrayContaining([
      expect.objectContaining({
        displayName: 'Alice Live',
        userId: alice.userId
      })
    ]));

    await room.handleSocketMessage(alice, JSON.stringify({
      displayName: 'Luna Chat',
      type: 'setDisplayName'
    }));

    expect(alice.displayName).toBe('Luna Chat');
    expect(lastMessage(bob, 'presenceSnapshot').snapshot.users).toEqual(expect.arrayContaining([
      expect.objectContaining({
        displayName: 'Luna Chat',
        userId: alice.userId
      })
    ]));
    expect(console.info).toHaveBeenCalledWith('[playground] display_name_changed', expect.objectContaining({
      event: 'display_name_changed',
      service: 'chat-enhancer-playground',
      user: expect.any(String)
    }));
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
    expect(console.info).toHaveBeenCalledWith('[playground] game_win_recorded', expect.objectContaining({
      event: 'game_win_recorded',
      game: expect.stringMatching(/^game_[\w-]+$/),
      gameType: 'chess',
      service: 'chat-enhancer-playground',
      wins: 1
    }));
  });

  it('skips global win stats for built-in Computer players', async () => {
    const storage = new FakeDurableObjectStorage();
    const { playerStats, room, state } = createRoomHarness(storage);
    const alice = createSession('alice-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    room.handleInvite(alice, 'chess', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId);
    await state.flushWaitUntil();
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    room.handleGameAction(alice, gameId, {
      action: 'resign',
      userId: alice.userId
    });

    await state.flushWaitUntil();

    expect(playerStats.getWins(CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'chess')).toBe(0);
    expect(console.info).toHaveBeenCalledWith('[playground] game_win_record_skipped', expect.objectContaining({
      event: 'game_win_record_skipped',
      gameType: 'chess',
      reason: 'computerPlayer',
      service: 'chat-enhancer-playground'
    }));
    expect(console.warn).not.toHaveBeenCalledWith('[playground] game_win_record_failed', expect.anything());
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
    expect(updatedChessGame.lastMove).toEqual({
      from: 'e2',
      to: 'e4'
    });
    expect(updatedChessGame.lastMoveSan).toBe('e4');
  });

  it('defers storage writes for active Stick Around realtime updates', async () => {
    const storage = new FakeDurableObjectStorage();
    const { room, state } = createRoomHarness(storage);
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');
    const aliceKeyPair = await createIdentityKeyPair();
    const bobKeyPair = await createIdentityKeyPair();

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['stick-around'], aliceKeyPair));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['stick-around'], bobKeyPair));
    room.handleInvite(alice, 'stick-around', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    try {
      room.handleGameAction(alice, gameId, {
        action: 'ready',
        userId: alice.userId
      });
      room.handleGameAction(bob, gameId, {
        action: 'ready',
        userId: bob.userId
      });
      await state.flushWaitUntil();

      await vi.advanceTimersByTimeAsync(3_000);
      room.handleGameAction(alice, gameId, {
        action: 'startRound',
        userId: alice.userId
      });
      await state.flushWaitUntil();

      const storedActiveGame = await getStoredGame(storage, gameId);
      expect(storedActiveGame).toMatchObject({
        gameId,
        status: 'active'
      });
      const activeFrame = getStoredStickAroundFrame(storedActiveGame);

      await vi.advanceTimersByTimeAsync(40);
      room.handleGameAction(alice, gameId, {
        action: 'input',
        payload: {
          frame: activeFrame,
          jump: false,
          right: true,
          seq: 1
        },
        userId: alice.userId
      });
      room.handleGameAction(bob, gameId, {
        action: 'input',
        payload: {
          frame: activeFrame,
          left: true,
          seq: 1
        },
        userId: bob.userId
      });
      await state.flushWaitUntil();

      expect(getStoredStickAroundFrame(await getStoredGame(storage, gameId))).toBe(activeFrame);

      await vi.advanceTimersByTimeAsync(GAME_STATE_DEFERRED_PERSIST_MS);
      await state.flushWaitUntil();

      expect(getStoredStickAroundFrame(await getStoredGame(storage, gameId))).toBeGreaterThan(activeFrame);
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores legacy Replay Trivia questions without localizations', async () => {
    const storage = new FakeDurableObjectStorage();
    const first = createRoomHarness(storage);
    const room = first.room;
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');
    const aliceKeyPair = await createIdentityKeyPair();
    const bobKeyPair = await createIdentityKeyPair();

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['replay-trivia'], aliceKeyPair));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['replay-trivia'], bobKeyPair));
    room.handleInvite(alice, 'replay-trivia', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    room.handleGameAction(alice, gameId, {
      action: 'submitQuestions',
      payload: {
        questions: [
          {
            choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
            correctChoiceIndex: 0,
            friendIntro: 'chat emergency',
            id: 'q_1',
            prompt: 'Which game won?',
            rightReply: 'nice save.',
            wrongReply: 'you missed it. it was God of War.'
          }
        ]
      },
      userId: alice.userId
    });
    await first.state.flushWaitUntil();

    const stored = await storage.get<{ games: Array<Record<string, unknown>> }>('roomState:v1');
    if (!stored) throw new Error('Expected stored room state.');
    const storedGame = stored.games.find((game) => game.gameId === gameId);
    if (!storedGame) throw new Error('Expected stored Replay Trivia game.');
    const questions = storedGame.questions as Array<Record<string, unknown>>;
    delete questions[0].localizations;
    await storage.put('roomState:v1', stored);

    const restarted = createRoomHarness(storage);
    await restarted.state.flushWaitUntil();
    const reconnectedAlice = createSession('alice-reconnected');
    await restarted.room.handleHello(
      reconnectedAlice,
      await createHello(reconnectedAlice.challenge, 'Alice', ['replay-trivia'], aliceKeyPair)
    );

    const restoredGame = lastMessage(reconnectedAlice, 'helloAccepted').snapshot.games[0];
    expect(restoredGame).toMatchObject({
      currentQuestion: {
        prompt: 'Which game won?'
      },
      gameId
    });
    expect(console.error).not.toHaveBeenCalled();
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

  it('routes game actions and pings through parsed socket messages', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    await room.handleSocketMessage(alice, JSON.stringify({
      action: 'move',
      gameId,
      payload: {
        from: 'e2',
        to: 'e4'
      },
      type: 'gameAction'
    }));
    await room.handleSocketMessage(alice, JSON.stringify({
      id: 'ping-1',
      type: 'ping'
    }));

    expect(lastMessage(bob, 'gameUpdated').game).toMatchObject({
      gameId,
      lastMoveSan: 'e4'
    });
    expect(lastMessage(alice, 'pong')).toEqual({
      id: 'ping-1',
      type: 'pong'
    });
  });

  it('rejects repeat hello, missing invite targets, wrong invite owners, and missing games', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');
    const charlie = createSession('charlie-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    await room.handleHello(charlie, await createHello(charlie.challenge, 'Charlie', ['chess']));

    await expect(room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']))).rejects.toThrowError(new ProtocolError(
      'already_authenticated',
      'This connection is already authenticated.'
    ));
    expect(() => room.handleInvite(alice, 'chess', 'missing-user')).toThrowError(new ProtocolError(
      'user_not_found',
      'That player is not connected.'
    ));
    room.handleInvite(alice, 'chess', bob.userId);
    const inviteId = lastMessage(bob, 'inviteReceived').invite.inviteId;
    expect(() => room.handleInviteResponse(alice, inviteId, true)).toThrowError(new ProtocolError(
      'not_your_invite',
      'That invite is not for you.'
    ));
    expect(() => room.handleGameAction(alice, 'missing-game', {
      action: 'move',
      payload: { from: 'e2', to: 'e4' },
      userId: alice.userId
    })).toThrowError(new ProtocolError('game_not_found', 'Game not found.'));

    room.handleInviteResponse(bob, inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;
    expect(() => room.handleGameAction(charlie, gameId, {
      action: 'leave',
      userId: charlie.userId
    })).toThrowError(new ProtocolError('not_in_game', 'You are not a player in this game.'));
  });

  it('authenticates hello messages without advertised games through socket parsing', async () => {
    const room = createRoom();
    const session = createSession('alice-connection');

    await room.handleSocketMessage(session, JSON.stringify({
      identity: await createSignedIdentity(session.challenge),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }));

    expect(session.userId).not.toBe('');
    expect(session.availableGames.size).toBe(0);
    expect(lastMessage(session, 'helloAccepted').snapshot.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: session.userId })
      ])
    );
  });

  it('logs protocol-version, public-key, internal, and long protocol failures', async () => {
    const room = createRoom();
    const session = createSession('anonymous-connection');

    await room.handleSocketMessage(session, JSON.stringify({
      identity: {},
      protocolVersion: 'old',
      type: 'hello'
    }));
    expect(lastMessage(session, 'error')).toMatchObject({
      code: 'protocol_version',
      type: 'error'
    });
    expect(console.warn).toHaveBeenCalledWith('[playground] protocol_version_mismatch', expect.objectContaining({
      code: 'protocol_version',
      event: 'protocol_version_mismatch'
    }));

    await room.handleSocketMessage(session, JSON.stringify({
      identity: {
        publicKeyJwk: {},
        signature: 'abc'
      },
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }));
    expect(lastMessage(session, 'error')).toMatchObject({
      code: 'invalid_public_key',
      type: 'error'
    });

    const alice = createSession('alice-connection');
    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    alice.rateLimit.consume = vi.fn(() => {
      throw new Error('unexpected failure');
    });
    await room.handleSocketMessage(alice, JSON.stringify({
      id: 'ping-internal',
      type: 'ping'
    }));
    expect(lastMessage(alice, 'error')).toEqual({
      code: 'internal_error',
      message: 'Something went wrong.',
      type: 'error'
    });
    expect(console.error).toHaveBeenCalledWith('[playground] internal_error', expect.objectContaining({
      code: 'internal_error',
      errorMessage: 'unexpected failure',
      errorType: 'Error',
      event: 'internal_error'
    }));

    alice.rateLimit.consume = vi.fn(() => {
      throw new ProtocolError('custom_long', 'x'.repeat(220));
    });
    await room.handleSocketMessage(alice, JSON.stringify({
      id: 'ping-long',
      type: 'ping'
    }));
    expect(console.warn).toHaveBeenCalledWith('[playground] protocol_error', expect.objectContaining({
      code: 'custom_long',
      message: `${'x'.repeat(177)}...`
    }));
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
    expect(console.warn).toHaveBeenCalledWith('[playground] rate_limit_rejected', expect.objectContaining({
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

  it('serves snapshots and rejects non-WebSocket socket requests through fetch', async () => {
    const room = createRoom();

    const snapshotResponse = await room.fetch(new Request('https://playground.chatenhancer.com/snapshot?streamKey=stream-a'));
    await expect(snapshotResponse.json()).resolves.toMatchObject({
      games: [],
      invites: [],
      users: expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Computer',
          userId: 'server:computer:replay-trivia'
        }),
        expect.objectContaining({
          displayName: 'Computer (Club)',
          userId: 'server:computer:chess:club'
        })
      ])
    });

    const socketResponse = await room.fetch(new Request('https://playground.chatenhancer.com/socket?streamKey=stream-a'));
    expect(socketResponse.status).toBe(426);
    await expect(socketResponse.text()).resolves.toBe('Expected WebSocket upgrade.');
  });

  it('reports malformed socket messages without crashing the room', async () => {
    const room = createRoom();
    const session = createSession('anonymous-connection');

    await room.handleSocketMessage(session, {});
    expect(lastMessage(session, 'error')).toEqual({
      code: 'invalid_message',
      message: 'Messages must be strings.',
      type: 'error'
    });
    expect(session.socket.closed).toBe(false);

    await room.handleSocketMessage(session, 'x'.repeat(32_769));
    expect(lastMessage(session, 'error')).toEqual({
      code: 'message_too_large',
      message: 'Message is too large.',
      type: 'error'
    });

    await room.handleSocketMessage(session, '{not-json');
    expect(lastMessage(session, 'error')).toMatchObject({
      code: 'invalid_json',
      type: 'error'
    });
  });

  it('closes the socket when identity verification fails', async () => {
    const room = createRoom();
    const session = createSession('anonymous-connection');
    const hello = await createHello('different-challenge', 'Alice', ['chess']);

    await room.handleSocketMessage(session, JSON.stringify(hello));

    expect(lastMessage(session, 'error')).toMatchObject({
      code: 'invalid_signature',
      type: 'error'
    });
    expect(session.socket.closed).toBe(true);
    expect(session.socket.closeCode).toBe(1008);
  });

  it('rejects unsupported generated-content requests and invalid consume calls', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['chess']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['chess']));
    room.handleInvite(alice, 'chess', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const chessGameId = lastMessage(alice, 'gameStarted').game.gameId;

    expect(() => room.handleGameAction(alice, chessGameId, {
      action: 'requestGenerationToken',
      userId: alice.userId
    })).toThrowError(new ProtocolError(
      'unsupported_action',
      'This game does not support generated content.'
    ));

    const getResponse = await room.fetch(new Request('https://playground.chatenhancer.com/internal/replay-trivia/generation-token/consume?streamKey=stream-a', {
      method: 'GET'
    }));
    expect(getResponse.status).toBe(405);

    const invalidJsonResponse = await room.fetch(new Request('https://playground.chatenhancer.com/internal/replay-trivia/generation-token/consume?streamKey=stream-a', {
      body: '{bad',
      method: 'POST'
    }));
    expect(invalidJsonResponse.status).toBe(400);

    const invalidBodyResponse = await room.fetch(new Request('https://playground.chatenhancer.com/internal/replay-trivia/generation-token/consume?streamKey=stream-a', {
      body: '[]',
      method: 'POST'
    }));
    expect(invalidBodyResponse.status).toBe(400);

    const missingTokenResponse = await room.fetch(new Request('https://playground.chatenhancer.com/internal/replay-trivia/generation-token/consume?streamKey=stream-a', {
      body: JSON.stringify({ gameId: 'game-1', generationToken: '' }),
      method: 'POST'
    }));
    expect(missingTokenResponse.status).toBe(403);
  });

  it('rejects consumed generation tokens after their game leaves the room', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');

    await room.handleHello(alice, await createHello(alice.challenge, 'Alice', ['replay-trivia']));
    await room.handleHello(bob, await createHello(bob.challenge, 'Bob', ['replay-trivia']));
    room.handleInvite(alice, 'replay-trivia', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;
    room.handleGameAction(alice, gameId, {
      action: 'requestGenerationToken',
      userId: alice.userId
    });
    const tokenMessage = lastMessage(alice, 'replayTriviaGenerationToken');
    room.handleGameAction(bob, gameId, {
      action: 'leave',
      userId: bob.userId
    });

    const response = await consumeGenerationToken(room, gameId, tokenMessage.generationToken);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'game_not_found',
        message: 'Game not found.'
      }
    });
  });

  it('sends Replay Trivia updates in each player language', async () => {
    const room = createRoom();
    const alice = createSession('alice-connection');
    const bob = createSession('bob-connection');
    const aliceHello = await createHello(alice.challenge, 'Alice', ['replay-trivia']);
    aliceHello.languageCode = 'es';
    aliceHello.locale = 'es';
    const bobHello = await createHello(bob.challenge, 'Bob', ['replay-trivia']);
    bobHello.languageCode = 'en';
    bobHello.locale = 'en';

    await room.handleHello(alice, aliceHello);
    await room.handleHello(bob, bobHello);
    room.handleInvite(alice, 'replay-trivia', bob.userId);
    room.handleInviteResponse(bob, lastMessage(bob, 'inviteReceived').invite.inviteId, true);
    const gameId = lastMessage(alice, 'gameStarted').game.gameId;

    room.handleGameAction(alice, gameId, {
      action: 'submitQuestions',
      payload: {
        questions: [
          {
            choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
            correctChoiceIndex: 0,
            friendIntro: 'chat emergency',
            id: 'q_1',
            localizations: [
              {
                choices: ['God of War ES', 'Celeste ES', 'Monster Hunter ES', 'Red Dead Redemption 2 ES'],
                friendIntro: 'emergencia del chat',
                languageCode: 'es',
                prompt: 'Que juego gano?',
                rightReply: 'bien salvado.',
                wrongReply: 'fallaste. era God of War ES.'
              }
            ],
            prompt: 'Which game won?',
            rightReply: 'nice save.',
            wrongReply: 'you missed it. it was God of War.'
          }
        ]
      },
      userId: alice.userId
    });

    expect(lastMessage(alice, 'gameUpdated').game).toMatchObject({
      currentQuestion: {
        choices: ['God of War ES', 'Celeste ES', 'Monster Hunter ES', 'Red Dead Redemption 2 ES'],
        prompt: 'Que juego gano?'
      }
    });
    expect(lastMessage(bob, 'gameUpdated').game).toMatchObject({
      currentQuestion: {
        choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
        prompt: 'Which game won?'
      }
    });
  });

  it('logs when completed game win recording fails', async () => {
    const storage = new FakeDurableObjectStorage();
    const { room, state } = createRoomHarness(storage, {
      playerStats: new FailingPlayerStatsNamespace() as unknown as DurableObjectNamespace
    });
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

    expect(console.warn).toHaveBeenCalledWith('[playground] game_win_record_failed', expect.objectContaining({
      errorMessage: 'stats unavailable',
      errorType: 'Error',
      event: 'game_win_record_failed',
      gameType: 'chess',
      service: 'chat-enhancer-playground'
    }));
  });
});

function createRoom(): PrivateStreamRoom {
  return createRoomHarness().room;
}

function createRoomHarness(
  storage = new FakeDurableObjectStorage(),
  options: {
    playerStats?: DurableObjectNamespace;
  } = {}
): {
  playerStats: FakePlayerStatsNamespace;
  room: PrivateStreamRoom;
  state: FakeDurableObjectState;
} {
  const state = new FakeDurableObjectState(storage);
  const playerStats = new FakePlayerStatsNamespace();
  const env = {
    PLAYER_STATS: options.playerStats || playerStats as unknown as DurableObjectNamespace
  } as unknown as Env;
  return {
    playerStats,
    room: new StreamRoom(state as unknown as DurableObjectState, env) as unknown as PrivateStreamRoom,
    state
  };
}

function cloneStoredValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

async function getStoredGame(storage: FakeDurableObjectStorage, gameId: string): Promise<Record<string, unknown>> {
  const stored = await storage.get<{ games?: Array<Record<string, unknown>> }>('roomState:v1');
  const game = stored?.games?.find((candidate) => candidate.gameId === gameId);
  if (!game) throw new Error(`Expected stored game ${gameId}.`);
  return game;
}

function getStoredStickAroundFrame(game: Record<string, unknown>): number {
  const simulation = game.simulation;
  if (!simulation || typeof simulation !== 'object' || Array.isArray(simulation)) {
    throw new Error('Expected stored Stick Around simulation.');
  }
  const frame = (simulation as { frame?: unknown }).frame;
  if (typeof frame !== 'number') throw new Error('Expected stored Stick Around frame.');
  return frame;
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
  ) as Promise<CryptoKeyPair>;
}

async function createSignedIdentity(
  challenge: string,
  keyPair?: CryptoKeyPair
): Promise<SignedClientIdentity> {
  const signingKeyPair = keyPair || await createIdentityKeyPair();
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', signingKeyPair.publicKey) as JsonWebKey;
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
