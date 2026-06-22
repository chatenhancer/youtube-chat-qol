import type {
  PublicStickAroundGame,
  StickAroundBubbleSnapshot,
  StickAroundControls,
  StickAroundFighterSnapshot,
  StickAroundHazardEvent,
  StickAroundParticleSnapshot,
  StickAroundPlatformSnapshot,
  StickAroundInputSnapshot,
  StickAroundSimulationSnapshot
} from './stick-around';
import {
  STICK_AROUND_ARENA_HEIGHT,
  STICK_AROUND_ARENA_WIDTH
} from './stick-around';
import type { PublicUserIdentity } from './protocol';

export const STICK_AROUND_STARTING_STOCKS = 3;
export const STICK_AROUND_FIGHTER_WIDTH = 30;
export const STICK_AROUND_FIGHTER_HEIGHT = 54;
export const STICK_AROUND_SIDE_BLAST_MARGIN = 72;
export const STICK_AROUND_SIDE_POSITION_LIMIT = STICK_AROUND_SIDE_BLAST_MARGIN + 90;

const FIGHTER_WIDTH = STICK_AROUND_FIGHTER_WIDTH;
const FIGHTER_HEIGHT = STICK_AROUND_FIGHTER_HEIGHT;
const FIGHTER_SPEED = 225;
const FIGHTER_ACCEL = 1700;
const GROUND_DRAG = 0.82;
const AIR_DRAG = 0.96;
const GRAVITY = 860;
const KO_GRAVITY = 760;
const JUMP_VELOCITY = -430;
const RESPAWN_INVULNERABLE_MS = 1800;
const RESPAWN_LOCK_MS = 750;
const KO_DROP_MS = 280;
const ATTACK_COOLDOWN_MS = 360;
const MAX_STEP_SECONDS = 1 / 30;
const MAX_SIMULATION_STEPS = 12;
const STALE_INPUT_MS = 750;
const SHOVE_SPEED_THRESHOLD = 130;
const SHOVE_RECOIL = 0.58;
const STOMP_COLLISION_COOLDOWN_MS = 340;
const SHOVE_COLLISION_COOLDOWN_MS = 380;
const COMPUTER_RANDOM_JUMP_DECISION_MS = 900;
const COMPUTER_RANDOM_JUMP_CHANCE = 0.12;
const BUBBLE_APPROX_CHAR_WIDTH = 5.8;
const BUBBLE_HORIZONTAL_PADDING = 26;
const BUBBLE_LINE_HEIGHT = 15;
const BUBBLE_VERTICAL_PADDING = 10;
const BUBBLE_MAX_LINES = 4;
const BUBBLE_GRAVITY = 160;
const PARTICLE_GRAVITY = 430;
const MAX_PARTICLES = 180;
const SIDE_BLAST_MARGIN = STICK_AROUND_SIDE_BLAST_MARGIN;
const SIDE_POSITION_LIMIT = STICK_AROUND_SIDE_POSITION_LIMIT;
const TOP_BLAST_MARGIN = 170;
const BOTTOM_FALLOFF_MARGIN = 92;
const PLATFORM_HEIGHT = 10;
const PLATFORM_SIDE_MARGIN = 22;

export type StickAroundFighter = StickAroundFighterSnapshot;

export type StickAroundPlatform = StickAroundPlatformSnapshot;

export type StickAroundBubble = Omit<StickAroundBubbleSnapshot, 'hitUserIds'> & {
  hitUserIds: Set<string>;
};

export type StickAroundParticle = StickAroundParticleSnapshot;

export interface StickAroundSimulation {
  bubbles: StickAroundBubble[];
  flash: number;
  fighters: Record<string, StickAroundFighter>;
  frame: number;
  height: number;
  lastTime: number;
  particles: StickAroundParticle[];
  platforms: StickAroundPlatform[];
  roundSeed: number;
  shake: number;
  spawnedHazardIds: Set<string>;
  width: number;
}

interface StickAroundPoint {
  x: number;
  y: number;
}

export function createStickAroundSimulation(
  game: PublicStickAroundGame,
  width = STICK_AROUND_ARENA_WIDTH,
  height = STICK_AROUND_ARENA_HEIGHT,
  now = Date.now()
): StickAroundSimulation {
  return {
    bubbles: [],
    flash: 0,
    fighters: {
      [game.players.host.userId]: createFighter(game.players.host, 'host', width * 0.24, height, now),
      [game.players.guest.userId]: createFighter(game.players.guest, 'guest', width * 0.76, height, now)
    },
    frame: 0,
    height,
    lastTime: now,
    particles: [],
    platforms: createPlatforms(width, height, game.roundSeed),
    roundSeed: game.roundSeed,
    shake: 0,
    spawnedHazardIds: new Set<string>(),
    width
  };
}

