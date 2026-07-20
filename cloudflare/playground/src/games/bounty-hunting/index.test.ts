import { describe, expect, it } from 'vitest';
import {
  BOUNTY_HUNTING_MISS_COOLDOWN_MS,
  BOUNTY_HUNTING_ROUND_MS
} from '../../../../../src/shared/playground/bounty-hunting';
import { ProtocolError } from '../../protocol/validation';
import {
  createBountyHuntingGame,
  finishBountyHuntingGame,
  observeBountyHuntingMessage as applyBountyHuntingObservation,
  readyBountyHuntingPlayer,
  shootBountyHuntingMessage as applyBountyHuntingShot,
  startBountyHuntingRound,
  submitBountyHunting,
  timeoutBountyHuntingGame,
  toPublicBountyHuntingGame,
  bountyHuntingGameModule
} from './index';

describe('playground Bounty Hunting game rules', () => {
  it('rejects the removed single-observation payload shape', () => {
    expect(() => applyBountyHuntingObservation(createActiveBountyHuntingGame(), {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'legacy-message'
      },
      userId: 'host-user'
    }, 3_100)).toThrowError(new ProtocolError(
      'invalid_bounty',
      'Bounty Hunting observations are required.'
    ));
  });

  it('requires one matching observation in every shot', () => {
    const game = createActiveBountyHuntingGame();
    expect(() => applyBountyHuntingShot(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-1' },
      userId: 'host-user'
    }, 3_100)).toThrowError(new ProtocolError(
      'invalid_bounty',
      'A Bounty Hunting shot observation is required.'
    ));
    expect(() => applyBountyHuntingShot(game, {
      action: 'shootBounty',
      payload: {
        messageId: 'msg-1',
        observations: [{ bountyIds: [], messageId: 'msg-2' }]
      },
      userId: 'host-user'
    }, 3_100)).toThrowError(new ProtocolError(
      'invalid_bounty',
      'A Bounty Hunting shot observation must match its messageId.'
    ));
  });

  it('requires the shot observation itself to confirm the match', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-peer-match',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_050);

    game = applyBountyHuntingShot(game, {
      action: 'shootBounty',
      payload: createShotPayload('msg-peer-match'),
      userId: 'host-user'
    }, 3_100);

    expect(game.claims).toHaveLength(0);
    expect(game.missCooldownUntilByRole.host).toBe(
      3_100 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    );
  });

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
    expect(() => shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-early' },
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

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [{
          bountyIds: ['mention-user'],
          messageId: 'msg-1',
          messageTimestampUsec: '7000001'
        }]
      },
      userId: 'host-user'
    }, 7_500);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-1' },
      userId: 'guest-user'
    }, 8_000);
    expect(game.scores.guest).toBe(125);
    expect(game.claims[0]).toMatchObject({
      bountyId: 'mention-user',
      role: 'guest',
      userId: 'guest-user'
    });
    expect(game.claimWitnesses).toHaveLength(0);

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

  it('enforces miss cooldowns until their exact server deadline without extending them', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-question',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_050);

    const cooldownGame = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-no-match' },
      userId: 'host-user'
    }, 3_100);
    expect(cooldownGame.missCooldownUntilByRole?.host).toBe(
      3_100 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    );
    expect(shootBountyHuntingMessage(cooldownGame, {
      action: 'shootBounty',
      payload: { messageId: 'msg-another-miss' },
      userId: 'host-user'
    }, 4_000)).toBe(cooldownGame);
    expect(shootBountyHuntingMessage(cooldownGame, {
      action: 'shootBounty',
      payload: { messageId: 'msg-question' },
      userId: 'host-user'
    }, 8_099)).toBe(cooldownGame);

    game = shootBountyHuntingMessage(cooldownGame, {
      action: 'shootBounty',
      payload: { messageId: 'msg-question' },
      userId: 'host-user'
    }, 8_100);

    expect(game.scores.host).toBe(75);
    expect(game.claims).toHaveLength(1);
  });

  it('uses board order as the stable tie-breaker between equal-value witnessed bounties', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['has-number', 'question'],
        messageId: 'msg-multiple',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_050);

    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: {
        messageId: 'msg-multiple'
      },
      userId: 'host-user'
    }, 3_100);

    expect(game.claims).toHaveLength(1);
    expect(game.claims[0]).toMatchObject({
      bountyId: 'question',
      messageId: 'msg-multiple',
      role: 'host'
    });
    expect(game.scores.host).toBe(75);
  });

  it('selects the highest-value witnessed bounty even when a lower-value match appears first', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['emoji-3', 'mention-user'],
        messageId: 'msg-different-values',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_050);

    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: {
        bountyId: 'emoji-3',
        messageId: 'msg-different-values'
      },
      userId: 'host-user'
    }, 3_100);

    expect(game.claims).toHaveLength(1);
    expect(game.claims[0]).toMatchObject({
      bountyId: 'mention-user',
      messageId: 'msg-different-values',
      role: 'host'
    });
    expect(game.scores.host).toBe(125);
  });

  it('applies a miss cooldown when a shot has no stored witness for an open bounty', () => {
    const game = createActiveBountyHuntingGame();
    const missedGame = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: {
        messageId: 'msg-no-match'
      },
      userId: 'host-user'
    }, 3_100);

    expect(missedGame.missCooldownUntilByRole?.host).toBe(
      3_100 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    );
    expect(missedGame.claims).toHaveLength(0);
  });

  it('queues a self-witnessed shot until the opposing player witnesses the same match', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-race',
        messageTimestampUsec: '3000001'
      },
      userId: 'host-user'
    }, 3_050);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: {
        messageId: 'msg-race'
      },
      userId: 'host-user'
    }, 3_100);

    expect(game.claims).toHaveLength(0);
    expect(game.pendingClaims).toMatchObject([{
      bountyId: 'question',
      messageId: 'msg-race',
      role: 'host'
    }]);
    expect(game).not.toHaveProperty('claimedMessageIds');
    expect(game.claimWitnesses[0]).not.toHaveProperty('userId');
    expect(game.pendingClaims[0]).not.toHaveProperty('userId');
    expect(game.missCooldownUntilByRole?.host).toBeUndefined();
    expect(toPublicBountyHuntingGame(
      game,
      (userId) => ({ displayName: userId, userId }),
      { recipientUserId: 'host-user' }
    )).toMatchObject({ pendingClaimMessageId: 'msg-race' });
    expect(toPublicBountyHuntingGame(
      game,
      (userId) => ({ displayName: userId, userId }),
      { recipientUserId: 'guest-user' }
    )).not.toHaveProperty('pendingClaimMessageId');

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-race',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_500);

    expect(game.claims).toMatchObject([{
      bountyId: 'question',
      messageId: 'msg-race',
      role: 'host'
    }]);
    expect(game.scores.host).toBe(75);
  });

  it('ends the round instead of resolving a pending claim from a late witness', () => {
    let game = createActiveBountyHuntingGame();
    const roundEndsAt = game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS;
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-at-cutoff',
        messageTimestampUsec: '3000001'
      },
      userId: 'host-user'
    }, roundEndsAt - 100);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-at-cutoff' },
      userId: 'host-user'
    }, roundEndsAt - 50);

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-at-cutoff',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, roundEndsAt);

    expect(game.status).toBe('roundOver');
    expect(game.scores.host).toBe(0);
    expect(game.claims).toHaveLength(0);
    expect(game.pendingClaims).toHaveLength(0);
    expect(game.claimWitnesses).toHaveLength(0);
  });

  it('keeps the exact winning message harmless and penalizes a different stale shot', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-winner',
            messageTimestampUsec: '3000001'
          },
          {
            bountyIds: ['question'],
            messageId: 'msg-stale',
            messageTimestampUsec: '3000002'
          }
        ]
      },
      userId: 'guest-user'
    }, 3_050);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: {
        messageId: 'msg-winner'
      },
      userId: 'host-user'
    }, 3_100);

    expect(shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: {
        messageId: 'msg-winner'
      },
      userId: 'guest-user'
    }, 3_200)).toBe(game);

    const missedGame = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: {
        messageId: 'msg-stale'
      },
      userId: 'guest-user'
    }, 3_300);
    expect(missedGame.missCooldownUntilByRole?.guest).toBe(
      3_300 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    );
  });

  it('keeps player cooldowns independent', () => {
    let game = shootBountyHuntingMessage(createActiveBountyHuntingGame(), {
      action: 'shootBounty',
      payload: { messageId: 'msg-host-miss' },
      userId: 'host-user'
    }, 3_100);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-guest-miss' },
      userId: 'guest-user'
    }, 3_200);

    expect(game.missCooldownUntilByRole).toEqual({
      guest: 3_200 + BOUNTY_HUNTING_MISS_COOLDOWN_MS,
      host: 3_100 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    });

    const preparingGame = {
      ...createBountyHuntingGame('game-reset', 'host-user', 'guest-user', 0),
      missCooldownUntilByRole: { host: 9_000 }
    };
    const submittedGame = submitBountyHunting(preparingGame, {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 1_000);

    expect(createBountyHuntingGame('game-new', 'host-user', 'guest-user', 0).missCooldownUntilByRole).toEqual({});
    expect(submittedGame.missCooldownUntilByRole).toEqual({});
  });

  it('ignores another shot while a claim is pending and still resolves the original', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-first',
            messageTimestampUsec: '3000001'
          },
          {
            bountyIds: ['question'],
            messageId: 'msg-second',
            messageTimestampUsec: '3000002'
          }
        ]
      },
      userId: 'host-user'
    }, 3_050);
    const pendingGame = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-first' },
      userId: 'host-user'
    }, 3_100);
    game = shootBountyHuntingMessage(pendingGame, {
      action: 'shootBounty',
      payload: { messageId: 'msg-second' },
      userId: 'host-user'
    }, 3_200);

    expect(game).toBe(pendingGame);
    expect(game.pendingClaims).toHaveLength(1);
    expect(game.pendingClaims[0].messageId).toBe('msg-first');
    expect(game.missCooldownUntilByRole?.host).toBeUndefined();

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-first',
            messageTimestampUsec: '3000001'
          },
          {
            bountyIds: ['question'],
            messageId: 'msg-second',
            messageTimestampUsec: '3000002'
          }
        ]
      },
      userId: 'guest-user'
    }, 3_300);

    expect(game.claims).toHaveLength(1);
    expect(game.claims[0].messageId).toBe('msg-first');
    expect(game.missCooldownUntilByRole?.host).toBeUndefined();
  });

  it('penalizes an earlier pending shot when a later shot wins the same bounty', () => {
    let game = createActiveBountyHuntingGame();
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-host-pending',
        messageTimestampUsec: '3000001'
      },
      userId: 'host-user'
    }, 3_050);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-host-pending' },
      userId: 'host-user'
    }, 3_100);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-guest-winner',
        messageTimestampUsec: '3000002'
      },
      userId: 'guest-user'
    }, 3_150);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-guest-winner' },
      userId: 'guest-user'
    }, 3_200);

    expect(game.pendingClaims.map((claim) => claim.messageId)).toEqual([
      'msg-host-pending',
      'msg-guest-winner'
    ]);

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-guest-winner',
        messageTimestampUsec: '3000002'
      },
      userId: 'host-user'
    }, 3_500);

    expect(game.claims).toMatchObject([{
      bountyId: 'question',
      messageId: 'msg-guest-winner',
      role: 'guest'
    }]);
    expect(game.pendingClaims).toHaveLength(0);
    expect(game.missCooldownUntilByRole?.host).toBe(
      3_500 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    );
    expect(game.missCooldownUntilByRole?.guest).toBeUndefined();
  });

  it('exposes only the recipient player miss deadline in public state', () => {
    let game = createActiveBountyHuntingGame();
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-host-miss' },
      userId: 'host-user'
    }, 3_100);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-guest-miss' },
      userId: 'guest-user'
    }, 3_200);
    const getUser = (userId: string) => ({ displayName: userId, userId });

    const hostGame = bountyHuntingGameModule.toPublicGame(game, getUser, {
      recipientUserId: 'host-user'
    });
    const guestGame = toPublicBountyHuntingGame(game, getUser, {
      recipientUserId: 'guest-user'
    });
    const contextFreeGame = toPublicBountyHuntingGame(game, getUser);
    const outsiderGame = toPublicBountyHuntingGame(game, getUser, {
      recipientUserId: 'other-user'
    });

    expect(hostGame).toMatchObject({
      missCooldownUntil: 3_100 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    });
    expect(guestGame.missCooldownUntil).toBe(3_200 + BOUNTY_HUNTING_MISS_COOLDOWN_MS);
    expect(hostGame).not.toHaveProperty('missCooldownUntilByRole');
    expect(guestGame).not.toHaveProperty('missCooldownUntilByRole');
    expect(contextFreeGame).not.toHaveProperty('missCooldownUntil');
    expect(outsiderGame).not.toHaveProperty('missCooldownUntil');
  });

  it('requires an opposing witness, resolves pending claims, and ignores the winning message afterward', () => {
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

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-1',
        messageTimestampUsec: '3000001'
      },
      userId: 'host-user'
    }, 3_050);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-1' },
      userId: 'host-user'
    }, 3_100);
    expect(game.scores.host).toBe(0);

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-1',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_500);
    expect(game.scores.host).toBe(75);
    expect(game.claims[0]).toMatchObject({
      bountyId: 'question',
      messageId: 'msg-1',
      role: 'host'
    });

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['has-number'],
        messageId: 'msg-1',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_600);
    expect(game.scores.host).toBe(75);
    expect(shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-1' },
      userId: 'guest-user'
    }, 3_700)).toBe(game);
    expect(game.missCooldownUntilByRole?.guest).toBeUndefined();
  });

  it('resolves a self-witnessed claim when the opposing witness arrives much later', () => {
    let game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 0);
    game = readyBountyHuntingPlayer(readyBountyHuntingPlayer(game, 'host-user', 0), 'guest-user', 0);
    game = startBountyHuntingRound(game, 3_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-1',
        messageTimestampUsec: '3000001'
      },
      userId: 'host-user'
    }, 3_050);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-1' },
      userId: 'host-user'
    }, 3_100);
    const pendingGame = game;
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-1',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 30_000);

    expect(pendingGame.pendingClaims).toHaveLength(1);
    expect(pendingGame.missCooldownUntilByRole?.host).toBeUndefined();
    expect(game.scores.host).toBe(75);
    expect(game.claims).toMatchObject([{
      bountyId: 'question',
      messageId: 'msg-1',
      role: 'host'
    }]);
    expect(game.pendingClaims).toHaveLength(0);
    expect(game.missCooldownUntilByRole?.host).toBeUndefined();
  });

  it('bounds and deduplicates stored witness records', () => {
    let game = createActiveBountyHuntingGame();
    const bountyIds = createBounties().map((bounty) => bounty.id);

    for (let batch = 0; batch < 13; batch += 1) {
      game = observeBountyHuntingMessage(game, {
        action: 'observeBountyMessage',
        payload: {
          observations: Array.from({ length: 20 }, (_, index) => ({
            bountyIds,
            messageId: `msg-${batch}-${index}`,
            messageTimestampUsec: String(3_000_001 + batch * 20 + index)
          }))
        },
        userId: 'host-user'
      }, 3_100 + batch * 100);
    }

    expect(game.claimWitnesses).toHaveLength(240);
    expect(new Set(game.claimWitnesses.map((witness) =>
      `${witness.role}:${witness.messageId}`
    )).size).toBe(240);
    expect(game.claimWitnesses.some((witness) => witness.messageId === 'msg-0-0')).toBe(false);
    expect(game.claimWitnesses.some((witness) => witness.messageId === 'msg-12-19')).toBe(true);

    const duplicatePayload = {
      observations: [
        {
          bountyIds: ['question', 'question'],
          messageId: 'msg-duplicate',
          messageTimestampUsec: '3000100'
        },
        {
          bountyIds: ['question'],
          messageId: 'msg-duplicate',
          messageTimestampUsec: '3000100'
        }
      ]
    };
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: duplicatePayload,
      userId: 'guest-user'
    }, 3_500);

    expect(game.claimWitnesses.filter((witness) =>
      witness.role === 'guest'
      && witness.messageId === 'msg-duplicate'
      && witness.bountyIds.includes('question')
    )).toHaveLength(1);
    expect(game.claimWitnesses).toHaveLength(240);
  });

  it('scales observation costs and defers persistence only for internal witness updates', () => {
    const game = createActiveBountyHuntingGame();
    const observationAction = {
      action: 'observeBountyMessage',
      payload: {
        observations: Array.from({ length: 20 }, (_, index) => ({
          bountyIds: ['question'],
          messageId: `msg-policy-${index}`,
          messageTimestampUsec: String(3_000_001 + index)
        }))
      },
      userId: 'guest-user'
    };
    const witnessedGame = observeBountyHuntingMessage(game, observationAction, 3_100);

    expect(bountyHuntingGameModule.getActionRateCost?.({
      action: observationAction.action,
      game,
      payload: observationAction.payload
    })).toBe(5);
    expect(bountyHuntingGameModule.getActionRateCost?.({
      action: 'ready',
      game
    })).toBeUndefined();
    expect(bountyHuntingGameModule.getActionRateCost?.({
      action: 'shootBounty',
      game,
      payload: createShotPayload('msg-policy-0')
    })).toBe(6.1);
    expect(bountyHuntingGameModule.getStatePersistence?.({
      action: observationAction,
      nextGame: witnessedGame,
      previousGame: game
    })).toBe('deferred');

    const claimedGame = shootBountyHuntingMessage(witnessedGame, {
      action: 'shootBounty',
      payload: { messageId: 'msg-policy-0' },
      userId: 'host-user'
    }, 3_200);
    expect(bountyHuntingGameModule.getStatePersistence?.({
      action: {
        action: 'observeBountyMessage',
        userId: 'guest-user'
      },
      nextGame: claimedGame,
      previousGame: witnessedGame
    })).toBe('immediate');
  });

  it('accepts witnessed messages with post-start timestamps', () => {
    let game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 0);
    game = readyBountyHuntingPlayer(readyBountyHuntingPlayer(game, 'host-user', 0), 'guest-user', 0);
    game = startBountyHuntingRound(game, 3_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-old',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_100);

    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-old' },
      userId: 'host-user'
    }, 3_200);

    expect(game.scores.host).toBe(75);
  });

  it('rejects witnesses at or before the server round start timestamp and penalizes their shots', () => {
    let game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 0);
    game = readyBountyHuntingPlayer(readyBountyHuntingPlayer(game, 'host-user', 0), 'guest-user', 0);
    game = startBountyHuntingRound(game, {
      action: 'startRound',
      userId: 'host-user'
    }, 3_000);

    expect(game.roundStartTimestampUsec).toBe('3000000');

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-old',
        messageTimestampUsec: '2999999'
      },
      userId: 'guest-user'
    }, 3_100);
    expect(game.claimWitnesses).toHaveLength(0);

    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-old' },
      userId: 'guest-user'
    }, 3_200);
    expect(game.missCooldownUntilByRole?.guest).toBe(
      3_200 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    );

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-new',
        messageTimestampUsec: '3000001'
      },
      userId: 'guest-user'
    }, 3_300);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-new' },
      userId: 'host-user'
    }, 3_400);

    expect(game.scores.host).toBe(75);
    expect(toPublicBountyHuntingGame(game, (userId) => ({ displayName: userId, userId }))).toMatchObject({
      roundStartTimestampUsec: '3000000'
    });
  });

  it('rejects witnesses without message timestamps after the round starts and penalizes their shots', () => {
    let game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 0);
    game = readyBountyHuntingPlayer(readyBountyHuntingPlayer(game, 'host-user', 0), 'guest-user', 0);
    game = startBountyHuntingRound(game, {
      action: 'startRound',
      userId: 'host-user'
    }, 3_000);

    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-old'
      },
      userId: 'guest-user'
    }, 3_100);
    expect(game.claimWitnesses).toHaveLength(0);

    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-old' },
      userId: 'host-user'
    }, 3_200);

    expect(game.scores.host).toBe(0);
    expect(game.missCooldownUntilByRole?.host).toBe(
      3_200 + BOUNTY_HUNTING_MISS_COOLDOWN_MS
    );
  });

  it('accepts multiple witness observations in one game action', () => {
    let game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: { bounties: createBounties() },
      userId: 'host-user'
    }, 0);
    game = readyBountyHuntingPlayer(readyBountyHuntingPlayer(game, 'host-user', 0), 'guest-user', 0);
    game = startBountyHuntingRound(game, 3_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question',
            messageTimestampUsec: '3000001'
          },
          {
            bountyIds: ['has-number'],
            messageId: 'msg-number',
            messageTimestampUsec: '3000002'
          }
        ]
      },
      userId: 'guest-user'
    }, 3_100);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-question' },
      userId: 'host-user'
    }, 3_200);
    game = shootBountyHuntingMessage(game, {
      action: 'shootBounty',
      payload: { messageId: 'msg-number' },
      userId: 'host-user'
    }, 3_300);

    expect(game.scores.host).toBe(150);
    expect(game.claims.map((claim) => claim.bountyId)).toEqual(['question', 'has-number']);
  });

  it('accepts YouTube-native privacy-safe bounty matchers', () => {
    const game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: {
        bounties: [
          {
            amount: 100,
            description: 'a message from a channel member',
            id: 'channel-member',
            matcher: { kind: 'channelMemberAuthor' }
          },
          {
            amount: 100,
            description: 'a message from a moderator',
            id: 'moderator',
            matcher: { kind: 'moderatorAuthor' }
          },
          {
            amount: 125,
            description: 'a message from the channel owner',
            id: 'channel-owner',
            matcher: { kind: 'channelOwnerAuthor' }
          },
          {
            amount: 125,
            description: 'a Super Chat',
            id: 'super-chat',
            matcher: { kind: 'superChat' }
          },
          {
            amount: 75,
            description: 'a message with a custom emoji',
            id: 'custom-emoji',
            matcher: { kind: 'customEmoji' }
          },
          {
            amount: 100,
            description: 'a message with only emojis',
            id: 'only-emojis',
            matcher: { kind: 'onlyEmojis' }
          }
        ]
      },
      userId: 'host-user'
    }, 0);

    expect(game.status).toBe('ready');
    expect(game.bounties.map((bounty) => bounty.matcher.kind)).toEqual([
      'channelMemberAuthor',
      'moderatorAuthor',
      'channelOwnerAuthor',
      'superChat',
      'customEmoji',
      'onlyEmojis'
    ]);
  });

  it('preserves validated bounty description keys', () => {
    const bounties = createBounties().map((bounty) => ({
      ...bounty,
      descriptionKey: 'gamesBountyHuntingBountyQuestion'
    }));
    const game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: { bounties },
      userId: 'host-user'
    }, 0);

    expect(game.bounties.every((bounty) => bounty.descriptionKey === 'gamesBountyHuntingBountyQuestion')).toBe(true);

    expect(() => submitBountyHunting(createBountyHuntingGame('game-2', 'host-user', 'guest-user', 0), {
      action: 'submitBounties',
      payload: {
        bounties: createBounties().map((bounty, index) => ({
          ...bounty,
          descriptionKey: index === 0 ? 'gamesBountyHuntingBountyNope' : 'gamesBountyHuntingBountyQuestion'
        }))
      },
      userId: 'host-user'
    }, 0)).toThrowError(new ProtocolError('invalid_bounty', 'Bounty description key is not supported.'));
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
    expect(bountyHuntingGameModule.getStatePersistence).toBeTypeOf('function');

    const actionStartedAt = Date.now();
    const activeGame = {
      ...createActiveBountyHuntingGame(),
      phaseStartedAt: actionStartedAt
    };
    const missedGame = bountyHuntingGameModule.applyAction(activeGame, {
      action: 'shootBounty',
      payload: createShotPayload('msg-host-no-match'),
      userId: 'host-user'
    });
    expect(missedGame).toMatchObject({
      missCooldownUntilByRole: {
        host: expect.any(Number)
      }
    });
    expect(bountyHuntingGameModule.applyAction(activeGame, {
      action: 'shootBounty',
      payload: createShotPayload('msg-no-match'),
      userId: 'guest-user'
    })).toMatchObject({
      missCooldownUntilByRole: {
        guest: expect.any(Number)
      }
    });
    expect(toPublicBountyHuntingGame(activeGame, (userId) => ({ displayName: userId, userId }), {
      recipientUserId: 'host-user'
    })).not.toHaveProperty('missCooldownUntil');
    expect(bountyHuntingGameModule.toPublicGame(
      missedGame,
      (userId) => ({ displayName: userId, userId }),
      { recipientUserId: 'host-user' }
    )).toMatchObject({
      missCooldownUntil: expect.any(Number)
    });
    expect(() => bountyHuntingGameModule.applyAction(activeGame, {
      action: 'claimBounty',
      payload: { bountyId: 'question', messageId: 'msg-legacy-claim' },
      userId: 'host-user'
    })).toThrowError(new ProtocolError('unsupported_action', 'Unsupported Bounty Hunting action.'));
    expect(() => bountyHuntingGameModule.applyAction(activeGame, {
      action: 'missBounty',
      userId: 'host-user'
    })).toThrowError(new ProtocolError('unsupported_action', 'Unsupported Bounty Hunting action.'));
    expect(() => bountyHuntingGameModule.applyAction(readyGame, {
      action: 'dance',
      userId: 'host-user'
    })).toThrowError(new ProtocolError('unsupported_action', 'Unsupported Bounty Hunting action.'));
  });
});

