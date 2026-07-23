/**
 * Bounty Hunting realtime game module.
 *
 * The host submits a small bounty board generated from local chat activity.
 * Both players ready up, then race to claim server-validated bounty matches
 * from live chat messages for one 60 second round.
 */
import { z } from 'zod';
import {
  PLAYGROUND_GAME_VERSIONS,
  type PublicGame,
  type PublicUserIdentity
} from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';
import type {
  PublicBountyHuntingBounty,
  BountyHuntingBounty,
  BountyHuntingBountyDescriptionKey,
  BountyHuntingBountyMatcher,
  BountyHuntingClaim,
  BountyHuntingGameStatus,
  BountyHuntingMessageObservation,
  BountyHuntingPlayerRole
} from '../../../../../src/shared/playground/bounty-hunting';
import {
  BOUNTY_HUNTING_BOUNTY_COUNT,
  BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS,
  BOUNTY_HUNTING_COUNTDOWN_MS,
  BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS,
  BOUNTY_HUNTING_MISS_COOLDOWN_MS,
  BOUNTY_HUNTING_ROUND_MS,
  BOUNTY_HUNTING_ROUND_OVER_MS,
  getBountyHuntingRoundStartTimestampUsec
} from '../../../../../src/shared/playground/bounty-hunting';
import type { GameActionInput, GameModule, GameRecord, PublicGameContext } from '../types';

type PlayerRole = BountyHuntingPlayerRole;

const MAX_DESCRIPTION_LENGTH = 96;
const MAX_BOUNTY_WITNESS_IDS = BOUNTY_HUNTING_BOUNTY_COUNT;
const MAX_STORED_BOUNTY_WITNESSES = 240;
const MAX_MESSAGE_ID_LENGTH = 160;
const MIN_BOUNTY_AMOUNT = 25;
const MAX_BOUNTY_AMOUNT = 500;
const BOUNTY_HUNTING_OBSERVATION_BASE_RATE_COST = 3;
const BOUNTY_HUNTING_OBSERVATION_RATE_COST_PER_MESSAGE = 0.1;
const BOUNTY_HUNTING_SHOT_RATE_COST = 3;

const BountyHuntingRoleSchema = z.enum(['guest', 'host']);
const BountyHuntingMatcherSchema = z.union([
  z.strictObject({
    kind: z.enum([
      'allCaps',
      'channelMemberAuthor',
      'channelOwnerAuthor',
      'customEmoji',
      'mention',
      'moderatorAuthor',
      'number',
      'onlyEmojis',
      'question',
      'superChat',
      'topFanAuthor',
      'verifiedAuthor'
    ])
  }),
  z.strictObject({
    kind: z.literal('emojiCount'),
    min: z.number().int().min(1).max(10)
  })
]);
const BountyHuntingBountySchema = z.strictObject({
  amount: z.number().int().min(MIN_BOUNTY_AMOUNT).max(MAX_BOUNTY_AMOUNT),
  description: z.string().min(1),
  descriptionKey: z.enum(BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS).optional(),
  id: z.string().min(1),
  matcher: BountyHuntingMatcherSchema
});
const BountyHuntingClaimSchema = z.strictObject({
  bountyId: z.string().min(1),
  claimedAt: z.number().finite(),
  messageId: z.string().min(1),
  role: BountyHuntingRoleSchema,
  userId: z.string().min(1)
});
const BountyHuntingClaimWitnessSchema = z.strictObject({
  bountyIds: z.array(z.string().min(1)).min(1).max(MAX_BOUNTY_WITNESS_IDS),
  messageId: z.string().min(1),
  messageTimestampUsec: z.string().regex(/^\d{1,24}$/).optional(),
  observedAt: z.number().finite(),
  role: BountyHuntingRoleSchema
});
const BountyHuntingPendingClaimSchema = z.strictObject({
  bountyId: z.string().min(1),
  messageId: z.string().min(1),
  role: BountyHuntingRoleSchema
});
const BountyHuntingGameRecordSchema = z.strictObject({
  bounties: z.array(BountyHuntingBountySchema).max(BOUNTY_HUNTING_BOUNTY_COUNT),
  bountyProviderUserId: z.string().min(1),
  claimWitnesses: z.array(BountyHuntingClaimWitnessSchema).max(MAX_STORED_BOUNTY_WITNESSES),
  claims: z.array(BountyHuntingClaimSchema).max(BOUNTY_HUNTING_BOUNTY_COUNT),
  finishedAt: z.number().int().nonnegative().optional(),
  gameId: z.string().min(1),
  gameType: z.literal('bounty-hunting'),
  gameVersion: z.literal(PLAYGROUND_GAME_VERSIONS['bounty-hunting']),
  missCooldownUntilByRole: z.strictObject({
    guest: z.number().finite().optional(),
    host: z.number().finite().optional()
  }),
  pendingClaims: z.array(BountyHuntingPendingClaimSchema).max(2),
  phaseStartedAt: z.number().finite(),
  players: z.strictObject({
    guest: z.string().min(1),
    host: z.string().min(1)
  }),
  readyPlayers: z.strictObject({
    guest: z.boolean().optional(),
    host: z.boolean().optional()
  }),
  roundStartTimestampUsec: z.string().regex(/^\d{1,24}$/).optional(),
  scores: z.strictObject({
    guest: z.number().int().nonnegative(),
    host: z.number().int().nonnegative()
  }),
  startedAt: z.number().int().nonnegative().optional(),
  status: z.enum(['active', 'countdown', 'finished', 'preparing', 'ready', 'roundOver'])
});