export function createStickAroundServerSimulation(
  game: PublicStickAroundGame,
  now = Date.now()
): StickAroundSimulation {
  const arena = getStickAroundArenaDimensions(game);
  return createStickAroundSimulation(game, arena.width, arena.height, now);
}

export function getStickAroundArenaDimensions(
  game: Pick<PublicStickAroundGame, 'arena'> | { arena?: Partial<{ height: number; width: number }> }
): { height: number; width: number } {
  return {
    height: getPositiveInteger(game.arena?.height, STICK_AROUND_ARENA_HEIGHT),
    width: getPositiveInteger(game.arena?.width, STICK_AROUND_ARENA_WIDTH)
  };
}

export function hydrateStickAroundSimulationSnapshot(
  snapshot: StickAroundSimulationSnapshot
): StickAroundSimulation {
  return {
    ...snapshot,
    bubbles: snapshot.bubbles.map((bubble) => ({
      ...bubble,
      hitUserIds: new Set(bubble.hitUserIds)
    })),
    spawnedHazardIds: new Set(snapshot.spawnedHazardIds)
  };
}

export function serializeStickAroundSimulation(
  simulation: StickAroundSimulation
): StickAroundSimulationSnapshot {
  return {
    bubbles: simulation.bubbles.map((bubble) => ({
      ...bubble,
      hitUserIds: [...bubble.hitUserIds]
    })),
    fighters: Object.fromEntries(Object.entries(simulation.fighters).map(([userId, fighter]) => [
      userId,
      { ...fighter }
    ])),
    flash: simulation.flash,
    frame: simulation.frame,
    height: simulation.height,
    lastTime: simulation.lastTime,
    particles: simulation.particles.map((particle) => ({ ...particle })),
    platforms: simulation.platforms.map((platform) => ({ ...platform })),
    roundSeed: simulation.roundSeed,
    shake: simulation.shake,
    spawnedHazardIds: [...simulation.spawnedHazardIds],
    width: simulation.width
  };
}

export function replaceStickAroundSimulation(
  target: StickAroundSimulation,
  snapshot: StickAroundSimulationSnapshot
): void {
  const next = hydrateStickAroundSimulationSnapshot(snapshot);
  target.bubbles = next.bubbles;
  target.flash = next.flash;
  target.fighters = next.fighters;
  target.frame = next.frame;
  target.height = next.height;
  target.lastTime = next.lastTime;
  target.particles = next.particles;
  target.platforms = next.platforms;
  target.roundSeed = next.roundSeed;
  target.shake = next.shake;
  target.spawnedHazardIds = next.spawnedHazardIds;
  target.width = next.width;
}

export function resizeStickAroundSimulation(
  simulation: StickAroundSimulation,
  width: number,
  height: number
): void {
  if (simulation.width === width && simulation.height === height) return;
  const previousGround = getGroundY(simulation);
  simulation.width = Math.max(1, width);
  simulation.height = Math.max(1, height);
  simulation.platforms = createPlatforms(simulation.width, simulation.height, simulation.roundSeed);
  const nextGround = getGroundY(simulation);
  Object.values(simulation.fighters).forEach((fighter) => {
    fighter.x = clamp(fighter.x, 0, Math.max(0, simulation.width - FIGHTER_WIDTH));
    if (fighter.grounded || fighter.y >= previousGround - 2) fighter.y = nextGround;
  });
}

export function stepStickAroundSimulation(
  simulation: StickAroundSimulation,
  game: PublicStickAroundGame,
  inputs: Record<string, StickAroundControls | StickAroundInputSnapshot | undefined>,
  messageTexts: ReadonlyMap<string, string>,
  now = Date.now()
): void {
  const stepTimes = getSimulationStepTimes(simulation, game, now);
  stepTimes.forEach((stepNow) => {
    const dt = clamp((stepNow - simulation.lastTime) / 1000, 0, MAX_STEP_SECONDS);
    simulation.lastTime = stepNow;
    simulation.frame += 1;
    ensureStickAroundFighters(simulation, game, stepNow);
    if (simulation.roundSeed !== game.roundSeed) {
      simulation.roundSeed = game.roundSeed;
      simulation.platforms = createPlatforms(simulation.width, simulation.height, simulation.roundSeed);
    }
    spawnStickAroundHazards(simulation, game.hazards, messageTexts, stepNow);

    const fighters = Object.values(simulation.fighters);
    fighters.forEach((fighter) => {
      stepFighter(simulation, fighter, normalizeControls(inputs[fighter.userId], now), dt, stepNow);
    });

    maybeApplyFighterContact(simulation, fighters, stepNow);
    stepBubbles(simulation, fighters, dt, stepNow);
    stepParticles(simulation, dt);
    fighters.forEach((fighter) => maybeLoseStock(simulation, fighter, stepNow));
    simulation.bubbles = simulation.bubbles.filter((bubble) => bubble.y < simulation.height + 80);
    simulation.shake = Math.max(0, simulation.shake - 22 * dt);
    simulation.flash = Math.max(0, simulation.flash - dt);
  });
  if (simulation.lastTime < now) simulation.lastTime = now;
}

