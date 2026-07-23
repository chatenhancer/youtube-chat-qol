import {
  SUPPORTED_GAMES,
  isPlaygroundComputerUserId,
  type GameId
} from '../../protocol/messages';

export type PlayerMatchOutcome = 'draw' | 'loss' | 'win';

export interface PlayerMatchResultInput {
  finishedAt: number;
  finishReason: string;
  gameType: GameId;
  gameVersion: number;
  matchId: string;
  participantUserIds: string[];
  startedAt?: number;
  winnerUserId: string | null;
}

export interface PlayerStatsEntry {
  draws: number;
  losses: number;
  played: number;
  wins: number;
}

export interface PlayerStatsSnapshot {
  draws: number;
  games: Record<string, PlayerStatsEntry>;
  losses: number;
  played: number;
  userId: string;
  wins: number;
}

export interface RecordPlayerMatchResult {
  matchId: string;
  recorded: boolean;
}

const MATCH_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const FINISH_REASON_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function parsePlayerMatchResultInput(value: unknown): PlayerMatchResultInput | null {
  if (!isRecord(value)) return null;

  const matchId = typeof value.matchId === 'string' ? value.matchId.trim() : '';
  const gameType = parseGameId(value.gameType);
  const gameVersion = parsePositiveInteger(value.gameVersion);
  const finishReason = typeof value.finishReason === 'string' ? value.finishReason.trim() : '';
  const finishedAt = parseTimestamp(value.finishedAt);
  const startedAt = value.startedAt === undefined ? undefined : parseTimestamp(value.startedAt);
  const participantUserIds = parseParticipantUserIds(value.participantUserIds);
  const winnerUserId = value.winnerUserId === null ? null : parseParticipantUserId(value.winnerUserId);

  if (
    !MATCH_ID_PATTERN.test(matchId) ||
    !gameType ||
    !gameVersion ||
    !FINISH_REASON_PATTERN.test(finishReason) ||
    finishedAt === null ||
    startedAt === null ||
    (startedAt !== undefined && startedAt > finishedAt) ||
    participantUserIds.length < 2 ||
    (winnerUserId !== null && !participantUserIds.includes(winnerUserId))
  ) {
    return null;
  }

  return {
    finishedAt,
    finishReason,
    gameType,
    gameVersion,
    matchId,
    participantUserIds,
    startedAt,
    winnerUserId
  };
}

export function parsePlayerUserId(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : '';
  return USER_ID_PATTERN.test(userId) ? userId : '';
}

export function getPlayerMatchOutcome(
  participantUserId: string,
  winnerUserId: string | null
): PlayerMatchOutcome {
  if (!winnerUserId) return 'draw';
  return participantUserId === winnerUserId ? 'win' : 'loss';
}

function parseParticipantUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const userIds = value.map(parseParticipantUserId);
  if (userIds.some((userId) => !userId) || new Set(userIds).size !== userIds.length) return [];
  return userIds;
}

function parseParticipantUserId(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : '';
  return parsePlayerUserId(userId) || (isPlaygroundComputerUserId(userId) ? userId : '');
}

function parseGameId(value: unknown): GameId | '' {
  return typeof value === 'string' && (SUPPORTED_GAMES as readonly string[]).includes(value)
    ? value as GameId
    : '';
}

function parsePositiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function parseTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
