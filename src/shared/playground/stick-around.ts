import type { PublicGame, PublicUserIdentity } from './protocol';

export type StickAroundPlayerRole = 'guest' | 'host';
export type StickAroundGameStatus = 'ready' | 'countdown' | 'active' | 'finished' | 'desynced';

export const STICK_AROUND_COUNTDOWN_MS = 3000;
export const STICK_AROUND_INPUT_RATE_MS = 90;
export const STICK_AROUND_TRAFFIC_WINDOW_MS = 1000;
export const STICK_AROUND_MAX_OBSERVED_MESSAGE_IDS = 20;
export const STICK_AROUND_MAX_HAZARDS_PER_OBSERVATION = 5;
export const STICK_AROUND_MAX_STORED_HAZARDS = 160;

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

export interface PublicStickAroundGame extends PublicGame {
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
  status: StickAroundGameStatus;
  winnerUserId?: string | null;
}