function getSimulationStepTimes(
  simulation: StickAroundSimulation,
  game: PublicStickAroundGame,
  now: number
): number[] {
  const roundStartedAt = game.roundStartedAt;
  if (roundStartedAt !== undefined && simulation.lastTime < roundStartedAt) {
    simulation.lastTime = roundStartedAt;
  }
  if (now <= simulation.lastTime) return [simulation.lastTime];

  const stepTimes: number[] = [];
  const maxStepMs = MAX_STEP_SECONDS * 1000;
  let stepNow = simulation.lastTime;
  while (stepNow < now && stepTimes.length < MAX_SIMULATION_STEPS) {
    stepNow = Math.min(now, stepNow + maxStepMs);
    stepTimes.push(stepNow);
  }
  return stepTimes;
}

export function stepStickAroundVisualEffects(
  simulation: StickAroundSimulation,
  now = Date.now()
): void {
  const dt = clamp((now - simulation.lastTime) / 1000, 0, MAX_STEP_SECONDS);
  simulation.lastTime = now;
  simulation.frame += 1;
  stepParticles(simulation, dt);
  simulation.shake = Math.max(0, simulation.shake - 22 * dt);
  simulation.flash = Math.max(0, simulation.flash - dt);
}

export function getStickAroundWinnerUserId(simulation: StickAroundSimulation): string | null | undefined {
  const fighters = Object.values(simulation.fighters);
  const alive = fighters.filter((fighter) => fighter.stocks > 0);
  if (alive.length === fighters.length) return undefined;
  if (alive.length === 1) return alive[0].userId;
  return null;
}

export function getStickAroundFighterAnimation(fighter: StickAroundFighter, now = Date.now()): string {
  if (fighter.stocks <= 0) return 'ko';
  if (fighter.hurtUntil > now) return 'hurt';
  if (fighter.attackUntil > now) return 'attacking';
  if (!fighter.grounded) return 'jumping';
  if (Math.abs(fighter.vx) > 24) return 'running';
  return 'idle';
}

export function isStickAroundCurrentUserPlayer(game: PublicStickAroundGame, userId: string): boolean {
  return game.players.host.userId === userId || game.players.guest.userId === userId;
}

export function getStickAroundComputerControls(
  simulation: StickAroundSimulation,
  computerUserId: string,
  now = Date.now()
): StickAroundControls {
  const computer = simulation.fighters[computerUserId];
  const target = Object.values(simulation.fighters).find((fighter) => fighter.userId !== computerUserId);
  if (!computer || !target || computer.stocks <= 0 || target.stocks <= 0) {
    return {
      jump: false,
      left: false,
      right: false
    };
  }

  const computerCenterX = computer.x + FIGHTER_WIDTH / 2;
  const targetCenterX = target.x + FIGHTER_WIDTH / 2;
  const edgeBuffer = Math.max(38, simulation.width * 0.13);
  const standingPlatform = getStandingPlatform(simulation, computer);
  const targetBelow = target.y > computer.y + FIGHTER_HEIGHT * 0.45;
  const descentDirection = getPlatformDescentDirection(standingPlatform, computerCenterX, targetCenterX, targetBelow);
  const descendingFromPlatform = descentDirection !== null;
  let direction = descentDirection ??
    (targetCenterX >= computerCenterX ? 1 : -1);

  if (computer.x < 4) {
    direction = 1;
  } else if (computer.x + FIGHTER_WIDTH > simulation.width - 4) {
    direction = -1;
  } else if (!standingPlatform && computer.x < edgeBuffer) {
    direction = 1;
  } else if (!standingPlatform && computer.x + FIGHTER_WIDTH > simulation.width - edgeBuffer) {
    direction = -1;
  }

  const safelyInsideArena = computer.x > edgeBuffer * 0.65 &&
    computer.x + FIGHTER_WIDTH < simulation.width - edgeBuffer * 0.65;
  const horizontalDistance = Math.abs(targetCenterX - computerCenterX);
  const targetAbove = target.y + FIGHTER_HEIGHT * 0.25 < computer.y;
  const shouldJumpTowardTarget = targetAbove && horizontalDistance < 128;
  const decisionIndex = Math.floor((now + simulation.roundSeed * 17) / COMPUTER_RANDOM_JUMP_DECISION_MS);
  const random = createSeededRandom(
    simulation.roundSeed ^
    Math.imul(decisionIndex + 1, 0x9e3779b1)
  );
  const randomHop = random() < COMPUTER_RANDOM_JUMP_CHANCE;
  const jump = !descendingFromPlatform &&
    computer.grounded &&
    safelyInsideArena &&
    (shouldJumpTowardTarget || randomHop);

  return {
    jump,
    left: direction < 0,
    right: direction > 0
  };
}

