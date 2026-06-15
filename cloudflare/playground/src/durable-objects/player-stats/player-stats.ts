import { SUPPORTED_GAMES, type GameId } from '../../protocol/messages';
import { createErrorResponse, createJsonResponse } from '../../http';
import type { DurableObjectState } from '../../types';

const PLAYER_STATS_KEY_PREFIX = 'playerStats:';
const STATS_KEY_VERSION = ':v1';

export interface PlayerStatsSnapshot {
  games: Record<string, PlayerStatsEntry>;
  userId: string;
  wins: number;
}

export interface PlayerStatsEntry {
  wins: number;
}

interface StoredUserStats {
  games: Record<string, PlayerStatsEntry>;
}

export class PlayerStats {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/internal/player-stats/record-win') {
      return this.handleRecordWin(request);
    }
    if (url.pathname === '/internal/player-stats/user') {
      return this.handleUserStats(url);
    }

    return createErrorResponse('not_found', 'Not found.', 404);
  }

  private async handleRecordWin(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return createErrorResponse('method_not_allowed', 'Only POST is supported.', 405);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return createErrorResponse('invalid_json', 'Request body must be valid JSON.', 400);
    }
    if (!isRecord(payload)) {
      return createErrorResponse('invalid_request', 'Request body must be an object.', 400);
    }

    const userId = parseUserId(payload.userId);
    const gameId = parseGameId(payload.gameId);
    if (!userId || !gameId) {
      return createErrorResponse('invalid_request', 'userId and gameId are required.', 400);
    }

    const stats = await this.recordWin(userId, gameId);
    return createJsonResponse({
      ok: true,
      stats
    });
  }

  private async handleUserStats(url: URL): Promise<Response> {
    const userId = parseUserId(url.searchParams.get('userId'));
    if (!userId) {
      return createErrorResponse('invalid_user', 'userId is required.', 400);
    }

    return createJsonResponse({
      ok: true,
      stats: await this.getUserStats(userId)
    });
  }

  private async recordWin(userId: string, gameId: GameId): Promise<PlayerStatsSnapshot> {
    const userStats = await this.readUserStats(userId);
    const nextWins = normalizeWins(userStats.games[gameId]?.wins) + 1;
    const nextUserStats: StoredUserStats = {
      games: {
        ...userStats.games,
        [gameId]: {
          wins: nextWins
        }
      }
    };

    await this.state.storage.put(getPlayerStatsKey(userId), nextUserStats);

    return toPlayerStatsSnapshot(userId, nextUserStats);
  }

  private async getUserStats(userId: string): Promise<PlayerStatsSnapshot> {
    return toPlayerStatsSnapshot(userId, await this.readUserStats(userId));
  }

  private async readUserStats(userId: string): Promise<StoredUserStats> {
    return normalizeStoredUserStats(await this.state.storage.get<StoredUserStats>(getPlayerStatsKey(userId)));
  }
}

function toPlayerStatsSnapshot(userId: string, stats: StoredUserStats): PlayerStatsSnapshot {
  const games = normalizeGames(stats.games);
  return {
    games,
    userId,
    wins: Object.values(games).reduce((total, entry) => total + entry.wins, 0)
  };
}

function normalizeStoredUserStats(value: unknown): StoredUserStats {
  if (!isRecord(value) || !isRecord(value.games)) return { games: {} };
  return {
    games: normalizeGames(value.games)
  };
}

function normalizeGames(value: Record<string, unknown>): Record<string, PlayerStatsEntry> {
  return Object.fromEntries(Object.entries(value).flatMap(([gameId, stats]) => {
    const wins = getStoredWins(stats);
    return parseGameId(gameId) && wins > 0 ? [[gameId, { wins }]] : [];
  }));
}

function getStoredWins(value: unknown): number {
  if (!isRecord(value)) return 0;
  return normalizeWins(value.wins);
}

function normalizeWins(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function parseUserId(value: unknown): string {
  const userId = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{1,128}$/.test(userId) ? userId : '';
}

function parseGameId(value: unknown): GameId | '' {
  return typeof value === 'string' && (SUPPORTED_GAMES as readonly string[]).includes(value) ? value as GameId : '';
}

function getPlayerStatsKey(userId: string): string {
  return `${PLAYER_STATS_KEY_PREFIX}${userId}${STATS_KEY_VERSION}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
