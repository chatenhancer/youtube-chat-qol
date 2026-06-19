import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProtocolError } from '../../protocol/validation';
import type { GameRecord } from '../../games/types';
import { GameState } from './game-state';
import { GenerationTokens } from './generation-token';
import { InviteManager } from './invite-manager';
import {
  getPlayerDisplayName,
  sendMessage,
  SessionManager,
  type ClientSession
} from './session-manager';

describe('stream room state managers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores only supported stored games and logs ignored entries', async () => {
    const logEvent = vi.fn();
    const state = createDurableObjectState({
      games: [
        createStoredGame('game-1', 'chess'),
        { gameId: 'unsupported-1', gameType: 'unknown-game', status: 'active' },
        { gameId: 123, gameType: 'chess', status: 'active' },
        null
      ]
    });
    const games = new GameState(state, logEvent);

    await games.load();

    expect(games.get('game-1')).toMatchObject({
      gameId: 'game-1',
      gameType: 'chess'
    });
    expect(games.values()).toHaveLength(1);
    expect(logEvent).toHaveBeenCalledWith('stored_game_ignored', {
      game: expect.any(String)
    }, 'warn');
    expect(logEvent).toHaveBeenCalledWith('stored_game_ignored', {
      game: undefined
    }, 'warn');
    expect(logEvent).toHaveBeenCalledWith('room_state_restored', {
      gameCount: 1
    });
  });

  it('handles missing and failed game state storage defensively', async () => {
    const invalidLog = vi.fn();
    const invalidState = createDurableObjectState({
      games: 'not-an-array'
    });
    const invalidGames = new GameState(invalidState, invalidLog);
    await invalidGames.load();
    expect(invalidGames.values()).toEqual([]);
    expect(invalidLog).not.toHaveBeenCalled();

    const failedLog = vi.fn();
    const failedState = createDurableObjectState(null, {
      getError: new Error('storage unavailable')
    });
    const failedGames = new GameState(failedState, failedLog);
    await failedGames.load();
    expect(failedLog).toHaveBeenCalledWith('room_state_restore_failed', {
      errorMessage: 'storage unavailable',
      errorType: 'Error'
    }, 'warn');
  });

  it('queues game state writes and logs persist failures', async () => {
    const logEvent = vi.fn();
    const state = createDurableObjectState(null);
    const games = new GameState(state, logEvent);

    games.set(createStoredGame('game-1', 'chess'));
    games.delete('game-1');
    await Promise.all(state.pending);

    expect(state.storage.put).toHaveBeenCalledTimes(2);
    expect(state.storage.put).toHaveBeenLastCalledWith('roomState:v1', {
      games: []
    });

    const failedState = createDurableObjectState(null, {
      putError: new Error('write failed')
    });
    const failedGames = new GameState(failedState, logEvent);
    failedGames.set(createStoredGame('game-2', 'chess'));
    await Promise.all(failedState.pending);

    expect(logEvent).toHaveBeenCalledWith('room_state_persist_failed', {
      errorMessage: 'write failed',
      errorType: 'Error'
    }, 'warn');
  });

  it('creates, consumes, expires, and rate limits generation tokens', () => {
    const tokens = new GenerationTokens({
      capacity: 3,
      refillPerSecond: 0
    }, {
      capacity: 1,
      refillPerSecond: 0
    });

    tokens.assertWithinRateLimit('alice', 0);
    expect(() => tokens.assertWithinRateLimit('alice', 0)).toThrowError(new ProtocolError(
      'rate_limited',
      'Slow down before requesting more generated content.'
    ));
    tokens.assertWithinRateLimit('bob', 0);
    expect(() => tokens.assertWithinRateLimit('carol', 0)).toThrowError(new ProtocolError(
      'rate_limited',
      'Slow down before requesting more generated content.'
    ));

    expect(tokens.create({
      expiresAt: 100,
      gameId: 'game-1',
      generationToken: 'token-1',
      now: 0,
      userId: 'alice'
    })).toBe('token-1');
    expect(tokens.consume('other-game', 'token-1', 50)).toBeNull();
    expect(tokens.consume('game-1', 'token-1', 50)).toBeNull();

    tokens.create({
      expiresAt: 100,
      gameId: 'game-1',
      generationToken: 'token-2',
      now: 0,
      userId: 'alice'
    });
    expect(tokens.consume('game-1', 'token-2', 100)).toBeNull();

    tokens.create({
      expiresAt: 200,
      gameId: 'game-1',
      generationToken: 'token-3',
      now: 0,
      userId: 'alice'
    });
    expect(tokens.consume('game-1', 'token-3', 100)).toEqual({
      expiresAt: 200,
      gameId: 'game-1',
      userId: 'alice'
    });
    expect(tokens.consume('game-1', 'token-3', 100)).toBeNull();
  });

  it('manages pending invites and public invite visibility', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const invites = new InviteManager();
    const invite = invites.createInvite({
      fromUserId: 'alice',
      gameId: 'chess',
      inviteId: 'invite-1',
      now: 100,
      toUserId: 'bob',
      ttlMs: 50
    });

    expect(invites.getPendingInvite('invite-1')).toBe(invite);
    expect(invites.getPublicInvites('alice', getPublicUser)).toEqual([
      expect.objectContaining({
        fromUser: { displayName: 'Alice', userId: 'alice' },
        status: 'pending',
        toUser: { displayName: 'Bob', userId: 'bob' }
      })
    ]);
    expect(invites.getPublicInvites('', getPublicUser)).toEqual([]);
    expect(invites.getPublicInvites('carol', getPublicUser)).toEqual([]);

    invites.setInviteStatus(invite, 'ignored');
    expect(() => invites.getPendingInvite('invite-1')).toThrowError(new ProtocolError(
      'invite_not_found',
      'Invite not found.'
    ));

    const expired = invites.createInvite({
      fromUserId: 'alice',
      gameId: 'chess',
      inviteId: 'invite-2',
      now: 100,
      toUserId: 'bob',
      ttlMs: 1
    });
    expect(invites.toPublicInvite(expired, getPublicUser).inviteId).toBe('invite-2');
    vi.mocked(Date.now).mockReturnValue(101);
    expect(() => invites.getPendingInvite('invite-2')).toThrowError(new ProtocolError(
      'invite_not_found',
      'Invite not found.'
    ));
  });

  it('deduplicates sessions into presence users and preserves availability while a user remains connected', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const sessions = new SessionManager();
    const first = createSession('connection-1');
    const second = createSession('connection-2');
    sessions.authenticate(first, 'alice', ['chess'], 'Alice');
    vi.mocked(Date.now).mockReturnValue(2_000);
    sessions.authenticate(second, 'alice', ['replay-trivia'], '');

    expect(sessions.get('connection-1')).toBe(first);
    expect(sessions.getPresenceUser('alice')).toEqual({
      availableGames: ['replay-trivia'],
      displayName: 'Alice',
      joinedAt: 1_000,
      userId: 'alice'
    });
    expect(sessions.getPublicUser('missing-user')).toEqual({
      displayName: 'Player MISS',
      userId: 'missing-user'
    });

    sessions.setAvailability(first, ['chess', 'replay-trivia']);
    expect(sessions.getPresenceUser('alice')?.availableGames).toEqual(['chess', 'replay-trivia']);
    sessions.setDisplayName(second, 'Luna Chat');
    expect(sessions.getPresenceUser('alice')?.displayName).toBe('Luna Chat');
    expect(sessions.getPublicUser('alice')).toEqual({
      displayName: 'Luna Chat',
      userId: 'alice'
    });
    expect(sessions.remove('missing')).toBeUndefined();
    expect(sessions.remove('connection-1')).toBe(first);
    expect(sessions.getPresenceUser('alice')?.availableGames).toEqual(['chess', 'replay-trivia']);
    expect(sessions.remove('connection-2')).toBe(second);
    expect(sessions.getPresenceUser('alice')).toBeUndefined();
    expect(sessions.getPublicUser('alice')).toEqual({
      displayName: 'Luna Chat',
      userId: 'alice'
    });
  });

  it('sends direct and broadcast messages only to authenticated socket sessions', () => {
    const sessions = new SessionManager();
    const aliceSocket = createSocket();
    const unauthenticatedSocket = createSocket();
    const alice = createSession('connection-1', aliceSocket);
    const unauthenticated = createSession('connection-2', unauthenticatedSocket);
    const socketless = createSession('connection-3');
    sessions.authenticate(alice, 'alice', ['chess'], 'Alice');
    sessions.authenticate(socketless, 'bob', ['chess'], 'Bob');
    sessions.get('connection-2')?.socket;
    (unauthenticated as ClientSession).userId = '';
    (unauthenticated as ClientSession).socket = unauthenticatedSocket as unknown as WebSocket;

    sessions.sendToUser('alice', {
      invite: {
        createdAt: 0,
        expiresAt: 1,
        fromUser: { displayName: 'Bob', userId: 'bob' },
        gameId: 'chess',
        inviteId: 'invite-1',
        status: 'pending',
        toUser: { displayName: 'Alice', userId: 'alice' }
      },
      type: 'inviteReceived'
    });
    sessions.sendToUser('missing', { type: 'presenceSnapshot', snapshot: createLobbySnapshot() });

    expect(aliceSocket.send).toHaveBeenCalledOnce();
    expect(unauthenticatedSocket.send).not.toHaveBeenCalled();

    sessions.broadcastPresence((userId) => ({
      ...createLobbySnapshot(),
      users: [{ availableGames: ['chess'], displayName: userId, joinedAt: 0, userId }]
    }));
    expect(aliceSocket.send).toHaveBeenCalledTimes(2);
    expect(unauthenticatedSocket.send).not.toHaveBeenCalled();
  });

  it('closes sockets when message sending throws and builds fallback player labels', () => {
    const socket = createSocket();
    socket.send.mockImplementationOnce(() => {
      throw new Error('socket closed');
    });

    sendMessage(socket as unknown as WebSocket, { type: 'presenceSnapshot', snapshot: createLobbySnapshot() });

    expect(socket.close).toHaveBeenCalledOnce();
    expect(getPlayerDisplayName('')).toBe('Player 0000');
    expect(getPlayerDisplayName('server:computer:chess:club')).toBe('Player SERV');
  });
});

