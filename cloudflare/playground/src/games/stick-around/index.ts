/**
 * Stick Around! realtime game module.
 *
 * The server owns match lifecycle, input relay, hazard scheduling, physics, and
 * winner resolution. Clients send controls and chat traffic counts, then render
 * the authoritative world snapshot.
 */
import { z } from 'zod';
import { PLAYGROUND_GAME_VERSIONS, type PublicUserIdentity } from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';
import type {
  PublicStickAroundGame,
  StickAroundControls,
  StickAroundHazardEvent,
  StickAroundInputSnapshot,
  StickAroundPlayerRole,
  StickAroundSimulationSnapshot
} from '../../../../../src/shared/playground/stick-around';
import {
  STICK_AROUND_ARENA_HEIGHT,
  STICK_AROUND_ARENA_WIDTH,
  STICK_AROUND_COUNTDOWN_MS,
  STICK_AROUND_MAX_HAZARDS_PER_OBSERVATION,
  STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS,
  STICK_AROUND_MAX_STORED_HAZARDS
} from '../../../../../src/shared/playground/stick-around';
import {
  createStickAroundServerSimulation,
  getStickAroundComputerControls,
  getStickAroundWinnerUserId,
  hydrateStickAroundSimulationSnapshot,
  serializeStickAroundSimulation,
  stepStickAroundSimulation,
  type StickAroundSimulation
} from '../../../../../src/shared/playground/stick-around-simulation';
import type { GameActionInput, GameModule, GameRecord } from '../types';

type PlayerRole = StickAroundPlayerRole;

const MAX_MESSAGE_ID_LENGTH = 160;
const MAX_TRAFFIC_COUNT = 30;
const MIN_HAZARD_SPACING_MS = 220;
const HAZARD_SPAWN_LEAD_MS = 650;
const STICK_AROUND_REALTIME_ACTION_RATE_COST = 0.2;
const HAZARD_DIMENSIONS = [
  { bubbleHeight: 30, bubbleWidth: 82 },
  { bubbleHeight: 44, bubbleWidth: 126 },
  { bubbleHeight: 58, bubbleWidth: 172 }
] as const;

