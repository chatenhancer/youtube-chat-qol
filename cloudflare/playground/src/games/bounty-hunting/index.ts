/**
 * Bounty Hunting realtime game module.
 *
 * The host submits a small bounty board generated from local chat activity.
 * Both players ready up, then race to claim server-validated bounty matches
 * from live chat messages for one 60 second round.
 */
import type { PublicGame, PublicUserIdentity } from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';
import type {
  PublicBountyHuntingBounty,
  BountyHuntingBounty,
  BountyHuntingBountyDescriptionKey,
  BountyHuntingBountyMatcher,
  BountyHuntingClaim,
  BountyHuntingGameStatus,
  BountyHuntingPlayerRole
} from '../../../../../src/shared/playground/bounty-hunting';
import {
  BOUNTY_HUNTING_BOUNTY_COUNT,
  BOUNTY_HUNTING_BOUNTY_DESCRIPTION_KEYS,
  BOUNTY_HUNTING_COUNTDOWN_MS,
  BOUNTY_HUNTING_ROUND_MS,
  BOUNTY_HUNTING_ROUND_OVER_MS
} from '../../../../../src/shared/playground/bounty-hunting';
import type { GameActionInput, GameModule, GameRecord } from '../types';

type PlayerRole = BountyHuntingPlayerRole;

const MAX_DESCRIPTION_LENGTH = 96;
const MAX_BOUNTY_WITNESS_OBSERVATIONS = 20;
const MAX_BOUNTY_WITNESS_IDS = BOUNTY_HUNTING_BOUNTY_COUNT;
const MAX_MESSAGE_ID_LENGTH = 160;
const MIN_BOUNTY_AMOUNT = 25;
const MAX_BOUNTY_AMOUNT = 500;
const PENDING_CLAIM_MS = 2_000;

export interface PublicBountyHuntingGame extends PublicGame {
  bounties: PublicBountyHuntingBounty[];
  bountyProviderUserId: string;
  gameType: 'bounty-hunting';
  phaseStartedAt: number;
  players: Record<PlayerRole, PublicUserIdentity>;
  readyPlayers: Partial<Record<PlayerRole, boolean>>;
  roundEndsAt?: number;
  scores: Record<PlayerRole, number>;
  status: BountyHuntingGameStatus;
  winnerUserId?: string | null;
}

interface BountyHuntingGameRecord extends GameRecord {
  bounties: BountyHuntingBounty[];
  bountyProviderUserId: string;
  claimedMessageIds: string[];
  claimWitnesses: BountyHuntingClaimWitness[];
  claims: BountyHuntingClaim[];
  gameType: 'bounty-hunting';
  phaseStartedAt: number;
  pendingClaims: BountyHuntingPendingClaim[];
  players: Record<PlayerRole, string>;
  readyPlayers: Partial<Record<PlayerRole, boolean>>;
  scores: Record<PlayerRole, number>;
  status: BountyHuntingGameStatus;
}

interface BountyHuntingClaimWitness {
  bountyId: string;
  messageId: string;
  messagePublishedAt: number;
  observedAt: number;
  role: PlayerRole;
  userId: string;
}

interface BountyHuntingPendingClaim {
  bountyId: string;
  messageId: string;
  messagePublishedAt: number;
  requestedAt: number;
  role: PlayerRole;
  userId: string;
}

interface BountyHuntingWitnessObservation {
  bountyIds: string[];
  messageId: string;
  messagePublishedAt: number;
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
        return startBountyHuntingRound(bountyGame);
      case 'claimBounty':
        return claimBountyHuntingBounty(bountyGame, input);
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
  getRecipientUserIds(game) {
    const bountyGame = assertBountyHuntingGame(game);
    return [bountyGame.players.host, bountyGame.players.guest];
  },
  getWinnerUserId(game) {
    const bountyGame = assertBountyHuntingGame(game);
    return bountyGame.status === 'finished' ? getBountyHuntingWinnerUserId(bountyGame) : null;
  },
  toPublicGame(game, getUser) {
    return toPublicBountyHuntingGame(assertBountyHuntingGame(game), getUser);
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
    claimedMessageIds: [],
    claimWitnesses: [],
    claims: [],
    gameId,
    gameType: 'bounty-hunting',
    phaseStartedAt: now,
    pendingClaims: [],
    players: {
      guest: guestUserId,
      host: hostUserId
    },
    readyPlayers: {},
    scores: {
      guest: 0,
      host: 0
    },
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
    claimedMessageIds: [],
    claimWitnesses: [],
    claims: [],
    phaseStartedAt: now,
    pendingClaims: [],
    readyPlayers: {},
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
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status !== 'countdown') return game;
  if (now - game.phaseStartedAt < BOUNTY_HUNTING_COUNTDOWN_MS) {
    throw new ProtocolError('countdown_active', 'This bounty round countdown is still active.');
  }