export type BountyHuntingClaimWitness = z.infer<typeof BountyHuntingClaimWitnessSchema>;
export type BountyHuntingPendingClaim = z.infer<typeof BountyHuntingPendingClaimSchema>;
export type BountyHuntingGameRecord = z.infer<typeof BountyHuntingGameRecordSchema>;

export interface PublicBountyHuntingGame extends PublicGame {
  bounties: PublicBountyHuntingBounty[];
  bountyProviderUserId: string;
  gameType: 'bounty-hunting';
  missCooldownUntil?: number;
  pendingClaimMessageId?: string;
  phaseStartedAt: number;
  players: Record<PlayerRole, PublicUserIdentity>;
  readyPlayers: Partial<Record<PlayerRole, boolean>>;
  roundEndsAt?: number;
  roundStartTimestampUsec?: string;
  scores: Record<PlayerRole, number>;
  status: BountyHuntingGameStatus;
  winnerUserId?: string | null;
}

export const bountyHuntingGameModule: GameModule = {
  applyAction(game, input) {
    const bountyGame = assertBountyHuntingGame(game);
    switch (input.action) {
      case 'submitBounties':
        return submitBountyHunting(bountyGame, input);
      case 'ready':
        return readyBountyHuntingPlayer(bountyGame, input.userId);
      case 'startRound':
        return startBountyHuntingRound(bountyGame, input);
      case 'shootBounty':
        return shootBountyHuntingMessage(bountyGame, input);
      case 'observeBountyMessage':
        return observeBountyHuntingMessage(bountyGame, input);
      case 'timeout':
        return timeoutBountyHuntingGame(bountyGame);
      case 'finish':
        return finishBountyHuntingGame(bountyGame);
      default:
        throw new ProtocolError('unsupported_action', 'Unsupported Bounty Hunting action.');
    }
  },
  canUserAccessGame(game, userId) {
    return getBountyHuntingPlayerRole(assertBountyHuntingGame(game), userId) !== null;
  },
  createGame(gameId, playerUserIds) {
    return createBountyHuntingGame(gameId, playerUserIds[0], playerUserIds[1]);
  },
  getActionRateCost(input) {
    const observationCost = (
      BOUNTY_HUNTING_OBSERVATION_BASE_RATE_COST
      + getBountyHuntingObservationCount(input.payload)
        * BOUNTY_HUNTING_OBSERVATION_RATE_COST_PER_MESSAGE
    );
    if (input.action === 'observeBountyMessage') return observationCost;
    if (input.action === 'shootBounty') {
      return BOUNTY_HUNTING_SHOT_RATE_COST + observationCost;
    }
    return undefined;
  },
  getRecipientUserIds(game) {
    const bountyGame = assertBountyHuntingGame(game);
    return [bountyGame.players.host, bountyGame.players.guest];
  },
  getStatePersistence({ action, nextGame, previousGame }) {
    if (action.action !== 'observeBountyMessage') return 'immediate';
    return hasBountyHuntingPublicProgressChanged(
      assertBountyHuntingGame(previousGame),
      assertBountyHuntingGame(nextGame)
    )
      ? 'immediate'
      : 'deferred';
  },
  getWinnerUserId(game) {
    const bountyGame = assertBountyHuntingGame(game);
    return bountyGame.status === 'finished' ? getBountyHuntingWinnerUserId(bountyGame) : null;
  },
  isTerminal(game) {
    return assertBountyHuntingGame(game).status === 'finished';
  },
  isStoredGameRecord(value): value is BountyHuntingGameRecord {
    return BountyHuntingGameRecordSchema.safeParse(value).success;
  },
  toPublicGame(game, getUser, context) {
    return toPublicBountyHuntingGame(assertBountyHuntingGame(game), getUser, context);
  }
};