function getPlatformDescentDirection(
  platform: StickAroundPlatform | null,
  computerCenterX: number,
  targetCenterX: number,
  targetBelow: boolean
): -1 | 1 | null {
  if (!platform || !targetBelow) return null;
  const leftEdge = platform.x;
  const rightEdge = platform.x + platform.width;
  const dropInset = Math.min(18, platform.width * 0.18);
  if (targetCenterX < leftEdge + dropInset) return -1;
  if (targetCenterX > rightEdge - dropInset) return 1;
  return computerCenterX < leftEdge + platform.width / 2 ? -1 : 1;
}

function createFighter(
  player: PublicUserIdentity,
  role: 'guest' | 'host',
  x: number,
  height: number,
  now: number
): StickAroundFighter {
  return {
    attackUntil: 0,
    collisionUntil: 0,
    damage: 0,
    facing: role === 'host' ? 1 : -1,
    grounded: true,
    hurtUntil: 0,
    invulnerableUntil: now + 600,
    label: player.displayName || 'Player',
    lastAttackAt: 0,
    koUntil: 0,
    role,
    respawnUntil: 0,
    stocks: STICK_AROUND_STARTING_STOCKS,
    userId: player.userId,
    vx: 0,
    vy: 0,
    x: clamp(x - FIGHTER_WIDTH / 2, 0, 9999),
    y: Math.max(0, height - FIGHTER_HEIGHT)
  };
}

function ensureStickAroundFighters(simulation: StickAroundSimulation, game: PublicStickAroundGame, now: number): void {
  const players = [
    { player: game.players.host, role: 'host' as const, x: simulation.width * 0.24 },
    { player: game.players.guest, role: 'guest' as const, x: simulation.width * 0.76 }
  ];
  players.forEach(({ player, role, x }) => {
    simulation.fighters[player.userId] ||= createFighter(player, role, x, simulation.height, now);
    const fighter = simulation.fighters[player.userId];
    fighter.label = player.displayName || fighter.label || 'Player';
  });
}

function stepFighter(
  simulation: StickAroundSimulation,
  fighter: StickAroundFighter,
  controls: StickAroundControls,
  dt: number,
  now: number
): void {
  if (fighter.stocks <= 0) return;
  if (fighter.koUntil > now) {
    fighter.vy += KO_GRAVITY * dt;
    fighter.x += fighter.vx * dt;
    fighter.y += fighter.vy * dt;
    return;
  }

  const horizontal = Number(controls.right) - Number(controls.left);
  const previousBottom = fighter.y + FIGHTER_HEIGHT;
  const canAct = fighter.hurtUntil <= now && fighter.respawnUntil <= now;
  if (canAct && horizontal !== 0) {
    fighter.facing = horizontal > 0 ? 1 : -1;
    fighter.vx = clamp(fighter.vx + horizontal * FIGHTER_ACCEL * dt, -FIGHTER_SPEED, FIGHTER_SPEED);
  } else {
    fighter.vx *= Math.pow(fighter.grounded ? GROUND_DRAG : AIR_DRAG, dt * 60);
  }

  if (canAct && controls.jump && fighter.grounded) {
    fighter.vy = JUMP_VELOCITY;
    fighter.grounded = false;
  }

  fighter.vy += GRAVITY * dt;
  fighter.x = clamp(
    fighter.x + fighter.vx * dt,
    -SIDE_POSITION_LIMIT,
    simulation.width - FIGHTER_WIDTH + SIDE_POSITION_LIMIT
  );
  fighter.y += fighter.vy * dt;
  fighter.grounded = false;
  const landingPlatform = getLandingPlatform(simulation, fighter, previousBottom);
  if (landingPlatform) {
    fighter.y = landingPlatform.y - FIGHTER_HEIGHT;
    fighter.vy = 0;
    fighter.grounded = true;
    return;
  }
  const groundY = getGroundY(simulation);
  const onStage = fighter.x >= 0 && fighter.x <= simulation.width - FIGHTER_WIDTH;
  if (onStage && fighter.y >= groundY) {
    fighter.y = groundY;
    fighter.vy = 0;
    fighter.grounded = true;
  }
}