  return {
    ...game,
    phaseStartedAt: now,
    status: 'active'
  };
}

export function claimBountyHuntingBounty(
  game: BountyHuntingGameRecord,
  input: GameActionInput,
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status !== 'active') throw new ProtocolError('not_active', 'This bounty round is not active.');
  if (isBountyHuntingDeadlinePassed(game, now)) return endBountyHuntingRound(game, now);

  const role = getRequiredBountyHuntingPlayerRole(game, input.userId);
  const payload = input.payload || {};
  const bountyId = getPayloadText(payload.bountyId, 'bountyId', 80);
  const bounty = game.bounties.find((candidate) => candidate.id === bountyId);
  if (!bounty) throw new ProtocolError('bounty_not_found', 'Bounty not found.');
  if (game.claims.some((claim) => claim.bountyId === bountyId)) {
    throw new ProtocolError('bounty_claimed', 'This bounty is already claimed.');
  }

  const messageId = getPayloadText(payload.messageId, 'messageId', MAX_MESSAGE_ID_LENGTH);
  if (game.claimedMessageIds.includes(messageId)) {
    throw new ProtocolError('message_claimed', 'This chat message already claimed a bounty.');
  }
  const messagePublishedAt = getPayloadTimestamp(payload.messagePublishedAt, 'messagePublishedAt');
  assertBountyHuntingMessageIsInActiveRound(game, messagePublishedAt);

  const pendingClaim: BountyHuntingPendingClaim = {
    bountyId,
    messageId,
    messagePublishedAt,
    requestedAt: now,
    role,
    userId: input.userId
  };

  if (!hasBountyHuntingWitness(game, role, messageId, bountyId)) {
    return queueBountyHuntingPendingClaim(game, pendingClaim, now);
  }

  return commitBountyHuntingClaim(game, pendingClaim, now);
}

export function observeBountyHuntingMessage(
  game: BountyHuntingGameRecord,
  input: GameActionInput,
  now = Date.now()
): BountyHuntingGameRecord {
  if (game.status !== 'active') return game;
  const role = getRequiredBountyHuntingPlayerRole(game, input.userId);
  const payload = input.payload || {};
  const observations = parseBountyHuntingWitnessObservations(payload)
    .map((observation) => ({
      bountyIds: observation.bountyIds
        .filter((bountyId) => game.bounties.some((bounty) => bounty.id === bountyId))
        .filter((bountyId) => !game.claims.some((claim) => claim.bountyId === bountyId)),
      messageId: observation.messageId,
      messagePublishedAt: observation.messagePublishedAt
    }))
    .filter((observation) => isBountyHuntingMessageInActiveRound(game, observation.messagePublishedAt))
    .filter((observation) => observation.bountyIds.length > 0);

  if (!observations.length) return resolveBountyHuntingPendingClaims(game, now);

  const existingKeys = new Set(game.claimWitnesses.map(getBountyHuntingWitnessKey));
  const witnesses = observations
    .flatMap((observation) => observation.bountyIds.map((bountyId): BountyHuntingClaimWitness => ({
      bountyId,
      messageId: observation.messageId,
      messagePublishedAt: observation.messagePublishedAt,
      observedAt: now,
      role,
      userId: input.userId
    })))
    .filter((witness) => !existingKeys.has(getBountyHuntingWitnessKey(witness)));

  if (!witnesses.length) return resolveBountyHuntingPendingClaims(game, now);

  return resolveBountyHuntingPendingClaims({
    ...game,
    claimWitnesses: [...game.claimWitnesses, ...witnesses]
  }, now);
}