export function createBountyHuntingGame(
  gameId: string,
  hostUserId: string,
  guestUserId: string,
  now = Date.now()
): BountyHuntingGameRecord {
  return {
    bounties: [],
    bountyProviderUserId: hostUserId,
    claimWitnesses: [],
    claims: [],
    gameId,
    gameType: 'bounty-hunting',
    gameVersion: PLAYGROUND_GAME_VERSIONS['bounty-hunting'],
    missCooldownUntilByRole: {},
    phaseStartedAt: now,
    pendingClaims: [],
    players: {
      guest: guestUserId,
      host: hostUserId
    },
    readyPlayers: {},
    roundStartTimestampUsec: undefined,
    scores: {
      guest: 0,
      host: 0
    },
    startedAt: now,
    status: 'preparing'
  };
}

export function submitBountyHunting(
  game: BountyHuntingGameRecord,
  input: GameActionInput,
  now = Date.now()
): BountyHuntingGameRecord {
  assertBountyHuntingBountyProvider(game, input.userId);
  const bounties = parseBountyHuntingBounties(input.payload?.bounties);
  return {
    ...game,
    bounties,
    claimWitnesses: [],
    claims: [],
    missCooldownUntilByRole: {},
    phaseStartedAt: now,
    pendingClaims: [],
    readyPlayers: {},
    roundStartTimestampUsec: undefined,
    scores: {
      guest: 0,
      host: 0
    },
    status: 'ready'
  };
}

export function readyBountyHuntingPlayer(
  game: BountyHuntingGameRecord,
  userId: string,
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status !== 'ready') throw new ProtocolError('not_readying', 'This game is not accepting ready checks.');
  const role = getRequiredBountyHuntingPlayerRole(game, userId);
  const nextReady = !game.readyPlayers[role];
  const readyPlayers = {
    ...game.readyPlayers,
    [role]: nextReady
  };

  if (nextReady && readyPlayers.host && readyPlayers.guest) {
    return {
      ...game,
      phaseStartedAt: now,
      readyPlayers,
      status: 'countdown'
    };
  }

  return {
    ...game,
    readyPlayers
  };
}

export function startBountyHuntingRound(
  game: BountyHuntingGameRecord,
  inputOrNow: GameActionInput | number = Date.now(),
  maybeNow?: number
): BountyHuntingGameRecord {
  const now = typeof inputOrNow === 'number' ? inputOrNow : maybeNow ?? Date.now();
  if (game.status !== 'countdown') return game;
  if (now - game.phaseStartedAt < BOUNTY_HUNTING_COUNTDOWN_MS) {
    throw new ProtocolError('countdown_active', 'This bounty round countdown is still active.');
  }
  const roundStartTimestampUsec = getBountyHuntingRoundStartTimestampUsec(game.phaseStartedAt);

  return {
    ...game,
    phaseStartedAt: now,
    roundStartTimestampUsec,
    status: 'active'
  };
}

export function shootBountyHuntingMessage(
  game: BountyHuntingGameRecord,
  input: GameActionInput,
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status !== 'active') throw new ProtocolError('not_active', 'This bounty round is not active.');
  if (isBountyHuntingDeadlinePassed(game, now)) return endBountyHuntingRound(game, now);

  let resolvedGame = resolveBountyHuntingPendingClaims(game, now);
  const role = getRequiredBountyHuntingPlayerRole(game, input.userId);
  if (isBountyHuntingMissCooldownActive(resolvedGame, role, now)) return resolvedGame;

  const payload = input.payload || {};
  const messageId = getPayloadText(payload.messageId, 'messageId', MAX_MESSAGE_ID_LENGTH);
  if (!Array.isArray(payload.observations)) {
    throw new ProtocolError('invalid_bounty', 'A Bounty Hunting shot observation is required.');
  }
  const observations = parseBountyHuntingWitnessObservations(payload);
  if (observations.length !== 1 || observations[0].messageId !== messageId) {
    throw new ProtocolError(
      'invalid_bounty',
      'A Bounty Hunting shot observation must match its messageId.'
    );
  }
  if (resolvedGame.claims.some((claim) => claim.messageId === messageId)) return resolvedGame;
  resolvedGame = applyBountyHuntingWitnessObservations(
    resolvedGame,
    role,
    observations,
    now
  );
  if (resolvedGame.status !== 'active') return resolvedGame;

  const pendingClaimForRole = resolvedGame.pendingClaims.find((candidate) => candidate.role === role);
  if (pendingClaimForRole) return resolvedGame;

  const witnessedBounty = findHighestValueWitnessedOpenBounty(resolvedGame, role, messageId);
  if (!witnessedBounty) return startBountyHuntingMissCooldown(resolvedGame, role, now);

  const pendingClaim: BountyHuntingPendingClaim = {
    bountyId: witnessedBounty.id,
    messageId,
    role
  };

  if (!hasBountyHuntingWitness(resolvedGame, role, messageId, witnessedBounty.id)) {
    return queueBountyHuntingPendingClaim(resolvedGame, pendingClaim);
  }

  return commitBountyHuntingClaim(resolvedGame, pendingClaim, now);
}

