import { describe, expect, it } from 'vitest';
import { ProtocolError } from '../../protocol/validation';
import {
  claimBountyHuntingBounty,
  createBountyHuntingGame,
  finishBountyHuntingGame,
  readyBountyHuntingPlayer,
  startBountyHuntingRound,
  submitBountyHunting,
  timeoutBountyHuntingGame,
  toPublicBountyHuntingGame,
  bountyHuntingGameModule
} from './index';

describe('playground Bounty Hunting game rules', () => {
  it('prepares bounties, starts when both players are ready, claims, and finishes', () => {
    let game = createBountyHuntingGame('game-1', 'host-user', 'guest-user', 1_000);

    expect(game.status).toBe('preparing');
    expect(game.bountyProviderUserId).toBe('host-user');

    game = submitBountyHunting(game, {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 2_000);
    expect(game.status).toBe('ready');
    expect(game.bounties).toHaveLength(6);

    game = readyBountyHuntingPlayer(game, 'host-user', 3_000);
    expect(game.status).toBe('ready');
    expect(game.readyPlayers.host).toBe(true);

    game = readyBountyHuntingPlayer(game, 'guest-user', 4_000);
    expect(game.status).toBe('countdown');
    expect(game.phaseStartedAt).toBe(4_000);
    expect(() => claimBountyHuntingBounty(game, {
      action: 'claimBounty',
      payload: {
        bountyId: 'mention-user',
        authorName: '@Chatter',
        messageId: 'msg-early',
        text: 'hello @Luna'
      },
      userId: 'guest-user'
    }, 5_000)).toThrowError(new ProtocolError(
      'not_active',
      'This bounty round is not active.'
    ));
    expect(() => startBountyHuntingRound(game, 6_999)).toThrowError(new ProtocolError(
      'countdown_active',
      'This bounty round countdown is still active.'
    ));

    game = startBountyHuntingRound(game, 7_000);
    expect(game.status).toBe('active');
    expect(game.phaseStartedAt).toBe(7_000);

    game = claimBountyHuntingBounty(game, {
      action: 'claimBounty',
      payload: {
        bountyId: 'mention-user',
        authorName: '@Chatter',
        messageId: 'msg-1',
        text: 'hello @Luna'
      },
      userId: 'guest-user'
    }, 8_000);
    expect(game.scores.guest).toBe(125);
    expect(game.claims[0]).toMatchObject({
      bountyId: 'mention-user',
      role: 'guest',
      userId: 'guest-user'
    });

    game = timeoutBountyHuntingGame(game, 67_000);
    expect(game.status).toBe('roundOver');
    expect(() => finishBountyHuntingGame(game, 68_999)).toThrowError(new ProtocolError(
      'round_over_visible',
      'Round over is still visible.'
    ));

    game = finishBountyHuntingGame(game, 69_000);
    expect(game.status).toBe('finished');
    expect(bountyHuntingGameModule.getWinnerUserId?.(game)).toBe('guest-user');

    const publicGame = toPublicBountyHuntingGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.bounties.find((bounty) => bounty.id === 'mention-user')?.claim?.role).toBe('guest');
    expect(publicGame.winnerUserId).toBe('guest-user');
  });

  it('toggles player ready state before the round starts', () => {
    let game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 1_000);

    game = readyBountyHuntingPlayer(game, 'host-user', 2_000);
    expect(game.status).toBe('ready');
    expect(game.readyPlayers.host).toBe(true);

    game = readyBountyHuntingPlayer(game, 'host-user', 3_000);
    expect(game.status).toBe('ready');
    expect(game.readyPlayers.host).toBe(false);

    game = readyBountyHuntingPlayer(game, 'host-user', 4_000);
    game = readyBountyHuntingPlayer(game, 'guest-user', 5_000);
    expect(game.status).toBe('countdown');
    expect(game.phaseStartedAt).toBe(5_000);
  });

  it('rejects invalid providers, bad claims, duplicate messages, and early timeouts', () => {
    const preparingGame = createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0);
    expect(() => submitBountyHunting(preparingGame, {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'guest-user'
    })).toThrowError(new ProtocolError(
      'not_bounty_provider',
      'Only the bounty provider can prepare Bounty Hunting.'
    ));

    let game = submitBountyHunting(preparingGame, {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 0);
    game = readyBountyHuntingPlayer(readyBountyHuntingPlayer(game, 'host-user', 0), 'guest-user', 0);
    game = startBountyHuntingRound(game, 3_000);

    expect(() => timeoutBountyHuntingGame(game, 1_000)).toThrowError(new ProtocolError(
      'time_remaining',
      'This bounty round still has time remaining.'
    ));
    expect(() => claimBountyHuntingBounty(game, {
      action: 'claimBounty',
      payload: {
        bountyId: 'question',
        authorName: '@Chatter',
        messageId: 'msg-1',
        text: 'not a question'
      },
      userId: 'host-user'
    }, 1_000)).toThrowError(new ProtocolError(
      'bounty_mismatch',
      'That chat message does not claim this bounty.'
    ));

    game = claimBountyHuntingBounty(game, {
      action: 'claimBounty',
      payload: {
        bountyId: 'question',
        authorName: '@Chatter',
        messageId: 'msg-1',
        text: 'is this a question?'
      },
      userId: 'host-user'
    }, 2_000);
    expect(() => claimBountyHuntingBounty(game, {
      action: 'claimBounty',
      payload: {
        bountyId: 'has-number',
        authorName: '@Chatter',
        messageId: 'msg-1',
        text: '42'
      },
      userId: 'guest-user'
    }, 2_100)).toThrowError(new ProtocolError(
      'message_claimed',
      'This chat message already claimed a bounty.'
    ));
  });

  it('handles actions through the game module interface', () => {
    const game = bountyHuntingGameModule.createGame('game-1', ['host-user', 'guest-user']);
    const readyGame = bountyHuntingGameModule.applyAction(game, {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    });

    expect(readyGame.status).toBe('ready');
    expect(bountyHuntingGameModule.getRecipientUserIds(readyGame)).toEqual(['host-user', 'guest-user']);
    expect(bountyHuntingGameModule.canUserAccessGame(readyGame, 'host-user')).toBe(true);
    expect(bountyHuntingGameModule.canUserAccessGame(readyGame, 'other-user')).toBe(false);
    expect(() => bountyHuntingGameModule.applyAction(readyGame, {
      action: 'dance',
      userId: 'host-user'
    })).toThrowError(new ProtocolError('unsupported_action', 'Unsupported Bounty Hunting action.'));
  });
});

function createBounties() {
  return [
    {
      amount: 50,
      description: 'a message that has 3+ emojis',
      id: 'emoji-3',
      matcher: { kind: 'emojiCount', min: 3 }
    },
    {
      amount: 50,
      description: 'a message in all caps',
      id: 'all-caps',
      matcher: { kind: 'allCaps', minLetters: 4 }
    },
    {
      amount: 75,
      description: 'a message that asks a question',
      id: 'question',
      matcher: { kind: 'question' }
    },
    {
      amount: 125,
      description: 'a message that mentions a user',
      id: 'mention-user',
      matcher: { kind: 'mention' }
    },
    {
      amount: 75,
      description: 'a message with a number',
      id: 'has-number',
      matcher: { kind: 'number' }
    },
    {
      amount: 100,
      description: 'a message with a link',
      id: 'has-link',
      matcher: { kind: 'url' }
    }
  ];
}
