import type { PublicGame, PublicUserIdentity } from './protocol';

export type StickAroundPlayerRole = 'guest' | 'host';
export type StickAroundGameStatus = 'ready' | 'countdown' | 'active' | 'finished' | 'desynced';

export const STICK_AROUND_COUNTDOWN_MS = 3000;
export const STICK_AROUND_INPUT_RATE_MS = 33;
export const STICK_AROUND_TRAFFIC_WINDOW_MS = 1000;
export const STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS = 20;
export const STICK_AROUND_MAX_HAZARDS_PER_OBSERVATION = 5;
export const STICK_AROUND_MAX_STORED_HAZARDS = 160;
export const STICK_AROUND_ARENA_WIDTH = 360;
export const STICK_AROUND_ARENA_HEIGHT = 560;

export interface StickAroundArenaDimensions {
  height: number;
  width: number;
}

export interface StickAroundControls {
  jump: boolean;
  left: boolean;
  right: boolean;
}

export interface StickAroundInputSnapshot {
  frame: number;
  jump: boolean;
  left: boolean;
  right: boolean;
  seq: number;
  sentAt: number;
  userId: string;
}

export interface StickAroundHazardEvent {
  bubbleHeight?: number;
  bubbleWidth?: number;
  id: string;
  seed: number;
  messageId?: string;
  spawnAt: number;
  weight: number;
}

export interface StickAroundFinishReport {
  frame: number;
  reportedAt: number;
  userId: string;
  winnerUserId: string | null;
}

export interface StickAroundFighterSnapshot {
  attackUntil: number;
  collisionUntil: number;
  damage: number;
  facing: -1 | 1;
  grounded: boolean;
  hurtUntil: number;
  invulnerableUntil: number;
  label: string;
  lastAttackAt: number;
  koUntil: number;
  role: StickAroundPlayerRole;
  respawnUntil: number;
  stocks: number;
  userId: string;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

export interface StickAroundPlatformSnapshot {
  height: number;
  kind: 'center' | 'side';
  width: number;
  x: number;
  y: number;
}

export interface StickAroundBubbleSnapshot {
  angle: number;
  height: number;
  hitUserIds: string[];
  id: string;
  messageId?: string;
  seed: number;
  spin: number;
  text: string;
  vx: number;
  vy: number;
  width: number;
  x: number;
  y: number;
}

export interface StickAroundParticleSnapshot {
  color: string;
  life: number;
  maxLife: number;
  size: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

export interface StickAroundSimulationSnapshot {
  bubbles: StickAroundBubbleSnapshot[];
  fighters: Record<string, StickAroundFighterSnapshot>;
  flash: number;
  frame: number;
  height: number;
  lastTime: number;
  particles: StickAroundParticleSnapshot[];
  platforms: StickAroundPlatformSnapshot[];
  roundSeed: number;
  shake: number;
  spawnedHazardIds: string[];
  width: number;
}

export interface PublicStickAroundGame extends PublicGame {
  arena?: StickAroundArenaDimensions;
  finishReports: Record<string, StickAroundFinishReport>;
  gameType: 'stick-around';
  hazards: StickAroundHazardEvent[];
  inputs: Record<string, StickAroundInputSnapshot>;
  phaseStartedAt: number;
  players: Record<StickAroundPlayerRole, PublicUserIdentity>;
  readyPlayers: Partial<Record<StickAroundPlayerRole, boolean>>;
  roundSeed: number;
  roundStartedAt?: number;
  serverNow?: number;
  simulation?: StickAroundSimulationSnapshot;
  status: StickAroundGameStatus;
  winnerUserId?: string | null;
}