export function observeBountyHuntingMessage(
  game: BountyHuntingGameRecord,
  input: GameActionInput,
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status !== 'active') return game;
  if (isBountyHuntingDeadlinePassed(game, now)) return endBountyHuntingRound(game, now);

  const resolvedGame = resolveBountyHuntingPendingClaims(game, now);
  const role = getRequiredBountyHuntingPlayerRole(game, input.userId);
  const payload = input.payload || {};
  return applyBountyHuntingWitnessObservations(
    resolvedGame,
    role,
    parseBountyHuntingWitnessObservations(payload),
    now
  );
}

function applyBountyHuntingWitnessObservations(
  game: BountyHuntingGameRecord,
  role: PlayerRole,
  observations: BountyHuntingMessageObservation[],
  now: number
): BountyHuntingGameRecord {
  const eligibleObservations = observations
    .map((observation) => ({
      bountyIds: observation.bountyIds
        .filter((bountyId) => game.bounties.some((bounty) => bounty.id === bountyId))
        .filter((bountyId) => !game.claims.some((claim) => claim.bountyId === bountyId)),
      messageId: observation.messageId,
      messageTimestampUsec: observation.messageTimestampUsec
    }))
    .filter((observation) => observation.bountyIds.length > 0)
    .filter((observation) =>
      !isBountyHuntingPreStartMessage(game, observation.messageId, observation.messageTimestampUsec)
    );

  if (!eligibleObservations.length) return game;

  const retainedWitnesses = pruneBountyHuntingWitnesses(game);
  const witnesses = eligibleObservations.map((observation): BountyHuntingClaimWitness => ({
    bountyIds: observation.bountyIds,
    messageId: observation.messageId,
    messageTimestampUsec: observation.messageTimestampUsec || undefined,
    observedAt: now,
    role
  }));
  const claimWitnesses = mergeBountyHuntingWitnesses(retainedWitnesses, witnesses);

  if (claimWitnesses === game.claimWitnesses) return game;

  return resolveBountyHuntingPendingClaims(
    {
      ...game,
      claimWitnesses
    },
    now
  );
}

function commitBountyHuntingClaim(
  game: BountyHuntingGameRecord,
  pendingClaim: BountyHuntingPendingClaim,
  now: number
): BountyHuntingGameRecord {
  const bounty = game.bounties.find((candidate) => candidate.id === pendingClaim.bountyId);
  if (!bounty) return game;
  const gameWithoutPendingClaim = removeBountyHuntingPendingClaim(game, pendingClaim);
  const existingClaim = game.claims.find((claim) => claim.bountyId === pendingClaim.bountyId);
  if (existingClaim) {
    return existingClaim.messageId === pendingClaim.messageId
      ? gameWithoutPendingClaim
      : startBountyHuntingMissCooldown(gameWithoutPendingClaim, pendingClaim.role, now);
  }
  if (game.claims.some((claim) => claim.messageId === pendingClaim.messageId)) return gameWithoutPendingClaim;

  const claim: BountyHuntingClaim = {
    bountyId: pendingClaim.bountyId,
    claimedAt: now,
    messageId: pendingClaim.messageId,
    role: pendingClaim.role,
    userId: game.players[pendingClaim.role]
  };
  const nextGame: BountyHuntingGameRecord = {
    ...gameWithoutPendingClaim,
    claimWitnesses: removeClaimedBountyHuntingWitnesses(game.claimWitnesses, pendingClaim),
    claims: [...game.claims, claim],
    pendingClaims: gameWithoutPendingClaim.pendingClaims.filter((candidate) =>
      candidate.bountyId !== pendingClaim.bountyId && candidate.messageId !== pendingClaim.messageId
    ),
    scores: {
      ...game.scores,
      [pendingClaim.role]: game.scores[pendingClaim.role] + bounty.amount
    }
  };

  return nextGame.claims.length >= nextGame.bounties.length
    ? endBountyHuntingRound(nextGame, now)
    : nextGame;
}