const FiniteNumberSchema = z.number().finite();
const IntegerSchema = z.number().int();
const NonNegativeIntegerSchema = IntegerSchema.nonnegative();
const PositiveNumberSchema = FiniteNumberSchema.positive();
const NonEmptyStringSchema = z.string().min(1);
const StickAroundRoleSchema = z.enum(['guest', 'host']);
const StickAroundArenaSchema = z.strictObject({
  height: PositiveNumberSchema,
  width: PositiveNumberSchema
});
const StickAroundFinishReportSchema = z.strictObject({
  frame: NonNegativeIntegerSchema,
  reportedAt: FiniteNumberSchema,
  userId: NonEmptyStringSchema,
  winnerUserId: NonEmptyStringSchema.nullable()
});
const StickAroundHazardSchema = z.strictObject({
  bubbleHeight: PositiveNumberSchema.optional(),
  bubbleWidth: PositiveNumberSchema.optional(),
  id: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema.optional(),
  seed: IntegerSchema,
  spawnAt: FiniteNumberSchema,
  weight: PositiveNumberSchema
});
const StickAroundInputSchema = z.strictObject({
  frame: NonNegativeIntegerSchema,
  jump: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  sentAt: FiniteNumberSchema,
  seq: NonNegativeIntegerSchema,
  userId: NonEmptyStringSchema
});
const StickAroundFighterSchema = z.strictObject({
  attackUntil: FiniteNumberSchema,
  collisionUntil: FiniteNumberSchema,
  damage: FiniteNumberSchema,
  facing: z.union([z.literal(-1), z.literal(1)]),
  grounded: z.boolean(),
  hurtUntil: FiniteNumberSchema,
  invulnerableUntil: FiniteNumberSchema,
  label: z.string(),
  lastAttackAt: FiniteNumberSchema,
  koUntil: FiniteNumberSchema,
  respawnUntil: FiniteNumberSchema,
  role: StickAroundRoleSchema,
  stocks: IntegerSchema,
  userId: NonEmptyStringSchema,
  vx: FiniteNumberSchema,
  vy: FiniteNumberSchema,
  x: FiniteNumberSchema,
  y: FiniteNumberSchema
});
const StickAroundPlatformSchema = z.strictObject({
  height: PositiveNumberSchema,
  kind: z.enum(['center', 'side']),
  width: PositiveNumberSchema,
  x: FiniteNumberSchema,
  y: FiniteNumberSchema
});
const StickAroundBubbleSchema = z.strictObject({
  angle: FiniteNumberSchema,
  height: PositiveNumberSchema,
  hitUserIds: z.array(NonEmptyStringSchema),
  id: NonEmptyStringSchema,
  messageId: NonEmptyStringSchema.optional(),
  seed: IntegerSchema,
  spin: FiniteNumberSchema,
  text: z.string(),
  vx: FiniteNumberSchema,
  vy: FiniteNumberSchema,
  width: PositiveNumberSchema,
  x: FiniteNumberSchema,
  y: FiniteNumberSchema
});
const StickAroundParticleSchema = z.strictObject({
  color: NonEmptyStringSchema,
  life: FiniteNumberSchema,
  maxLife: FiniteNumberSchema,
  size: PositiveNumberSchema,
  vx: FiniteNumberSchema,
  vy: FiniteNumberSchema,
  x: FiniteNumberSchema,
  y: FiniteNumberSchema
});
const StickAroundSimulationSchema = z.strictObject({
  bubbles: z.array(StickAroundBubbleSchema),
  fighters: z.record(z.string(), StickAroundFighterSchema),
  flash: FiniteNumberSchema,
  frame: NonNegativeIntegerSchema,
  height: PositiveNumberSchema,
  lastTime: FiniteNumberSchema,
  particles: z.array(StickAroundParticleSchema),
  platforms: z.array(StickAroundPlatformSchema),
  roundSeed: IntegerSchema,
  shake: FiniteNumberSchema,
  spawnedHazardIds: z.array(NonEmptyStringSchema).max(STICK_AROUND_MAX_STORED_HAZARDS),
  width: PositiveNumberSchema
});
const StickAroundGameRecordSchema = z.strictObject({
  arena: StickAroundArenaSchema,
  finishReports: z.record(z.string(), StickAroundFinishReportSchema),
  gameId: NonEmptyStringSchema,
  gameType: z.literal('stick-around'),
  gameVersion: z.literal(PLAYGROUND_GAME_VERSIONS['stick-around']),
  hazards: z.array(StickAroundHazardSchema).max(STICK_AROUND_MAX_STORED_HAZARDS),
  hazardSequence: NonNegativeIntegerSchema,
  inputs: z.record(z.string(), StickAroundInputSchema),
  observedMessageIds: z.array(NonEmptyStringSchema.max(MAX_MESSAGE_ID_LENGTH)).max(400),
  phaseStartedAt: FiniteNumberSchema,
  players: z.strictObject({
    guest: NonEmptyStringSchema,
    host: NonEmptyStringSchema
  }),
  readyPlayers: z.strictObject({
    guest: z.boolean().optional(),
    host: z.boolean().optional()
  }),
  roundSeed: IntegerSchema,
  roundStartedAt: FiniteNumberSchema.optional(),
  simulation: StickAroundSimulationSchema.optional(),
  status: z.enum(['ready', 'countdown', 'active', 'finished']),
  winnerUserId: NonEmptyStringSchema.nullable().optional()
});

export type StickAroundGameRecord = z.infer<typeof StickAroundGameRecordSchema>;

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
  getActionRateCost(input) {
    return isStickAroundRealtimeAction(input.action) ? STICK_AROUND_REALTIME_ACTION_RATE_COST : undefined;
  },
  getRecipientUserIds(game) {
    const stickGame = assertStickAroundGame(game);
    return [stickGame.players.host, stickGame.players.guest];
  },
  getStatePersistence({ action, nextGame, previousGame }) {
    if (
      previousGame.status === nextGame.status &&
      nextGame.status === 'active' &&
      isStickAroundRealtimeAction(action.action)
    ) {
      return 'deferred';
    }

    return 'immediate';
  },
  getWinnerUserId(game) {
    const stickGame = assertStickAroundGame(game);
    return stickGame.status === 'finished' ? stickGame.winnerUserId || null : null;
  },
  isTerminal(game) {
    return assertStickAroundGame(game).status === 'finished';
  },
  isStoredGameRecord(value): value is StickAroundGameRecord {
    return StickAroundGameRecordSchema.safeParse(value).success;
  },
  toPublicGame(game, getUser) {
    return toPublicStickAroundGame(assertStickAroundGame(game), getUser);
  }
};

