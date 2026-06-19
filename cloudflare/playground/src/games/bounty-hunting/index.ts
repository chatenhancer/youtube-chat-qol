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
  BountyHuntingBountyMatcher,
  BountyHuntingClaim,
  BountyHuntingGameStatus,
  BountyHuntingMessageSignal,
  BountyHuntingPlayerRole
} from '../../../../../src/shared/playground-bounty-hunting';
import {
  doesBountyHuntingBountyMatch,
  BOUNTY_HUNTING_BOUNTY_COUNT,
  BOUNTY_HUNTING_COUNTDOWN_MS,
  BOUNTY_HUNTING_ROUND_MS,
  BOUNTY_HUNTING_ROUND_OVER_MS
} from '../../../../../src/shared/playground-bounty-hunting';
import type { GameActionInput, GameModule, GameRecord } from '../types';

type PlayerRole = BountyHuntingPlayerRole;

const MAX_DESCRIPTION_LENGTH = 96;
const MAX_MESSAGE_AUTHOR_LENGTH = 80;
const MAX_MESSAGE_ID_LENGTH = 160;
const MAX_MESSAGE_TEXT_LENGTH = 600;
const MIN_BOUNTY_AMOUNT = 25;
const MAX_BOUNTY_AMOUNT = 500;

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
  claims: BountyHuntingClaim[];
  gameType: 'bounty-hunting';
  phaseStartedAt: number;
  players: Record<PlayerRole, string>;
  readyPlayers: Partial<Record<PlayerRole, boolean>>;
  scores: Record<PlayerRole, number>;
  status: BountyHuntingGameStatus;
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
    claims: [],
    gameId,
    gameType: 'bounty-hunting',
    phaseStartedAt: now,
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
    claims: [],
    phaseStartedAt: now,
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

  const message = parseBountyHuntingClaimMessage(payload);
  if (!doesBountyHuntingBountyMatch(bounty, message)) {
    throw new ProtocolError('bounty_mismatch', 'That chat message does not claim this bounty.');
  }

  const claim: BountyHuntingClaim = {
    bountyId,
    claimedAt: now,
    messageAuthorName: (message.authorName || '').slice(0, MAX_MESSAGE_AUTHOR_LENGTH),
    messageId,
    role,
    userId: input.userId
  };
  const nextGame: BountyHuntingGameRecord = {
    ...game,
    claimedMessageIds: [...game.claimedMessageIds, messageId],
    claims: [...game.claims, claim],
    scores: {
      ...game.scores,
      [role]: game.scores[role] + bounty.amount
    }
  };

  return nextGame.claims.length >= nextGame.bounties.length
    ? endBountyHuntingRound(nextGame, now)
    : nextGame;
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
    return {
      amount: getBountyAmount(bounty.amount),
      description: getPayloadText(bounty.description, `bounty ${index + 1} description`, MAX_DESCRIPTION_LENGTH),
      id,
      matcher: parseBountyHuntingMatcher(bounty.matcher)
    };
  });
}

function parseBountyHuntingMatcher(value: unknown): BountyHuntingBountyMatcher {
  const matcher = getRecord(value, 'bounty matcher');
  switch (matcher.kind) {
    case 'allCaps':
      return {
        kind: 'allCaps',
        minLetters: getBoundedInteger(matcher.minLetters, 3, 20, 'minLetters')
      };
    case 'authorIn':
      return {
        kind: 'authorIn',
        authorNames: getAuthorNames(matcher.authorNames)
      };
    case 'emojiCount':
      return {
        kind: 'emojiCount',
        min: getBoundedInteger(matcher.min, 1, 10, 'min')
      };
    case 'keyword':
      return {
        kind: 'keyword',
        keyword: getPayloadText(matcher.keyword, 'keyword', 40)
      };
    case 'mention':
    case 'number':
    case 'question':
    case 'url':
    case 'verifiedAuthor':
      return { kind: matcher.kind };
    default:
      throw new ProtocolError('invalid_bounty_matcher', 'Unsupported bounty matcher.');
  }
}

function parseBountyHuntingClaimMessage(payload: Record<string, unknown>): BountyHuntingMessageSignal {
  return {
    authorName: typeof payload.authorName === 'string'
      ? payload.authorName.trim().slice(0, MAX_MESSAGE_AUTHOR_LENGTH)
      : '',
    emojiCount: getOptionalNonNegativeInteger(payload.emojiCount),
    isVerifiedAuthor: payload.isVerifiedAuthor === true,
    text: getPayloadText(payload.text, 'text', MAX_MESSAGE_TEXT_LENGTH)
  };
}

function getAuthorNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ProtocolError('invalid_bounty_matcher', 'authorNames must be an array.');
  }
  const names = value
    .map((name) => typeof name === 'string' ? name.trim().slice(0, MAX_MESSAGE_AUTHOR_LENGTH) : '')
    .filter(Boolean)
    .slice(0, 6);
  if (!names.length) throw new ProtocolError('invalid_bounty_matcher', 'authorNames must include at least one name.');
  return names;
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

function getOptionalNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined;
}

function getPayloadText(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ProtocolError('invalid_bounty', `${field} must be a non-empty string.`);
  return text.slice(0, maxLength);
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