function queueBountyHuntingPendingClaim(
  game: BountyHuntingGameRecord,
  pendingClaim: BountyHuntingPendingClaim
): BountyHuntingGameRecord {
  if (game.pendingClaims.some((candidate) =>
    candidate.role === pendingClaim.role &&
    candidate.bountyId === pendingClaim.bountyId &&
    candidate.messageId === pendingClaim.messageId
  )) {
    return game;
  }

  return {
    ...game,
    pendingClaims: [...game.pendingClaims, pendingClaim]
  };
}

function resolveBountyHuntingPendingClaims(
  game: BountyHuntingGameRecord,
  now: number
): BountyHuntingGameRecord {
  if (!game.pendingClaims.length) return game;
  let nextGame = game;
  const unresolvedClaims = [...game.pendingClaims];

  while (unresolvedClaims.length && nextGame.status === 'active') {
    const pendingClaimIndex = unresolvedClaims.findIndex((pendingClaim) =>
      nextGame.claims.some((claim) => claim.bountyId === pendingClaim.bountyId)
      || nextGame.claims.some((claim) => claim.messageId === pendingClaim.messageId)
      || hasBountyHuntingWitness(nextGame, pendingClaim.role, pendingClaim.messageId, pendingClaim.bountyId)
    );
    if (pendingClaimIndex < 0) break;
    const [pendingClaim] = unresolvedClaims.splice(pendingClaimIndex, 1);
    nextGame = commitBountyHuntingClaim(nextGame, pendingClaim, now);
  }

  return nextGame;
}

function removeBountyHuntingPendingClaim(
  game: BountyHuntingGameRecord,
  pendingClaim: BountyHuntingPendingClaim
): BountyHuntingGameRecord {
  const pendingClaims = game.pendingClaims.filter((candidate) => candidate !== pendingClaim);
  return pendingClaims.length === game.pendingClaims.length
    ? game
    : { ...game, pendingClaims };
}

function hasBountyHuntingWitness(
  game: BountyHuntingGameRecord,
  claimingRole: PlayerRole,
  messageId: string,
  bountyId: string
): boolean {
  return game.claimWitnesses.some((witness) =>
    witness.role !== claimingRole &&
    witness.messageId === messageId &&
    witness.bountyIds.includes(bountyId)
  );
}

function hasBountyHuntingWitnessForRole(
  game: BountyHuntingGameRecord,
  role: PlayerRole,
  messageId: string,
  bountyId: string
): boolean {
  return game.claimWitnesses.some((witness) =>
    witness.role === role &&
    witness.messageId === messageId &&
    witness.bountyIds.includes(bountyId)
  );
}

function findHighestValueWitnessedOpenBounty(
  game: BountyHuntingGameRecord,
  role: PlayerRole,
  messageId: string
): BountyHuntingBounty | undefined {
  let selectedBounty: BountyHuntingBounty | undefined;
  for (const bounty of game.bounties) {
    if (game.claims.some((claim) => claim.bountyId === bounty.id)) continue;
    if (!hasBountyHuntingWitnessForRole(game, role, messageId, bounty.id)) continue;
    if (!selectedBounty || bounty.amount > selectedBounty.amount) selectedBounty = bounty;
  }
  return selectedBounty;
}

function getBountyHuntingWitnessKey(witness: BountyHuntingClaimWitness): string {
  return `${witness.role}:${witness.messageId}`;
}

function pruneBountyHuntingWitnesses(game: BountyHuntingGameRecord): BountyHuntingClaimWitness[] {
  const claimedBountyIds = new Set(game.claims.map((claim) => claim.bountyId));
  const claimedMessageIds = new Set(game.claims.map((claim) => claim.messageId));
  let changed = false;
  const claimWitnesses = game.claimWitnesses.flatMap((witness) => {
    if (claimedMessageIds.has(witness.messageId)) {
      changed = true;
      return [];
    }
    const bountyIds = witness.bountyIds.filter((bountyId) => !claimedBountyIds.has(bountyId));
    if (!bountyIds.length) {
      changed = true;
      return [];
    }
    if (bountyIds.length === witness.bountyIds.length) return [witness];
    changed = true;
    return [{ ...witness, bountyIds }];
  });
  return !changed
    ? game.claimWitnesses
    : claimWitnesses;
}

