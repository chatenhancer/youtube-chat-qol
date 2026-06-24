import { describe, expect, it } from 'vitest';
import type { GameId, PublicGame } from '../../../shared/playground/protocol';
import type { PlaygroundClientState } from './client';
import {
  createInitialGamesPanelState,
  getAvailablePlayers,
  getOnlinePlayerCount,
  getPendingInvites,
  getSupportedGames,
  isCurrentUserAvailable,
  shouldShowTransportNotice
} from './state';

describe('playground games panel state selectors', () => {
  it('creates initial state and derives transport notices', () => {
    const connected = createTransport({ status: 'connected' });
    const disconnected = createTransport({ status: 'disconnected' });

    expect(createInitialGamesPanelState(true, connected)).toMatchObject({
      activeGameIndex: 0,
      available: true,
      invitedPlayer: '',
      leavingGameId: '',
      mode: 'lobby',
      selectedGameId: null,
      transport: connected
    });
    expect(shouldShowTransportNotice(createInitialGamesPanelState(true, connected))).toBe(false);
    expect(shouldShowTransportNotice(createInitialGamesPanelState(true, disconnected))).toBe(true);
  });

  it('counts only human users available for playable games', () => {
    const state = createInitialGamesPanelState(true, createTransport({
      userId: 'me-user',
      users: [
        createUser('me-user', ['chess']),
        createUser('human-chess', ['chess']),
        createUser('human-chess-two', ['chess']),
        createUser('human-replay', ['replay-trivia']),
        createUser('quiet-user', []),
        createUser('server:computer:chess:club', ['chess'])
      ]
    }));

    expect(getOnlinePlayerCount(state)).toBe(2);
    expect(isCurrentUserAvailable(state.transport, false)).toBe(true);
    expect(isCurrentUserAvailable(createTransport({ userId: 'missing-user' }), true)).toBe(true);
  });

  it('filters pending invites to playable invites for the current user', () => {
    const state = createInitialGamesPanelState(true, createTransport({
      invites: [
        createInvite('invite-1', 'chess', 'me-user', 'pending'),
        createInvite('invite-2', 'replay-trivia', 'other-user', 'pending'),
        createInvite('invite-3', 'chess', 'me-user', 'accepted'),
        createInvite('invite-4', 'unknown' as GameId, 'me-user', 'pending')
      ],
      userId: 'me-user'
    }));

    expect(getPendingInvites(state).map((invite) => invite.inviteId)).toEqual(['invite-1']);
  });

  it('filters available players by game, current user, and active games', () => {
    const state = createInitialGamesPanelState(true, createTransport({
      games: [
        createGame('game-1', 'chess', ['me-user', 'busy-user']),
        createGame('game-2', 'unknown' as GameId, ['me-user', 'other-user'])
      ],
      userId: 'me-user',
      users: [
        createUser('me-user', ['chess']),
        createUser('busy-user', ['chess']),
        createUser('free-user', ['chess']),
        createUser('replay-user', ['replay-trivia'])
      ]
    }));

    expect(getAvailablePlayers(state, 'chess').map((user) => user.userId)).toEqual(['free-user']);
    expect(getAvailablePlayers(state, 'unknown' as GameId)).toEqual([]);
    expect(getSupportedGames(state.transport.games).map((game) => game.gameId)).toEqual(['game-1']);
  });

  it('handles anonymous transport state and games without player maps', () => {
    const state = createInitialGamesPanelState(false, createTransport({
      games: [
        {
          gameId: 'game-without-players',
          gameType: 'chess',
          status: 'active'
        } as PublicGame
      ],
      invites: [
        createInvite('invite-anonymous', 'chess', '', 'pending')
      ],
      userId: '',
      users: [
        createUser('', ['chess']),
        createUser('human-user', ['chess'])
      ]
    }));

    expect(getOnlinePlayerCount(state)).toBe(1);
    expect(getPendingInvites(state).map((invite) => invite.inviteId)).toEqual(['invite-anonymous']);
    expect(getAvailablePlayers(state, 'chess').map((user) => user.userId)).toEqual(['human-user']);
  });
});

function createTransport(overrides: Partial<PlaygroundClientState> = {}): PlaygroundClientState {
  return {
    available: false,
    endedGame: null,
    error: '',
    games: [],
    invites: [],
    status: 'connected',
    userId: 'me-user',
    users: [],
    ...overrides
  };
}

function createUser(userId: string, availableGames: GameId[]) {
  return {
    availableGames,
    displayName: userId,
    joinedAt: 1,
    userId
  };
}

function createInvite(
  inviteId: string,
  gameId: GameId,
  toUserId: string,
  status: 'accepted' | 'ignored' | 'pending'
) {
  return {
    createdAt: 1,
    expiresAt: 2,
    fromUser: {
      displayName: 'Sender',
      userId: 'sender-user'
    },
    gameId,
    inviteId,
    status,
    toUser: {
      displayName: 'Recipient',
      userId: toUserId
    }
  };
}

function createGame(gameId: string, gameType: GameId, userIds: string[]): PublicGame {
  return {
    gameId,
    gameType,
    players: Object.fromEntries(userIds.map((userId, index) => [
      `player-${index}`,
      {
        displayName: userId,
        userId
      }
    ])),
    status: 'active'
  } as PublicGame;
}