function createStoredGame(gameId: string, gameType: string): GameRecord {
  return {
    gameId,
    gameType,
    status: 'active'
  } as GameRecord;
}

function createDurableObjectState(
  storedValue: unknown,
  options: {
    getError?: unknown;
    putError?: unknown;
  } = {}
): DurableObjectState & {
  pending: Promise<unknown>[];
  storage: {
    get: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };
} {
  const pending: Promise<unknown>[] = [];
  const storage = {
    get: vi.fn(async () => {
      if (options.getError) throw options.getError;
      return storedValue;
    }),
    put: vi.fn(async () => {
      if (options.putError) throw options.putError;
    })
  };
  return {
    pending,
    storage,
    waitUntil: vi.fn((promise: Promise<unknown>) => {
      pending.push(promise);
    })
  } as unknown as DurableObjectState & {
    pending: Promise<unknown>[];
    storage: {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    };
  };
}

function getPublicUser(userId: string) {
  return {
    displayName: userId === 'alice' ? 'Alice' : 'Bob',
    userId
  };
}

function createSession(connectionId: string, socket?: ReturnType<typeof createSocket>): ClientSession {
  return {
    availableGames: new Set(),
    challenge: `${connectionId}:challenge`,
    connectionId,
    displayName: '',
    joinedAt: 0,
    languageCode: 'en',
    rateLimit: {} as ClientSession['rateLimit'],
    socket: socket as unknown as WebSocket | undefined,
    userId: ''
  };
}

function createSocket() {
  return {
    close: vi.fn(),
    send: vi.fn()
  };
}

function createLobbySnapshot() {
  return {
    games: [],
    invites: [],
    users: []
  };
}