function mergeBountyHuntingWitnesses(
  retainedWitnesses: BountyHuntingClaimWitness[],
  witnesses: BountyHuntingClaimWitness[]
): BountyHuntingClaimWitness[] {
  if (!witnesses.length) return retainedWitnesses;
  const witnessesByKey = new Map(retainedWitnesses.map((witness) => [
    getBountyHuntingWitnessKey(witness),
    witness
  ]));
  let changed = false;

  witnesses.forEach((witness) => {
    const key = getBountyHuntingWitnessKey(witness);
    const existing = witnessesByKey.get(key);
    const bountyIds = existing
      ? [...new Set([...existing.bountyIds, ...witness.bountyIds])]
      : witness.bountyIds;
    if (existing && bountyIds.length === existing.bountyIds.length) return;
    witnessesByKey.delete(key);
    witnessesByKey.set(key, existing ? { ...witness, bountyIds } : witness);
    changed = true;
  });

  if (!changed) return retainedWitnesses;
  return [...witnessesByKey.values()].slice(-MAX_STORED_BOUNTY_WITNESSES);
}

function removeClaimedBountyHuntingWitnesses(
  witnesses: BountyHuntingClaimWitness[],
  claim: BountyHuntingPendingClaim
): BountyHuntingClaimWitness[] {
  return witnesses.flatMap((witness) => {
    if (witness.messageId === claim.messageId) return [];
    const bountyIds = witness.bountyIds.filter((bountyId) => bountyId !== claim.bountyId);
    if (!bountyIds.length) return [];
    return bountyIds.length === witness.bountyIds.length
      ? [witness]
      : [{ ...witness, bountyIds }];
  });
}

function getBountyHuntingObservationCount(payload?: Record<string, unknown>): number {
  if (!Array.isArray(payload?.observations)) return 1;
  return Math.max(
    1,
    Math.min(payload.observations.length, BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS)
  );
}

function hasBountyHuntingPublicProgressChanged(
  previousGame: BountyHuntingGameRecord,
  nextGame: BountyHuntingGameRecord
): boolean {
  return previousGame.status !== nextGame.status
    || previousGame.claims.length !== nextGame.claims.length
    || previousGame.scores.host !== nextGame.scores.host
    || previousGame.scores.guest !== nextGame.scores.guest
    || getBountyHuntingMissCooldownUntil(previousGame, 'host')
      !== getBountyHuntingMissCooldownUntil(nextGame, 'host')
    || getBountyHuntingMissCooldownUntil(previousGame, 'guest')
      !== getBountyHuntingMissCooldownUntil(nextGame, 'guest');
}

export function timeoutBountyHuntingGame(
  game: BountyHuntingGameRecord,
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status !== 'active') return game;
  if (!isBountyHuntingDeadlinePassed(game, now)) {
    throw new ProtocolError('time_remaining', 'This bounty round still has time remaining.');
  }

  return endBountyHuntingRound(game, now);
}

export function finishBountyHuntingGame(
  game: BountyHuntingGameRecord,
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status === 'finished') return game;
  if (game.status !== 'roundOver') {
    throw new ProtocolError('round_not_over', 'This bounty round is not over.');
  }
  if (now - game.phaseStartedAt < BOUNTY_HUNTING_ROUND_OVER_MS) {
    throw new ProtocolError('round_over_visible', 'Round over is still visible.');
  }

  return {
    ...game,
    phaseStartedAt: now,
    status: 'finished'
  };
}

export function toPublicBountyHuntingGame(
  game: BountyHuntingGameRecord,
  getUser: (userId: string) => PublicUserIdentity,
  context?: PublicGameContext
): PublicBountyHuntingGame {
  const claimsByBounty = new Map(game.claims.map((claim) => [claim.bountyId, claim]));
  const recipientRole = context?.recipientUserId
    ? getBountyHuntingPlayerRole(game, context.recipientUserId)
    : null;
  const missCooldownUntil = recipientRole
    ? getBountyHuntingMissCooldownUntil(game, recipientRole)
    : undefined;
  const pendingClaimMessageId = recipientRole
    ? game.pendingClaims.find((claim) => claim.role === recipientRole)?.messageId
    : undefined;
  return {
    bounties: game.bounties.map((bounty) => ({
      ...bounty,
      claim: claimsByBounty.get(bounty.id)
    })),
    bountyProviderUserId: game.bountyProviderUserId,
    gameId: game.gameId,
    gameType: 'bounty-hunting',
    ...(missCooldownUntil === undefined ? {} : { missCooldownUntil }),
    ...(pendingClaimMessageId === undefined ? {} : { pendingClaimMessageId }),
    phaseStartedAt: game.phaseStartedAt,
    players: {
      guest: getUser(game.players.guest),
      host: getUser(game.players.host)
    },
    readyPlayers: { ...game.readyPlayers },
    roundEndsAt: game.status === 'active' ? game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS : undefined,
    roundStartTimestampUsec: game.roundStartTimestampUsec,
    scores: { ...game.scores },
    status: game.status,
    winnerUserId: game.status === 'finished' ? getBountyHuntingWinnerUserId(game) : undefined
  };
}