function maybeApplyFighterContact(
  simulation: StickAroundSimulation,
  fighters: StickAroundFighter[],
  now: number
): void {
  const [left, right] = fighters;
  if (!left || !right || left.stocks <= 0 || right.stocks <= 0) return;
  if (!rectsIntersect(getFighterRect(left), getFighterRect(right))) return;

  if (left.collisionUntil <= now && isStomp(left, right)) {
    applyStomp(simulation, left, right, now);
    separateFighters(left, right);
    return;
  }
  if (right.collisionUntil <= now && isStomp(right, left)) {
    applyStomp(simulation, right, left, now);
    separateFighters(left, right);
    return;
  }

  const leftSpeed = Math.abs(left.vx);
  const rightSpeed = Math.abs(right.vx);
  if (left.collisionUntil <= now && leftSpeed > SHOVE_SPEED_THRESHOLD && leftSpeed >= rightSpeed) {
    maybeApplyBumpAttack(simulation, left, right, now);
  } else if (right.collisionUntil <= now && rightSpeed > SHOVE_SPEED_THRESHOLD) {
    maybeApplyBumpAttack(simulation, right, left, now);
  }

  separateFighters(left, right);
}

function isStomp(attacker: StickAroundFighter, defender: StickAroundFighter): boolean {
  const attackerBottom = attacker.y + FIGHTER_HEIGHT;
  return attacker.vy > 110 &&
    attackerBottom >= defender.y &&
    attackerBottom <= defender.y + 28;
}

function applyStomp(
  simulation: StickAroundSimulation,
  attacker: StickAroundFighter,
  defender: StickAroundFighter,
  now: number
): void {
  if (now - attacker.lastAttackAt < ATTACK_COOLDOWN_MS) return;
  if (attacker.collisionUntil > now || attacker.hurtUntil > now || attacker.respawnUntil > now) return;
  const fallSpeed = Math.abs(attacker.vy);
  attacker.vy = -300;
  attacker.lastAttackAt = now;
  attacker.collisionUntil = now + STOMP_COLLISION_COOLDOWN_MS;
  attacker.attackUntil = now + 220;
  const direction = attacker.x + FIGHTER_WIDTH / 2 < defender.x + FIGHTER_WIDTH / 2 ? 1 : -1;
  applyDamage(simulation, defender, 11 + fallSpeed / 90, direction, now, '#ffd36b');
}

function maybeApplyBumpAttack(
  simulation: StickAroundSimulation,
  attacker: StickAroundFighter,
  defender: StickAroundFighter,
  now: number
): void {
  if (now - attacker.lastAttackAt < ATTACK_COOLDOWN_MS) return;
  if (attacker.collisionUntil > now || attacker.hurtUntil > now || attacker.respawnUntil > now) return;
  const movingTowardDefender = (defender.x - attacker.x) * attacker.vx > 0;
  const shoveSpeed = Math.abs(attacker.vx);
  if (!movingTowardDefender || shoveSpeed < SHOVE_SPEED_THRESHOLD) return;
  attacker.lastAttackAt = now;
  attacker.collisionUntil = now + SHOVE_COLLISION_COOLDOWN_MS;
  attacker.attackUntil = now + 200;
  attacker.vx *= SHOVE_RECOIL;
  applyDamage(simulation, defender, 6 + shoveSpeed / 50, attacker.vx >= 0 ? 1 : -1, now, '#ffd36b');
}

function separateFighters(left: StickAroundFighter, right: StickAroundFighter): void {
  const leftCenter = left.x + FIGHTER_WIDTH / 2;
  const rightCenter = right.x + FIGHTER_WIDTH / 2;
  const overlap = leftCenter < rightCenter
    ? left.x + FIGHTER_WIDTH - right.x
    : right.x + FIGHTER_WIDTH - left.x;
  if (overlap <= 0) return;
  const push = overlap / 2 + 1;
  if (leftCenter < rightCenter) {
    left.x -= push;
    right.x += push;
  } else {
    left.x += push;
    right.x -= push;
  }
}

