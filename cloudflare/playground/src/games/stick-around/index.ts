/**
 * Stick Around! realtime game module.
 *
 * The server owns match lifecycle, input relay, hazard scheduling, and winner
 * agreement. Clients keep the full physics/render loop local and only send chat
 * traffic counts, never chat text.
 */
import type { PublicUserIdentity } from '../../protocol/messages';
import { isPlaygroundComputerUserId } from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';
import type {
  PublicStickAroundGame,
  StickAroundFinishReport,
  StickAroundGameStatus,
  StickAroundHazardEvent,
  StickAroundInputSnapshot,
  StickAroundPlayerRole
} from '../../../../../src/shared/playground/stick-around';
import {
  STICK_AROUND_COUNTDOWN_MS,
  STICK_AROUND_MAX_HAZARDS_PER_OBSERVATION,
  STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS,
  STICK_AROUND_MAX_STORED_HAZARDS
} from '../../../../../src/shared/playground/stick-around';
import type { GameActionInput, GameModule, GameRecord } from '../types';

type PlayerRole = StickAroundPlayerRole;

const MAX_MESSAGE_ID_LENGTH = 160;
const MAX_TRAFFIC_COUNT = 30;
const MIN_HAZARD_SPACING_MS = 220;
const HAZARD_SPAWN_LEAD_MS = 650;

export interface StickAroundGameRecord extends GameRecord {
  finishReports: Record<string, StickAroundFinishReport>;
  gameType: 'stick-around';
  hazardSequence: number;
  hazards: StickAroundHazardEvent[];
  inputs: Record<string, StickAroundInputSnapshot>;
  observedMessageIds: string[];
  phaseStartedAt: number;
  players: Record<PlayerRole, string>;
  readyPlayers: Partial<Record<PlayerRole, boolean>>;
  roundSeed: number;
  roundStartedAt?: number;
  status: StickAroundGameStatus;
  winnerUserId?: string | null;
}

export const stickAroundGameModule: GameModule = {
  applyAction(game, input) {
    const stickGame = assertStickAroundGame(game);
    switch (input.action) {
      case 'ready':
        return readyStickAroundPlayer(stickGame, input.userId);
      case 'startRound':
        return startStickAroundRound(stickGame);
      case 'input':
        return applyStickAroundInput(stickGame, input);
      case 'observeChatTraffic':
        return observeStickAroundChatTraffic(stickGame, input);
      case 'finish':
        return finishStickAroundRound(stickGame, input);
      case 'timeout':
        return timeoutStickAroundRound(stickGame, input.userId);
      default:
        throw new ProtocolError('unsupported_action', 'Unsupported Stick Around action.');
    }
  },
  canUserAccessGame(game, userId) {
    return getStickAroundPlayerRole(assertStickAroundGame(game), userId) !== null;
  },
  createGame(gameId, playerUserIds) {
    return createStickAroundGame(gameId, playerUserIds[0], playerUserIds[1]);
  },
  getRecipientUserIds(game) {
    const stickGame = assertStickAroundGame(game);
    return [stickGame.players.host, stickGame.players.guest];
  },
  getWinnerUserId(game) {
    const stickGame = assertStickAroundGame(game);
    return stickGame.status === 'finished' ? stickGame.winnerUserId || null : null;
  },
  toPublicGame(game, getUser) {
    return toPublicStickAroundGame(assertStickAroundGame(game), getUser);
  }
};

export function createStickAroundGame(
  gameId: string,
  hostUserId: string,
  guestUserId: string,
  now = Date.now()
): StickAroundGameRecord {
  return {
    finishReports: {},
    gameId,
    gameType: 'stick-around',
    hazardSequence: 0,
    hazards: [],
    inputs: {},
    observedMessageIds: [],
    phaseStartedAt: now,
    players: {
      guest: guestUserId,
      host: hostUserId
    },
    readyPlayers: {},
    roundSeed: createRoundSeed(gameId, now),
    status: 'ready'
  };
}