function startBountyHuntingMissCooldown(
  game: BountyHuntingGameRecord,
  role: PlayerRole,
  now: number
): BountyHuntingGameRecord {
  return setBountyHuntingMissCooldownUntil(
    game,
    role,
    now + BOUNTY_HUNTING_MISS_COOLDOWN_MS,
    now
  );
}

function setBountyHuntingMissCooldownUntil(
  game: BountyHuntingGameRecord,
  role: PlayerRole,
  missCooldownUntil: number,
  now: number
): BountyHuntingGameRecord {
  if (isBountyHuntingMissCooldownActive(game, role, now)) return game;

  return {
    ...game,
    missCooldownUntilByRole: {
      ...game.missCooldownUntilByRole,
      [role]: missCooldownUntil
    }
  };
}

function isBountyHuntingMissCooldownActive(
  game: BountyHuntingGameRecord,
  role: PlayerRole,
  now: number
): boolean {
  const missCooldownUntil = getBountyHuntingMissCooldownUntil(game, role);
  return missCooldownUntil !== undefined && now < missCooldownUntil;
}

function getBountyHuntingMissCooldownUntil(
  game: BountyHuntingGameRecord,
  role: PlayerRole
): number | undefined {
  const missCooldownUntil = game.missCooldownUntilByRole[role];
  return typeof missCooldownUntil === 'number' && Number.isFinite(missCooldownUntil)
    ? missCooldownUntil
    : undefined;
}

function endBountyHuntingRound(game: BountyHuntingGameRecord, now: number): BountyHuntingGameRecord {
  return {
    ...game,
    claimWitnesses: [],
    pendingClaims: [],
    phaseStartedAt: now,
    status: 'roundOver'
  };
}

function isBountyHuntingDeadlinePassed(game: BountyHuntingGameRecord, now: number): boolean {
  return now - game.phaseStartedAt >= BOUNTY_HUNTING_ROUND_MS;
}

function getBountyHuntingWinnerUserId(game: BountyHuntingGameRecord): string | null {
  if (game.scores.host === game.scores.guest) return null;
  return game.scores.host > game.scores.guest ? game.players.host : game.players.guest;
}

function assertBountyHuntingBountyProvider(game: BountyHuntingGameRecord, userId: string): void {
  if (game.status !== 'preparing') throw new ProtocolError('bounties_locked', 'Bounties are already set.');
  if (userId !== game.bountyProviderUserId) {
    throw new ProtocolError('not_bounty_provider', 'Only the bounty provider can prepare Bounty Hunting.');
  }
}

function parseBountyHuntingBounties(value: unknown): BountyHuntingBounty[] {
  if (!Array.isArray(value) || value.length !== BOUNTY_HUNTING_BOUNTY_COUNT) {
    throw new ProtocolError(
      'invalid_bounties',
      `${BOUNTY_HUNTING_BOUNTY_COUNT} Bounty Hunting bounties are required.`
    );
  }

  const seenIds = new Set<string>();
  return value.map((item, index) => {
    const bounty = getRecord(item, 'bounty');
    const id = getPayloadText(bounty.id, `bounty ${index + 1} id`, 80);
    if (seenIds.has(id)) throw new ProtocolError('duplicate_bounty', 'Bounty IDs must be unique.');
    seenIds.add(id);
    const parsedBounty: BountyHuntingBounty = {
      amount: getBountyAmount(bounty.amount),
      description: getPayloadText(bounty.description, `bounty ${index + 1} description`, MAX_DESCRIPTION_LENGTH),
      id,
      matcher: parseBountyHuntingMatcher(bounty.matcher)
    };
    const descriptionKey = parseBountyHuntingDescriptionKey(bounty.descriptionKey);
    return descriptionKey ? { ...parsedBounty, descriptionKey } : parsedBounty;
  });
}

function parseBountyHuntingDescriptionKey(value: unknown): BountyHuntingBountyDescriptionKey | undefined {
  if (value === undefined || value === null) return undefined;
  if (
    typeof value === 'string' &&
    BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS.includes(value as BountyHuntingBountyDescriptionKey)
  ) {
    return value as BountyHuntingBountyDescriptionKey;
  }
  throw new ProtocolError('invalid_bounty', 'Bounty description key is not supported.');
}