function stepBubbles(
  simulation: StickAroundSimulation,
  fighters: StickAroundFighter[],
  dt: number,
  now: number
): void {
  simulation.bubbles.forEach((bubble) => {
    bubble.vy += BUBBLE_GRAVITY * dt;
    bubble.x += bubble.vx * dt;
    bubble.y += bubble.vy * dt;
    bubble.angle += bubble.spin * dt;
    if (bubble.x < 4 || bubble.x + bubble.width > simulation.width - 4) {
      bubble.vx *= -0.74;
      bubble.spin *= -0.85;
      bubble.x = clamp(bubble.x, 4, Math.max(4, simulation.width - bubble.width - 4));
    }
    fighters.forEach((fighter) => {
      if (fighter.stocks <= 0 || bubble.hitUserIds.has(fighter.userId)) return;
      if (!rectsIntersect(getFighterRect(fighter), bubble)) return;
      const hit = applyDamage(
        simulation,
        fighter,
        10 + Math.round(bubble.width / 40),
        Math.sign(fighter.x - bubble.x) || 1,
        now,
        '#ff6161'
      );
      if (!hit) return;
      bubble.hitUserIds.add(fighter.userId);
      bubble.y = simulation.height + 120;
    });
  });
}

function stepParticles(simulation: StickAroundSimulation, dt: number): void {
  simulation.particles.forEach((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += PARTICLE_GRAVITY * dt;
  });
  simulation.particles = simulation.particles.filter((particle) => particle.life > 0);
}

function spawnStickAroundHazards(
  simulation: StickAroundSimulation,
  hazards: StickAroundHazardEvent[],
  messageTexts: ReadonlyMap<string, string>,
  now: number
): void {
  hazards.forEach((hazard) => {
    if (simulation.spawnedHazardIds.has(hazard.id) || hazard.spawnAt > now) return;
    simulation.spawnedHazardIds.add(hazard.id);
    const random = createSeededRandom(hazard.seed);
    const text = getHazardText(hazard, messageTexts);
    const { height, width } = getBubbleSize(hazard, simulation.width);
    simulation.bubbles.push({
      angle: random() * 0.16 - 0.08,
      height,
      hitUserIds: new Set<string>(),
      id: hazard.id,
      messageId: hazard.messageId,
      seed: hazard.seed,
      spin: random() * 2 - 1,
      text,
      vx: random() * 36 - 18,
      vy: (82 + random() * 53) * Math.max(0.85, hazard.weight * 0.34),
      width,
      x: Math.round(random() * Math.max(0, simulation.width - width)),
      y: -height - random() * 30
    });
  });
}

function getHazardText(
  hazard: StickAroundHazardEvent,
  messageTexts: ReadonlyMap<string, string>
): string {
  const text = hazard.messageId ? messageTexts.get(hazard.messageId) : '';
  return text ? text.slice(0, 80) : 'chat';
}

function getBubbleSize(
  hazard: StickAroundHazardEvent,
  simulationWidth: number
): { height: number; width: number } {
  if (isValidBubbleDimension(hazard.bubbleWidth) && isValidBubbleDimension(hazard.bubbleHeight)) {
    return {
      height: hazard.bubbleHeight,
      width: Math.min(hazard.bubbleWidth, Math.max(1, simulationWidth - 8))
    };
  }

  const maxWidth = Math.round(clamp(simulationWidth * 0.72, 116, 260));
  const weight = clamp(hazard.weight, 1, 3);
  const rawContentWidth = (10 + weight * 11) * BUBBLE_APPROX_CHAR_WIDTH;
  const width = Math.round(clamp(rawContentWidth + BUBBLE_HORIZONTAL_PADDING, 64, maxWidth));
  const contentWidth = Math.max(1, width - BUBBLE_HORIZONTAL_PADDING);
  const lineCount = Math.round(clamp(
    Math.ceil(rawContentWidth / contentWidth),
    1,
    BUBBLE_MAX_LINES
  ));
  return {
    height: Math.round(BUBBLE_VERTICAL_PADDING + lineCount * BUBBLE_LINE_HEIGHT),
    width
  };
}

function isValidBubbleDimension(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) < 1000;
}