function commitBountyHuntingClaim(
  game: BountyHuntingGameRecord,
  pendingClaim: BountyHuntingPendingClaim,
  now: number
): BountyHuntingGameRecord {
  const bounty = game.bounties.find((candidate) => candidate.id === pendingClaim.bountyId);
  if (!bounty) return game;
  if (game.claims.some((claim) => claim.bountyId === pendingClaim.bountyId)) return game;
  if (game.claimedMessageIds.includes(pendingClaim.messageId)) return game;

  const claim: BountyHuntingClaim = {
    bountyId: pendingClaim.bountyId,
    claimedAt: now,
    messageId: pendingClaim.messageId,
    role: pendingClaim.role,
    userId: pendingClaim.userId
  };
  const nextGame: BountyHuntingGameRecord = {
    ...game,
    claimedMessageIds: [...game.claimedMessageIds, pendingClaim.messageId],
    claims: [...game.claims, claim],
    pendingClaims: game.pendingClaims.filter((candidate) =>
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
  pendingClaim: BountyHuntingPendingClaim,
  now: number
): BountyHuntingGameRecord {
  const pendingClaims = getLiveBountyHuntingPendingClaims(game, now);
  if (pendingClaims.some((candidate) =>
    candidate.userId === pendingClaim.userId &&
    candidate.bountyId === pendingClaim.bountyId &&
    candidate.messageId === pendingClaim.messageId
  )) {
    return {
      ...game,
      pendingClaims
    };
  }

  return {
    ...game,
    pendingClaims: [...pendingClaims, pendingClaim]
  };
}

function resolveBountyHuntingPendingClaims(
  game: BountyHuntingGameRecord,
  now: number
): BountyHuntingGameRecord {
  let nextGame = {
    ...game,
    pendingClaims: getLiveBountyHuntingPendingClaims(game, now)
  };

  for (const pendingClaim of [...nextGame.pendingClaims].sort((a, b) => a.requestedAt - b.requestedAt)) {
    if (nextGame.status !== 'active') return nextGame;
    if (!hasBountyHuntingWitness(nextGame, pendingClaim.role, pendingClaim.messageId, pendingClaim.bountyId)) continue;
    nextGame = commitBountyHuntingClaim(nextGame, pendingClaim, now);
  }

  return nextGame;
}

function getLiveBountyHuntingPendingClaims(
  game: BountyHuntingGameRecord,
  now: number
): BountyHuntingPendingClaim[] {
  return game.pendingClaims.filter((pendingClaim) =>
    now - pendingClaim.requestedAt <= PENDING_CLAIM_MS &&
    !game.claims.some((claim) => claim.bountyId === pendingClaim.bountyId) &&
    !game.claimedMessageIds.includes(pendingClaim.messageId)
  );
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
    witness.bountyId === bountyId
  );
}

function getBountyHuntingWitnessKey(witness: BountyHuntingClaimWitness): string {
  return `${witness.role}:${witness.messageId}:${witness.bountyId}`;
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
  getUser: (userId: string) => PublicUserIdentity
): PublicBountyHuntingGame {
  const claimsByBounty = new Map(game.claims.map((claim) => [claim.bountyId, claim]));
  return {
    bounties: game.bounties.map((bounty) => ({
      ...bounty,
      claim: claimsByBounty.get(bounty.id)
    })),
    bountyProviderUserId: game.bountyProviderUserId,
    gameId: game.gameId,
    gameType: 'bounty-hunting',
    phaseStartedAt: game.phaseStartedAt,
    players: {
      guest: getUser(game.players.guest),
      host: getUser(game.players.host)
    },
    readyPlayers: { ...game.readyPlayers },
    roundEndsAt: game.status === 'active' ? game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS : undefined,
    scores: { ...game.scores },
    status: game.status,
    winnerUserId: game.status === 'finished' ? getBountyHuntingWinnerUserId(game) : undefined
  };
}

function endBountyHuntingRound(game: BountyHuntingGameRecord, now: number): BountyHuntingGameRecord {
  return {
    ...game,
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

function getPayloadTimestamp(value: unknown, field: string): number {
  const timestamp = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    throw new ProtocolError('invalid_bounty', `${field} must be a valid timestamp.`);
  }
  return Math.floor(timestamp);
}

function parseBountyHuntingWitnessObservations(payload: Record<string, unknown>): BountyHuntingWitnessObservation[] {
  if (Array.isArray(payload.observations)) {
    return payload.observations
      .slice(0, MAX_BOUNTY_WITNESS_OBSERVATIONS)
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
          messagePublishedAt: getPayloadTimestamp(
            observation.messagePublishedAt,
            `witness observation ${index + 1} messagePublishedAt`
          )
        };
      });
  }

  return [{
    bountyIds: getPayloadTextArray(payload.bountyIds, 'bountyIds', 80, MAX_BOUNTY_WITNESS_IDS),
    messageId: getPayloadText(payload.messageId, 'messageId', MAX_MESSAGE_ID_LENGTH),
    messagePublishedAt: getPayloadTimestamp(payload.messagePublishedAt, 'messagePublishedAt')
  }];
}

function isBountyHuntingMessageInActiveRound(
  game: BountyHuntingGameRecord,
  messagePublishedAt: number
): boolean {
  return messagePublishedAt >= game.phaseStartedAt &&
    messagePublishedAt < game.phaseStartedAt + BOUNTY_HUNTING_ROUND_MS;
}

function assertBountyHuntingMessageIsInActiveRound(
  game: BountyHuntingGameRecord,
  messagePublishedAt: number
): void {
  if (isBountyHuntingMessageInActiveRound(game, messagePublishedAt)) return;
  throw new ProtocolError('message_too_old', 'This chat message is from before the bounty round.');
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