function isStickAroundRealtimeAction(action: string): boolean {
  return action === 'input' || action === 'observeChatTraffic';
}

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
    gameVersion: PLAYGROUND_GAME_VERSIONS['stick-around'],
    arena: {
      height: STICK_AROUND_ARENA_HEIGHT,
      width: STICK_AROUND_ARENA_WIDTH
    },
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
    simulation: serializeStickAroundSimulation(createStickAroundServerSimulation({
      arena: game.arena,
      finishReports: {},
      gameId: game.gameId,
      gameType: 'stick-around',
      hazards: [],
      inputs: {},
      phaseStartedAt: now,
      players: createSimulationPlayers(game),
      readyPlayers: game.readyPlayers,
      roundSeed: game.roundSeed,
      roundStartedAt: now,
      serverNow: now,
      status: 'active'
    }, now)),
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

  return advanceStickAroundGame({
    ...game,
    inputs: {
      ...game.inputs,
      [input.userId]: snapshot
    }
  }, now);
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
  // Only identifiable messages contribute to weather so reports from both
  // players cannot count the same overflow traffic twice.
  const observedCount = Math.min(reportedCount, newMessageIds.length);
  const hazardCount = Math.min(STICK_AROUND_MAX_HAZARDS_PER_OBSERVATION, Math.ceil(observedCount / 2));
  if (hazardCount <= 0) return advanceStickAroundGame(game, now);

  const hazards: StickAroundHazardEvent[] = [];
  let sequence = game.hazardSequence;
  const lastSpawnAt = game.hazards[game.hazards.length - 1]?.spawnAt ?? now;
  for (let index = 0; index < hazardCount; index += 1) {
    sequence += 1;
    const seed = createHazardSeed(game.roundSeed, sequence, observedCount);
    const messageId = newMessageIds[index % newMessageIds.length];
    const dimensions = getHazardDimensions(observedCount);
    hazards.push({
      bubbleHeight: dimensions.bubbleHeight,
      bubbleWidth: dimensions.bubbleWidth,
      id: `hazard-${sequence}`,
      ...(messageId ? { messageId } : {}),
      seed,
      spawnAt: Math.max(now + HAZARD_SPAWN_LEAD_MS, lastSpawnAt + MIN_HAZARD_SPACING_MS * (index + 1)),
      weight: Math.max(1, Math.min(3, observedCount))
    });
  }

  return advanceStickAroundGame({
    ...game,
    hazardSequence: sequence,
    hazards: [...game.hazards, ...hazards].slice(-STICK_AROUND_MAX_STORED_HAZARDS),
    observedMessageIds: [...game.observedMessageIds, ...newMessageIds].slice(-400)
  }, now);
}

export function finishStickAroundRound(
  game: StickAroundGameRecord,
  input: GameActionInput,
  now = Date.now()
): StickAroundGameRecord {
  if (game.status !== 'active') return game;
  getRequiredStickAroundPlayerRole(game, input.userId);
  return advanceStickAroundGame(game, now);
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
  const players = {
    guest: getUser(game.players.guest),
    host: getUser(game.players.host)
  };
  return {
    arena: game.arena,
    finishReports: game.finishReports,
    gameId: game.gameId,
    gameType: 'stick-around',
    hazards: game.hazards,
    inputs: game.inputs,
    phaseStartedAt: game.phaseStartedAt,
    players,
    readyPlayers: game.readyPlayers,
    roundSeed: game.roundSeed,
    roundStartedAt: game.roundStartedAt,
    serverNow: now,
    simulation: game.simulation ? withPublicStickAroundFighterLabels(game.simulation, players) : undefined,
    status: game.status,
    winnerUserId: game.winnerUserId
  };
}