function applyDamage(
  simulation: StickAroundSimulation,
  fighter: StickAroundFighter,
  amount: number,
  direction: number,
  now: number,
  color: string
): boolean {
  if (fighter.invulnerableUntil > now) return false;
  fighter.damage += amount;
  fighter.hurtUntil = now + Math.min(780, 240 + fighter.damage * 4);

  fighter.vx += direction * (150 + fighter.damage * 3.1 + amount * 8);
  fighter.vy -= 105 + fighter.damage * 1.05 + amount * 2.2;
  simulation.flash = Math.max(simulation.flash, 0.12);
  simulation.shake = Math.max(simulation.shake, 7);
  spawnParticles(
    simulation,
    fighter.x + FIGHTER_WIDTH / 2,
    fighter.y + FIGHTER_HEIGHT / 2,
    color,
    16
  );
  return true;
}

function maybeLoseStock(simulation: StickAroundSimulation, fighter: StickAroundFighter, now: number): void {
  if (fighter.stocks <= 0) return;
  if (fighter.respawnUntil > now || fighter.koUntil > now) return;
  const fellBelow = fighter.y > simulation.height + BOTTOM_FALLOFF_MARGIN;
  const fellAbove = fighter.y + FIGHTER_HEIGHT < -TOP_BLAST_MARGIN;
  const fellPastSide = fighter.x + FIGHTER_WIDTH < -SIDE_BLAST_MARGIN ||
    fighter.x > simulation.width + SIDE_BLAST_MARGIN;
  if (!fellBelow && !fellAbove && !fellPastSide) return;
  loseStock(simulation, fighter, now, getStockLossEffectOrigin(
    simulation,
    fighter,
    {
      fellAbove,
      fellBelow,
      fellPastSide
    }
  ));
}

function getStockLossEffectOrigin(
  simulation: StickAroundSimulation,
  fighter: StickAroundFighter,
  cause: {
    fellAbove: boolean;
    fellBelow: boolean;
    fellPastSide: boolean;
  }
): StickAroundPoint {
  const centerX = fighter.x + FIGHTER_WIDTH / 2;
  const centerY = fighter.y + FIGHTER_HEIGHT / 2;
  if (cause.fellPastSide) {
    return {
      x: centerX < simulation.width / 2 ? 0 : simulation.width,
      y: clamp(centerY, 0, simulation.height)
    };
  }
  return {
    x: clamp(centerX, 0, simulation.width),
    y: cause.fellAbove ? 0 : cause.fellBelow ? simulation.height : clamp(centerY, 0, simulation.height)
  };
}

function loseStock(
  simulation: StickAroundSimulation,
  fighter: StickAroundFighter,
  now: number,
  effectOrigin: StickAroundPoint
): void {
  if (fighter.stocks <= 0) return;
  fighter.stocks -= 1;
  simulation.flash = Math.max(simulation.flash, 0.16);
  simulation.shake = Math.max(simulation.shake, 10);
  spawnParticles(
    simulation,
    effectOrigin.x,
    effectOrigin.y,
    fighter.role === 'host' ? '#78c4ff' : '#ff9b9b',
    26
  );
  fighter.damage = 0;
  fighter.collisionUntil = 0;
  fighter.vx = 0;
  fighter.vy = 0;
  fighter.hurtUntil = now + 420;
  fighter.invulnerableUntil = now + RESPAWN_INVULNERABLE_MS;
  if (fighter.stocks <= 0) return;
  fighter.x = fighter.role === 'host'
    ? simulation.width * 0.28 - FIGHTER_WIDTH / 2
    : simulation.width * 0.72 - FIGHTER_WIDTH / 2;
  fighter.y = Math.min(36, Math.max(0, simulation.height - FIGHTER_HEIGHT));
  fighter.grounded = false;
  fighter.respawnUntil = now + RESPAWN_LOCK_MS;
  fighter.koUntil = now + KO_DROP_MS;
}