function shootBountyHuntingMessage(
  game: Parameters<typeof applyBountyHuntingShot>[0],
  input: Parameters<typeof applyBountyHuntingShot>[1],
  now?: number
): ReturnType<typeof applyBountyHuntingShot> {
  const payload = input.payload || {};
  const messageId = String(payload.messageId || '');
  const matchingWitnesses = game.claimWitnesses.filter((witness) => witness.messageId === messageId);
  const bountyIds = [...new Set(matchingWitnesses
    .flatMap((witness) => witness.bountyIds))];
  const messageTimestampUsec = matchingWitnesses.find((witness) => witness.messageTimestampUsec)
    ?.messageTimestampUsec;
  return applyBountyHuntingShot(game, {
    ...input,
    payload: {
      ...payload,
      observations: payload.observations || [{
        bountyIds,
        messageId,
        ...(messageTimestampUsec ? { messageTimestampUsec } : {})
      }]
    }
  }, now);
}

function observeBountyHuntingMessage(
  game: Parameters<typeof applyBountyHuntingObservation>[0],
  input: Parameters<typeof applyBountyHuntingObservation>[1],
  now?: number
): ReturnType<typeof applyBountyHuntingObservation> {
  const payload = input.payload || {};
  return applyBountyHuntingObservation(game, {
    ...input,
    payload: {
      observations: payload.observations || [{
        bountyIds: payload.bountyIds,
        messageId: payload.messageId,
        ...(payload.messageTimestampUsec
          ? { messageTimestampUsec: payload.messageTimestampUsec }
          : {})
      }]
    }
  }, now);
}

function createShotPayload(messageId: string, bountyIds: string[] = []): Record<string, unknown> {
  return {
    messageId,
    observations: [{ bountyIds, messageId }]
  };
}

function createActiveBountyHuntingGame() {
  let game = submitBountyHunting(createBountyHuntingGame('game-1', 'host-user', 'guest-user', 0), {
    action: 'submitBounties',
    payload: { bounties: createBounties() },
    userId: 'host-user'
  }, 0);
  game = readyBountyHuntingPlayer(readyBountyHuntingPlayer(game, 'host-user', 0), 'guest-user', 0);
  return startBountyHuntingRound(game, 3_000);
}

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
      matcher: { kind: 'allCaps' }
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
      description: 'a message from a top fan',
      id: 'top-chatters',
      matcher: { kind: 'topFanAuthor' }
    }
  ];
}
