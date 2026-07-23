import { createErrorResponse } from '../../http';
import type { Env } from '../../types';
import type {
  PlayerMatchResultInput,
  PlayerStatsEntry,
  PlayerStatsSnapshot,
  RecordPlayerMatchResult
} from './types';

const PLAYER_STATS_OBJECT_NAME = 'global';
const RECORD_MATCH_URL = 'https://player-stats.internal/internal/player-stats/record-match';
const USER_STATS_URL = 'https://player-stats.internal/internal/player-stats/user';

export async function recordPlayerMatch(
  env: Pick<Env, 'PLAYER_STATS'>,
  input: PlayerMatchResultInput
): Promise<RecordPlayerMatchResult> {
  const response = await getPlayerStatsObject(env).fetch(new Request(RECORD_MATCH_URL, {
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  }));
  const result = await readMatchResultResponse(response);
  if (result.matchId !== input.matchId) throw new Error('Player match result response was invalid.');
  return result;
}

export async function getPlayerStats(
  env: Pick<Env, 'PLAYER_STATS'>,
  userId: string
): Promise<PlayerStatsSnapshot> {
  const url = new URL(USER_STATS_URL);
  url.searchParams.set('userId', userId);
  const response = await getPlayerStatsObject(env).fetch(new Request(url));
  return readStatsResponse(response);
}

export async function getPlayerStatsResponse(env: Pick<Env, 'PLAYER_STATS'>, userId: string): Promise<Response> {
  try {
    return Response.json({
      ok: true,
      stats: await getPlayerStats(env, userId)
    });
  } catch (error) {
    return createErrorResponse(
      'player_stats_unavailable',
      error instanceof Error ? error.message : 'Player stats are unavailable.',
      503
    );
  }
}

async function readStatsResponse(response: Response): Promise<PlayerStatsSnapshot> {
  const payload = await readResponsePayload(response);
  const stats = isRecord(payload) ? payload.stats : undefined;
  if (!isPlayerStatsSnapshot(stats)) throw new Error('Player stats response was invalid.');
  return stats;
}

async function readMatchResultResponse(response: Response): Promise<RecordPlayerMatchResult> {
  const payload = await readResponsePayload(response);
  const result = isRecord(payload) ? payload.result : undefined;
  if (!isRecordPlayerMatchResult(result)) throw new Error('Player match result response was invalid.');
  return result;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Player stats returned ${response.status}.`);
  }

  if (!response.ok) {
    const message = getErrorMessage(payload) || `Player stats returned ${response.status}.`;
    throw new Error(message);
  }

  return payload;
}

function getPlayerStatsObject(env: Pick<Env, 'PLAYER_STATS'>): { fetch: typeof fetch } {
  if (!env.PLAYER_STATS) throw new Error('Player stats binding is not configured.');
  const id = env.PLAYER_STATS.idFromName(PLAYER_STATS_OBJECT_NAME);
  return env.PLAYER_STATS.get(id);
}

function getErrorMessage(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== 'string') return '';
  return value.error.message;
}

function isPlayerStatsSnapshot(value: unknown): value is PlayerStatsSnapshot {
  return isRecord(value) &&
    isRecord(value.games) &&
    typeof value.draws === 'number' &&
    Number.isFinite(value.draws) &&
    value.draws >= 0 &&
    typeof value.losses === 'number' &&
    Number.isFinite(value.losses) &&
    value.losses >= 0 &&
    typeof value.played === 'number' &&
    Number.isFinite(value.played) &&
    value.played >= 0 &&
    typeof value.userId === 'string' &&
    typeof value.wins === 'number' &&
    Number.isFinite(value.wins) &&
    value.wins >= 0 &&
    Object.values(value.games).every(isPlayerStatsEntry);
}

function isPlayerStatsEntry(value: unknown): value is PlayerStatsEntry {
  return isRecord(value) &&
    ['draws', 'losses', 'played', 'wins'].every((key) =>
      typeof value[key] === 'number' &&
      Number.isFinite(value[key]) &&
      value[key] >= 0
    );
}

function isRecordPlayerMatchResult(value: unknown): value is RecordPlayerMatchResult {
  return isRecord(value) &&
    typeof value.matchId === 'string' &&
    typeof value.recorded === 'boolean';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