function createPlatforms(width: number, height: number, roundSeed: number): StickAroundPlatform[] {
  if (height < 230 || width < 260) return [];
  const random = createSeededRandom(
    roundSeed ^ Math.round(width * 97) ^ Math.round(height * 193)
  );
  const groundY = getGroundY({ height });
  const lowerY = Math.max(48, groundY - (62 + random() * 12));
  const upperY = Math.max(42, groundY - (118 + random() * 18));
  const sideWidth = Math.round(clamp(width * (0.28 + random() * 0.08), 84, 136));
  const centerWidth = Math.round(clamp(width * (0.34 + random() * 0.06), 96, 156));
  const leftX = Math.round(clamp(
    PLATFORM_SIDE_MARGIN + random() * Math.max(1, width * 0.16),
    PLATFORM_SIDE_MARGIN,
    width - sideWidth - PLATFORM_SIDE_MARGIN
  ));
  const rightX = Math.round(clamp(
    width - sideWidth - PLATFORM_SIDE_MARGIN - random() * Math.max(1, width * 0.16),
    PLATFORM_SIDE_MARGIN,
    width - sideWidth - PLATFORM_SIDE_MARGIN
  ));
  const platforms: StickAroundPlatform[] = [
    {
      height: PLATFORM_HEIGHT,
      kind: 'side',
      width: sideWidth,
      x: leftX,
      y: Math.round(lowerY)
    },
    {
      height: PLATFORM_HEIGHT,
      kind: 'side',
      width: sideWidth,
      x: rightX,
      y: Math.round(lowerY - 14 - random() * 12)
    }
  ];

  if (height >= 300) {
    platforms.push({
      height: PLATFORM_HEIGHT,
      kind: 'center',
      width: centerWidth,
      x: Math.round(clamp(
        width / 2 - centerWidth / 2 + (random() * 2 - 1) * width * 0.08,
        PLATFORM_SIDE_MARGIN,
        width - centerWidth - PLATFORM_SIDE_MARGIN
      )),
      y: Math.round(upperY)
    });
  }

  return platforms;
}

function getLandingPlatform(
  simulation: StickAroundSimulation,
  fighter: StickAroundFighter,
  previousBottom: number
): StickAroundPlatform | null {
  if (fighter.vy < 0) return null;
  const currentBottom = fighter.y + FIGHTER_HEIGHT;
  const fighterLeft = fighter.x;
  const fighterRight = fighter.x + FIGHTER_WIDTH;
  for (const platform of simulation.platforms) {
    const withinX = fighterRight > platform.x && fighterLeft < platform.x + platform.width;
    const crossedTop = previousBottom <= platform.y + 4 && currentBottom >= platform.y;
    const notFarBelow = currentBottom <= platform.y + platform.height + 18;
    if (withinX && crossedTop && notFarBelow) return platform;
  }
  return null;
}

function getStandingPlatform(
  simulation: StickAroundSimulation,
  fighter: StickAroundFighter
): StickAroundPlatform | null {
  if (!fighter.grounded) return null;
  const bottom = fighter.y + FIGHTER_HEIGHT;
  const fighterLeft = fighter.x;
  const fighterRight = fighter.x + FIGHTER_WIDTH;
  return simulation.platforms.find((platform) =>
    Math.abs(bottom - platform.y) <= 1 &&
    fighterRight > platform.x &&
    fighterLeft < platform.x + platform.width
  ) || null;
}

function spawnParticles(
  simulation: StickAroundSimulation,
  x: number,
  y: number,
  color: string,
  count: number
): void {
  const random = createSeededRandom(
    Math.round((simulation.frame + 1) * 997 + x * 31 + y * 17 + count * 13)
  );
  for (let index = 0; index < count; index += 1) {
    const life = 0.28 + random() * 0.34;
    simulation.particles.push({
      color,
      life,
      maxLife: life,
      size: 2 + random() * 3,
      vx: random() * 190 - 95,
      vy: -(24 + random() * 106),
      x,
      y
    });
  }
  if (simulation.particles.length > MAX_PARTICLES) {
    simulation.particles.splice(0, simulation.particles.length - MAX_PARTICLES);
  }
}

function normalizeControls(
  input: StickAroundControls | StickAroundInputSnapshot | undefined,
  now: number
): StickAroundControls {
  if (isStaleInput(input, now)) {
    return {
      jump: false,
      left: false,
      right: false
    };
  }
  return {
    jump: input?.jump === true,
    left: input?.left === true,
    right: input?.right === true
  };
}

function isStaleInput(
  input: StickAroundControls | StickAroundInputSnapshot | undefined,
  now: number
): boolean {
  return Boolean(input && 'sentAt' in input && now - input.sentAt > STALE_INPUT_MS);
}

function getGroundY(simulation: Pick<StickAroundSimulation, 'height'>): number {
  return Math.max(0, simulation.height - FIGHTER_HEIGHT);
}

function getFighterRect(fighter: StickAroundFighter): Rect {
  return {
    height: FIGHTER_HEIGHT,
    width: FIGHTER_WIDTH,
    x: fighter.x,
    y: fighter.y
  };
}

interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}

function rectsIntersect(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPositiveInteger(value: unknown, fallback: number): number {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = Math.imul(value ^ value >>> 15, 1 | value);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
