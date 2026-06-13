import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamRoom } from './stream-room';
import type { PublicChessGame } from '../games/chess';
import {
  createChallenge,
  createSignaturePayload,
  encodeBase64Url
} from '../protocol/identity';
import { TokenBucket } from '../rate-limit';
import {
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type GameId,
  type LobbySnapshot,
  type ServerMessage,
  type SignedClientIdentity
} from '../protocol/messages';
import { ProtocolError } from '../protocol/validation';
import type { DurableObjectState, Env } from '../types';

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
  const state: DurableObjectState = {
    id: {
      toString: () => 'stream-room-id'
    },
    storage: {
      deleteAll: async () => undefined
    },
    waitUntil: () => undefined
  };
  const env = {} as Env;
  return new StreamRoom(state, env) as unknown as PrivateStreamRoom;
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