function parseBountyHuntingMatcher(value: unknown): BountyHuntingBountyMatcher {
  const matcher = getRecord(value, 'bounty matcher');
  switch (matcher.kind) {
    case 'allCaps':
      return { kind: 'allCaps' };
    case 'emojiCount':
      return {
        kind: 'emojiCount',
        min: getBoundedInteger(matcher.min, 1, 10, 'min')
      };
    case 'channelMemberAuthor':
    case 'channelOwnerAuthor':
    case 'customEmoji':
    case 'mention':
    case 'moderatorAuthor':
    case 'number':
    case 'onlyEmojis':
    case 'question':
    case 'superChat':
    case 'topFanAuthor':
    case 'verifiedAuthor':
      return { kind: matcher.kind };
    default:
      throw new ProtocolError('invalid_bounty_matcher', 'Unsupported bounty matcher.');
  }
}

function getBountyAmount(value: unknown): number {
  return getBoundedInteger(value, MIN_BOUNTY_AMOUNT, MAX_BOUNTY_AMOUNT, 'amount');
}

function getBoundedInteger(value: unknown, min: number, max: number, field: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ProtocolError('invalid_bounty', `${field} must be an integer from ${min} to ${max}.`);
  }
  return number;
}

function getPayloadText(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ProtocolError('invalid_bounty', `${field} must be a non-empty string.`);
  return text.slice(0, maxLength);
}

function getPayloadTextArray(value: unknown, field: string, itemMaxLength: number, maxItems: number): string[] {
  if (!Array.isArray(value)) {
    throw new ProtocolError('invalid_bounty', `${field} must be an array.`);
  }

  const texts = value
    .map((item) => typeof item === 'string' ? item.trim().slice(0, itemMaxLength) : '')
    .filter(Boolean)
    .slice(0, maxItems);
  return [...new Set(texts)];
}

function parseBountyHuntingWitnessObservations(payload: Record<string, unknown>): BountyHuntingMessageObservation[] {
  if (!Array.isArray(payload.observations)) {
    throw new ProtocolError('invalid_bounty', 'Bounty Hunting observations are required.');
  }
  return payload.observations
    .slice(0, BOUNTY_HUNTING_MAX_WITNESS_OBSERVATIONS)
    .map((item, index) => {
      const observation = getRecord(item, `witness observation ${index + 1}`);
      return {
        bountyIds: getPayloadTextArray(
          observation.bountyIds,
          `witness observation ${index + 1} bountyIds`,
          80,
          MAX_BOUNTY_WITNESS_IDS
        ),
        messageId: getPayloadText(observation.messageId, `witness observation ${index + 1} messageId`, MAX_MESSAGE_ID_LENGTH),
        messageTimestampUsec: parseOptionalTimestampUsec(
          observation.messageTimestampUsec,
          `witness observation ${index + 1} messageTimestampUsec`
        )
      };
    });
}

function parseOptionalTimestampUsec(value: unknown, field: string): string {
  if (value === undefined || value === null || value === '') return '';
  const text = typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,24}$/.test(text)) {
    throw new ProtocolError('invalid_bounty', `${field} must be an epoch microsecond string.`);
  }
  return text;
}

function isBountyHuntingPreStartMessage(
  game: BountyHuntingGameRecord,
  _messageId: string,
  messageTimestampUsec = ''
): boolean {
  if (!game.roundStartTimestampUsec) return false;
  if (!messageTimestampUsec) return true;
  return compareTimestampUsec(messageTimestampUsec, game.roundStartTimestampUsec) <= 0;
}

function compareTimestampUsec(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  if (leftValue === rightValue) return 0;
  return leftValue > rightValue ? 1 : -1;
}

function getRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProtocolError('invalid_bounty', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function getRequiredBountyHuntingPlayerRole(game: BountyHuntingGameRecord, userId: string): PlayerRole {
  const role = getBountyHuntingPlayerRole(game, userId);
  if (!role) throw new ProtocolError('not_in_game', 'You are not a player in this game.');
  return role;
}

function getBountyHuntingPlayerRole(game: BountyHuntingGameRecord, userId: string): PlayerRole | null {
  if (game.players.host === userId) return 'host';
  if (game.players.guest === userId) return 'guest';
  return null;
}

function assertBountyHuntingGame(game: GameRecord): BountyHuntingGameRecord {
  if (game.gameType !== 'bounty-hunting') {
    throw new ProtocolError('unsupported_game', 'Expected a Bounty Hunting game.');
  }
  return game as BountyHuntingGameRecord;
}