export function readyStickAroundPlayer(
  game: StickAroundGameRecord,
  userId: string,
  now = Date.now()
): StickAroundGameRecord {
  if (game.status !== 'ready') throw new ProtocolError('not_readying', 'This game is not accepting ready checks.');
  const role = getRequiredStickAroundPlayerRole(game, userId);
  const readyPlayers = {
    ...game.readyPlayers,
    [role]: !game.readyPlayers[role]
  };

  if (readyPlayers.host && readyPlayers.guest) {
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

export function startStickAroundRound(
  game: StickAroundGameRecord,
  now = Date.now()
): StickAroundGameRecord {
  if (game.status !== 'countdown') return game;
  if (now - game.phaseStartedAt < STICK_AROUND_COUNTDOWN_MS) {
    throw new ProtocolError('countdown_active', 'This Stick Around countdown is still active.');
  }

  return {
    ...game,
    finishReports: {},
    hazardSequence: 0,
    hazards: [],
    inputs: {},
    observedMessageIds: [],
    phaseStartedAt: now,
    roundStartedAt: now,
    status: 'active',
    winnerUserId: undefined
  };
}

export function applyStickAroundInput(
  game: StickAroundGameRecord,
  input: GameActionInput,
  now = Date.now()
): StickAroundGameRecord {
  if (game.status !== 'active') return game;
  getRequiredStickAroundPlayerRole(game, input.userId);
  const snapshot = parseStickAroundInput(input, now);
  const previous = game.inputs[input.userId];
  if (previous && snapshot.seq <= previous.seq) return game;

  return {
    ...game,
    inputs: {
      ...game.inputs,
      [input.userId]: snapshot
    }
  };
}

export function observeStickAroundChatTraffic(
  game: StickAroundGameRecord,
  input: GameActionInput,
  now = Date.now()
): StickAroundGameRecord {
  if (game.status !== 'active') return game;
  getRequiredStickAroundPlayerRole(game, input.userId);

  const payload = input.payload || {};
  const messageIds = parseMessageIds(payload.messageIds);
  const knownMessageIds = new Set(game.observedMessageIds);
  const newMessageIds = messageIds.filter((messageId) => !knownMessageIds.has(messageId));
  const reportedCount = getInteger(payload.count, 'count', 0, MAX_TRAFFIC_COUNT);
  const anonymousCount = messageIds.length ? Math.max(0, reportedCount - messageIds.length) : reportedCount;
  const observedCount = Math.min(MAX_TRAFFIC_COUNT, newMessageIds.length + anonymousCount);
  const hazardCount = Math.min(STICK_AROUND_MAX_HAZARDS_PER_OBSERVATION, Math.ceil(observedCount / 2));
  if (hazardCount <= 0) return game;

  const hazards: StickAroundHazardEvent[] = [];
  let sequence = game.hazardSequence;
  const lastSpawnAt = game.hazards[game.hazards.length - 1]?.spawnAt ?? now;
  for (let index = 0; index < hazardCount; index += 1) {
    sequence += 1;
    const seed = createHazardSeed(game.roundSeed, sequence, observedCount);
    const messageId = newMessageIds[index % newMessageIds.length];
    hazards.push({
      id: `hazard-${sequence}`,
      ...(messageId ? { messageId } : {}),
      seed,
      spawnAt: Math.max(now + HAZARD_SPAWN_LEAD_MS, lastSpawnAt + MIN_HAZARD_SPACING_MS * (index + 1)),
      weight: Math.max(1, Math.min(3, observedCount))
    });
  }

  return {
    ...game,
    hazardSequence: sequence,
    hazards: [...game.hazards, ...hazards].slice(-STICK_AROUND_MAX_STORED_HAZARDS),
    observedMessageIds: [...game.observedMessageIds, ...newMessageIds].slice(-400)
  };
}

export function finishStickAroundRound(
  game: StickAroundGameRecord,
  input: GameActionInput,
  now = Date.now()
): StickAroundGameRecord {
  if (game.status !== 'active') return game;
  getRequiredStickAroundPlayerRole(game, input.userId);
  const report = parseFinishReport(game, input, now);
  const finishReports = {
    ...game.finishReports,
    [input.userId]: report
  };
  const playerIds = [game.players.host, game.players.guest];
  const humanPlayerIds = playerIds.filter((userId) => !isPlaygroundComputerUserId(userId));
  const requiredReports = humanPlayerIds.length || playerIds.length;
  const reports = Object.values(finishReports);

  if (reports.length < requiredReports) {
    return {
      ...game,
      finishReports
    };
  }

  const firstWinner = reports[0]?.winnerUserId ?? null;
  const agreed = reports.every((candidate) => candidate.winnerUserId === firstWinner);
  return agreed
    ? {
        ...game,
        finishReports,
        phaseStartedAt: now,
        status: 'finished',
        winnerUserId: firstWinner
      }
    : {
        ...game,
        finishReports,
        phaseStartedAt: now,
        status: 'desynced',
        winnerUserId: null
      };
}

export function timeoutStickAroundRound(
  game: StickAroundGameRecord,
  userId: string,
  now = Date.now()
): StickAroundGameRecord {
  getRequiredStickAroundPlayerRole(game, userId);
  if (game.status !== 'active' && game.status !== 'countdown') return game;
  return {
    ...game,
    phaseStartedAt: now,
    status: 'finished',
    winnerUserId: getOpponentUserId(game, userId)
  };
}

export function toPublicStickAroundGame(
  game: StickAroundGameRecord,
  getUser: (userId: string) => PublicUserIdentity,
  now = Date.now()
): PublicStickAroundGame {
  return {
    finishReports: game.finishReports,
    gameId: game.gameId,
    gameType: 'stick-around',
    hazards: game.hazards,
    inputs: game.inputs,
    phaseStartedAt: game.phaseStartedAt,
    players: {
      guest: getUser(game.players.guest),
      host: getUser(game.players.host)
    },
    readyPlayers: game.readyPlayers,
    roundSeed: game.roundSeed,
    roundStartedAt: game.roundStartedAt,
    serverNow: now,
    status: game.status,
    winnerUserId: game.winnerUserId
  };
}

function parseStickAroundInput(input: GameActionInput, now: number): StickAroundInputSnapshot {
  const payload = input.payload || {};
  return {
    frame: getInteger(payload.frame, 'frame', 0, 1_000_000_000),
    jump: payload.jump === true,
    left: payload.left === true,
    right: payload.right === true,
    seq: getInteger(payload.seq, 'seq', 0, 1_000_000_000),
    sentAt: now,
    userId: input.userId
  };
}

function parseFinishReport(
  game: StickAroundGameRecord,
  input: GameActionInput,
  now: number
): StickAroundFinishReport {
  const payload = input.payload || {};
  const winnerUserId = payload.winnerUserId === null
    ? null
    : getOptionalPlayerUserId(game, payload.winnerUserId);
  return {
    frame: getInteger(payload.frame, 'frame', 0, 1_000_000_000),
    reportedAt: now,
    userId: input.userId,
    winnerUserId
  };
}

function getInteger(value: unknown, key: string, min: number, max: number): number {
  if (!Number.isInteger(value)) throw new ProtocolError('invalid_payload', `${key} must be an integer.`);
  return Math.max(min, Math.min(max, Number(value)));
}

function getOptionalPlayerUserId(game: StickAroundGameRecord, value: unknown): string | null {
  if (typeof value !== 'string') throw new ProtocolError('invalid_winner', 'winnerUserId must be a player or null.');
  if (!Object.values(game.players).includes(value)) {
    throw new ProtocolError('invalid_winner', 'winnerUserId must be a player or null.');
  }
  return value;
}

function parseMessageIds(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ProtocolError('invalid_payload', 'messageIds must be an array.');
  const seen = new Set<string>();
  const messageIds: string[] = [];
  value
    .filter((messageId): messageId is string => typeof messageId === 'string')
    .map((messageId) => messageId.slice(0, MAX_MESSAGE_ID_LENGTH))
    .filter(Boolean)
    .forEach((messageId) => {
      if (seen.has(messageId) || messageIds.length >= STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS) return;
      seen.add(messageId);
      messageIds.push(messageId);
    });
  return messageIds;
}

function getStickAroundPlayerRole(game: StickAroundGameRecord, userId: string): PlayerRole | null {
  if (game.players.host === userId) return 'host';
  if (game.players.guest === userId) return 'guest';
  return null;
}

function getRequiredStickAroundPlayerRole(game: StickAroundGameRecord, userId: string): PlayerRole {
  const role = getStickAroundPlayerRole(game, userId);
  if (!role) throw new ProtocolError('not_in_game', 'You are not a player in this game.');
  return role;
}

function getOpponentUserId(game: StickAroundGameRecord, userId: string): string {
  return game.players.host === userId ? game.players.guest : game.players.host;
}

function assertStickAroundGame(game: GameRecord): StickAroundGameRecord {
  if (game.gameType !== 'stick-around') throw new ProtocolError('unsupported_game', 'Expected a Stick Around game.');
  return game as StickAroundGameRecord;
}

function createRoundSeed(gameId: string, now: number): number {
  return hashSeed(`${gameId}:${now}`);
}

function createHazardSeed(roundSeed: number, sequence: number, count: number): number {
  return hashSeed(`${roundSeed}:${sequence}:${count}`);
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
