import { createErrorResponse } from '../../http';
import type { GameId } from '../../protocol/messages';
import type { Env } from '../../types';
import type { PlayerStatsSnapshot } from './player-stats';

const PLAYER_STATS_OBJECT_NAME = 'global';
const RECORD_WIN_URL = 'https://player-stats.internal/internal/player-stats/record-win';
const USER_STATS_URL = 'https://player-stats.internal/internal/player-stats/user';

export async function recordPlayerWin(
  env: Pick<Env, 'PLAYER_STATS'>,
  input: {
    gameId: GameId;
    userId: string;
  }
): Promise<PlayerStatsSnapshot> {
  const response = await getPlayerStatsObject(env).fetch(new Request(RECORD_WIN_URL, {
    body: JSON.stringify(input),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  }));
  return readStatsResponse(response);
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

  const stats = isRecord(payload) ? payload.stats : undefined;
  if (!isPlayerStatsSnapshot(stats)) throw new Error('Player stats response was invalid.');
  return stats;
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
    typeof value.userId === 'string' &&
    typeof value.wins === 'number' &&
    Number.isFinite(value.wins) &&
    value.wins >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