function withPublicStickAroundFighterLabels(
  simulation: StickAroundSimulationSnapshot,
  players: PublicStickAroundGame['players']
): StickAroundSimulationSnapshot {
  const labels = new Map(Object.values(players).map((player) => [
    player.userId,
    player.displayName
  ]));
  return {
    ...simulation,
    bubbles: simulation.bubbles.map((bubble) => ({ ...bubble })),
    fighters: Object.fromEntries(Object.entries(simulation.fighters).map(([userId, fighter]) => [
      userId,
      {
        ...fighter,
        label: labels.get(userId) || fighter.label
      }
    ])),
    particles: simulation.particles.map((particle) => ({ ...particle })),
    platforms: simulation.platforms.map((platform) => ({ ...platform })),
    spawnedHazardIds: [...simulation.spawnedHazardIds]
  };
}

export function advanceStickAroundGame(
  game: StickAroundGameRecord,
  now = Date.now()
): StickAroundGameRecord {
  if (game.status !== 'active') return game;
  const publicGame = toSimulationPublicGame(game, now);
  const simulation = game.simulation
    ? hydrateStickAroundSimulationSnapshot(game.simulation)
    : createStickAroundServerSimulation(publicGame, now);

  stepStickAroundSimulation(
    simulation,
    publicGame,
    getAuthoritativeInputs(game, simulation, now),
    new Map(),
    now
  );

  retainCurrentStickAroundSpawnedHazardIds(simulation, game.hazards);
  const simulationSnapshot = serializeStickAroundSimulation(simulation);
  const winnerUserId = getStickAroundWinnerUserId(simulation);
  if (winnerUserId !== undefined) {
    return {
      ...game,
      phaseStartedAt: now,
      simulation: simulationSnapshot,
      status: 'finished',
      winnerUserId
    };
  }

  return {
    ...game,
    simulation: simulationSnapshot
  };
}

function retainCurrentStickAroundSpawnedHazardIds(
  simulation: StickAroundSimulation,
  hazards: StickAroundHazardEvent[]
): void {
  const retainedIds = new Set(hazards.map((hazard) => hazard.id));
  simulation.spawnedHazardIds.forEach((hazardId) => {
    if (!retainedIds.has(hazardId)) simulation.spawnedHazardIds.delete(hazardId);
  });
}

function toSimulationPublicGame(game: StickAroundGameRecord, now: number): PublicStickAroundGame {
  return {
    arena: game.arena,
    finishReports: game.finishReports,
    gameId: game.gameId,
    gameType: 'stick-around',
    hazards: game.hazards,
    inputs: game.inputs,
    phaseStartedAt: game.phaseStartedAt,
    players: createSimulationPlayers(game),
    readyPlayers: game.readyPlayers,
    roundSeed: game.roundSeed,
    roundStartedAt: game.roundStartedAt,
    serverNow: now,
    simulation: game.simulation,
    status: game.status,
    winnerUserId: game.winnerUserId
  };
}

function createSimulationPlayers(game: StickAroundGameRecord): PublicStickAroundGame['players'] {
  return {
    guest: {
      displayName: '',
      userId: game.players.guest
    },
    host: {
      displayName: '',
      userId: game.players.host
    }
  };
}

function getAuthoritativeInputs(
  game: StickAroundGameRecord,
  simulation: StickAroundSimulation,
  now: number
): Record<string, StickAroundControls | StickAroundInputSnapshot | undefined> {
  const inputs: Record<string, StickAroundControls | StickAroundInputSnapshot> = {
    ...game.inputs
  };
  Object.values(game.players).forEach((userId) => {
    if (!userId.startsWith('server:computer:')) return;
    inputs[userId] = getStickAroundComputerControls(simulation, userId, now);
  });
  return inputs;
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

function getInteger(value: unknown, key: string, min: number, max: number): number {
  if (!Number.isInteger(value)) throw new ProtocolError('invalid_payload', `${key} must be an integer.`);
  return Math.max(min, Math.min(max, Number(value)));
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

function getHazardDimensions(weight: number): { bubbleHeight: number; bubbleWidth: number } {
  const index = Math.max(0, Math.min(HAZARD_DIMENSIONS.length - 1, Math.ceil(weight) - 1));
  return HAZARD_DIMENSIONS[index];
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
