// @vitest-environment node

import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import {
  getPlayerStats,
  getPlayerStatsResponse,
  recordPlayerMatch
} from './client';
import { PlayerStats } from './player-stats';
import {
  PLAYER_STATS_ROUTE,
  playerStatsRouteModule
} from './routes';
import type { PlayerMatchResultInput } from './types';
import type { Env } from '../../types';

class FakeSqlStorage {
  private readonly database = new DatabaseSync(':memory:');

  exec<T extends Record<string, SqlStorageValue>>(
    query: string,
    ...bindings: SQLInputValue[]
  ): SqlStorageCursor<T> {
    const rows = this.database.prepare(query).all(...bindings) as T[];
    return {
      toArray: () => rows
    } as unknown as SqlStorageCursor<T>;
  }

  query<T extends Record<string, SqlStorageValue>>(query: string, ...bindings: SQLInputValue[]): T[] {
    return this.database.prepare(query).all(...bindings) as T[];
  }

  transaction<T>(callback: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

class FakeDurableObjectStorage {
  readonly fakeSql = new FakeSqlStorage();
  readonly sql = this.fakeSql as unknown as SqlStorage;

  transactionSync<T>(callback: () => T): T {
    return this.fakeSql.transaction(callback);
  }
}

class FakeDurableObjectState {
  readonly id = {
    equals: (other: DurableObjectId) => other.toString() === 'player-stats-id',
    toString: () => 'player-stats-id'
  };

  constructor(readonly storage: FakeDurableObjectStorage) {}

  waitUntil(): void {}
}

describe('playground player stats', () => {
  it('stores match facts and counts indexed player results on request', async () => {
    const storage = new FakeDurableObjectStorage();
    const state = new FakeDurableObjectState(storage);
    const stats = new PlayerStats(state as unknown as DurableObjectState);

    await recordMatch(stats, createMatch({
      matchId: 'match-chess-win',
      participantUserIds: ['user-1', 'user-2'],
      winnerUserId: 'user-1'
    }));
    await recordMatch(stats, createMatch({
      finishReason: 'finished',
      gameType: 'replay-trivia',
      gameVersion: 2,
      matchId: 'match-trivia-loss',
      participantUserIds: ['user-1', 'user-3'],
      winnerUserId: 'user-3'
    }));
    await recordMatch(stats, createMatch({
      finishReason: 'draw',
      matchId: 'match-chess-draw',
      participantUserIds: ['user-1', 'user-4'],
      winnerUserId: null
    }));
    await recordMatch(stats, createMatch({
      matchId: 'match-computer-win',
      participantUserIds: ['user-1', 'server:computer:chess:master'],
      winnerUserId: 'user-1'
    }));

    const response = await stats.fetch(new Request(
      'https://player-stats.test/internal/player-stats/user?userId=user-1'
    ));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      stats: {
        draws: 1,
        games: {
          chess: {
            draws: 1,
            losses: 0,
            played: 3,
            wins: 2
          },
          'replay-trivia': {
            draws: 0,
            losses: 1,
            played: 1,
            wins: 0
          }
        },
        losses: 1,
        played: 4,
        userId: 'user-1',
        wins: 2
      }
    });

    expect(storage.fakeSql.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM matches_v1'
    )[0]?.count).toBe(4);
    expect(storage.fakeSql.query<{
      outcome: string;
      user_id: string;
    }>(`
      SELECT outcome, user_id
      FROM match_participants_v1
      WHERE user_id = ?
    `, 'server:computer:chess:master')).toEqual([{
      outcome: 'loss',
      user_id: 'server:computer:chess:master'
    }]);
  });

  it('treats repeated match receipts as idempotent and rejects conflicting results', async () => {
    const storage = new FakeDurableObjectStorage();
    const state = new FakeDurableObjectState(storage);
    const stats = new PlayerStats(state as unknown as DurableObjectState);
    const match = createMatch({
      matchId: 'match-idempotent',
      participantUserIds: ['user-1', 'server:computer:chess:club'],
      winnerUserId: 'user-1'
    });

    const first = await recordMatch(stats, match);
    const repeated = await recordMatch(stats, match);
    const conflict = await readError(recordMatch(stats, {
      ...match,
      winnerUserId: 'server:computer:chess:club'
    }));
    const timestampConflict = await readError(recordMatch(stats, {
      ...match,
      finishedAt: match.finishedAt + 1
    }));

    await expect(first.json()).resolves.toMatchObject({
      result: {
        matchId: 'match-idempotent',
        recorded: true
      }
    });
    await expect(repeated.json()).resolves.toMatchObject({
      result: {
        matchId: 'match-idempotent',
        recorded: false
      }
    });
    expect(conflict).toMatchObject({
      body: {
        error: {
          code: 'match_conflict'
        }
      },
      status: 409
    });
    expect(timestampConflict).toMatchObject({
      body: {
        error: {
          code: 'match_conflict'
        }
      },
      status: 409
    });
    await expect(getPlayerStats(createPlayerStatsEnv(stats), 'user-1')).resolves.toMatchObject({
      played: 1,
      wins: 1
    });
  });

  it('stores abandoned matches and excludes them from every player total', async () => {
    const storage = new FakeDurableObjectStorage();
    const state = new FakeDurableObjectState(storage);
    const stats = new PlayerStats(state as unknown as DurableObjectState);
    const match = createMatch({
      abandonedByUserId: 'user-2',
      finishReason: 'playerLeft',
      matchId: 'match-abandoned',
      winnerUserId: null
    });

    const first = await recordMatch(stats, match);
    const repeated = await recordMatch(stats, match);
    const conflictingQuitter = await readError(recordMatch(stats, {
      ...match,
      abandonedByUserId: 'user-1'
    }));

    await expect(first.json()).resolves.toMatchObject({
      result: {
        matchId: 'match-abandoned',
        recorded: true
      }
    });
    await expect(repeated.json()).resolves.toMatchObject({
      result: {
        matchId: 'match-abandoned',
        recorded: false
      }
    });
    expect(conflictingQuitter).toMatchObject({
      body: {
        error: {
          code: 'match_conflict'
        }
      },
      status: 409
    });
    await expect(getPlayerStats(createPlayerStatsEnv(stats), 'user-1')).resolves.toEqual({
      draws: 0,
      games: {},
      losses: 0,
      played: 0,
      userId: 'user-1',
      wins: 0
    });
    await expect(getPlayerStats(createPlayerStatsEnv(stats), 'user-2')).resolves.toEqual({
      draws: 0,
      games: {},
      losses: 0,
      played: 0,
      userId: 'user-2',
      wins: 0
    });
    expect(storage.fakeSql.query<{
      outcome: string | null;
      user_id: string;
    }>(`
      SELECT user_id, outcome
      FROM match_participants_v1
      WHERE match_id = ?
      ORDER BY user_id
    `, match.matchId)).toEqual([
      {
        outcome: null,
        user_id: 'user-1'
      },
      {
        outcome: 'abandoned',
        user_id: 'user-2'
      }
    ]);
  });

  it('validates durable object match requests', async () => {
    const storage = new FakeDurableObjectStorage();
    const state = new FakeDurableObjectState(storage);
    const stats = new PlayerStats(state as unknown as DurableObjectState);

    await expect(readError(stats.fetch(new Request(
      'https://player-stats.test/internal/player-stats/record-match'
    )))).resolves.toMatchObject({
      status: 405,
      body: {
        error: {
          code: 'method_not_allowed'
        }
      }
    });
    await expect(readError(stats.fetch(new Request(
      'https://player-stats.test/internal/player-stats/record-match',
      {
        body: '{',
        method: 'POST'
      }
    )))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_json'
        }
      }
    });
    await expect(readError(recordMatch(stats, {
      ...createMatch(),
      participantUserIds: ['user-1']
    }))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_request'
        }
      }
    });
    await expect(readError(recordMatch(stats, {
      ...createMatch(),
      finishedAt: 1_000,
      startedAt: 2_000
    }))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_request'
        }
      }
    });
    await expect(readError(recordMatch(stats, {
      ...createMatch(),
      finishReason: 'playerLeft',
      winnerUserId: null
    }))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_request'
        }
      }
    });
    await expect(readError(recordMatch(stats, {
      ...createMatch(),
      abandonedByUserId: 'user-2',
      finishReason: 'playerLeft'
    }))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_request'
        }
      }
    });
    const multiplayerResponse = await recordMatch(stats, {
      ...createMatch(),
      matchId: 'match-many-participants',
      participantUserIds: Array.from({ length: 12 }, (_, index) => `user-${index + 1}`),
      winnerUserId: 'user-1'
    });
    expect(multiplayerResponse.status).toBe(200);
    await expect(readError(stats.fetch(new Request(
      'https://player-stats.test/internal/player-stats/user?userId='
    )))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_user'
        }
      }
    });
    await expect(readError(stats.fetch(new Request(
      'https://player-stats.test/unknown'
    )))).resolves.toMatchObject({
      status: 404,
      body: {
        error: {
          code: 'not_found'
        }
      }
    });
  });

  it('uses the durable object client for match recording and user reads', async () => {
    const storage = new FakeDurableObjectStorage();
    const state = new FakeDurableObjectState(storage);
    const stats = new PlayerStats(state as unknown as DurableObjectState);
    const env = createPlayerStatsEnv(stats);

    await expect(recordPlayerMatch(env, createMatch({
      finishReason: 'finished',
      gameType: 'stick-around',
      matchId: 'match-client',
      participantUserIds: ['user-1', 'server:computer:stick-around'],
      winnerUserId: 'user-1'
    }))).resolves.toMatchObject({
      matchId: 'match-client',
      recorded: true
    });
    await expect(getPlayerStats(env, 'user-1')).resolves.toMatchObject({
      games: {
        'stick-around': {
          played: 1,
          wins: 1
        }
      },
      played: 1,
      userId: 'user-1',
      wins: 1
    });
  });

  it('reports player stats client failures with useful errors', async () => {
    await expect(getPlayerStats({} as Pick<Env, 'PLAYER_STATS'>, 'user-1'))
      .rejects.toThrow('Player stats binding is not configured.');

    const env = createResponsePlayerStatsEnv(new Response('not json', { status: 502 }));
    await expect(getPlayerStats(env, 'user-1')).rejects.toThrow('Player stats returned 502.');

    const errorEnv = createResponsePlayerStatsEnv(Response.json({
      error: {
        message: 'stored service failed'
      }
    }, { status: 500 }));
    await expect(getPlayerStats(errorEnv, 'user-1')).rejects.toThrow('stored service failed');

    const invalidEnv = createResponsePlayerStatsEnv(Response.json({
      ok: true,
      stats: {
        draws: 0,
        games: {},
        losses: 0,
        played: 0,
        userId: 'user-1',
        wins: Number.NaN
      }
    }));
    await expect(getPlayerStats(invalidEnv, 'user-1')).rejects.toThrow(
      'Player stats response was invalid.'
    );

    const mismatchedMatchEnv = createResponsePlayerStatsEnv(Response.json({
      ok: true,
      result: {
        matchId: 'different-match',
        recorded: true
      }
    }));
    await expect(recordPlayerMatch(mismatchedMatchEnv, createMatch())).rejects.toThrow(
      'Player match result response was invalid.'
    );

    const unavailable = await getPlayerStatsResponse(errorEnv, 'user-1');
    await expect(unavailable.json()).resolves.toEqual({
      error: {
        code: 'player_stats_unavailable',
        message: 'stored service failed'
      }
    });
    expect(unavailable.status).toBe(503);
  });

  it('serves the public player stats route from stored matches', async () => {
    const storage = new FakeDurableObjectStorage();
    const state = new FakeDurableObjectState(storage);
    const stats = new PlayerStats(state as unknown as DurableObjectState);
    const env = createPlayerStatsEnv(stats) as Env;
    await recordPlayerMatch(env, createMatch({
      finishReason: 'finished',
      gameType: 'replay-trivia',
      gameVersion: 2,
      matchId: 'match-route',
      participantUserIds: ['user-1', 'user-2'],
      winnerUserId: 'user-1'
    }));
    const route = playerStatsRouteModule.staticRoutes?.find((candidate) =>
      candidate.path === PLAYER_STATS_ROUTE
    );
    expect(route).toBeDefined();

    const result = await route?.handle({
      env,
      request: new Request('https://playground.test/v1/player-stats?userId=user-1')
    });

    await expect(result?.response.json()).resolves.toEqual({
      ok: true,
      stats: {
        draws: 0,
        games: {
          'replay-trivia': {
            draws: 0,
            losses: 0,
            played: 1,
            wins: 1
          }
        },
        losses: 0,
        played: 1,
        userId: 'user-1',
        wins: 1
      }
    });
    expect(result?.applyCors).toBe(true);

    await expect(readRouteError(route?.handle({
      env,
      request: new Request('https://playground.test/v1/player-stats', { method: 'POST' })
    }))).resolves.toMatchObject({
      status: 405,
      body: {
        error: {
          code: 'method_not_allowed'
        }
      }
    });
    await expect(readRouteError(route?.handle({
      env,
      request: new Request('https://playground.test/v1/player-stats?userId=bad%20user')
    }))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_user'
        }
      }
    });
  });
});

function createMatch(overrides: Partial<PlayerMatchResultInput> = {}): PlayerMatchResultInput {
  return {
    abandonedByUserId: null,
    finishedAt: 2_000,
    finishReason: 'checkmate',
    gameType: 'chess',
    gameVersion: 1,
    matchId: 'match-default',
    participantUserIds: ['user-1', 'user-2'],
    startedAt: 1_000,
    winnerUserId: 'user-1',
    ...overrides
  };
}

function recordMatch(stats: PlayerStats, match: PlayerMatchResultInput): Promise<Response> {
  return stats.fetch(new Request('https://player-stats.test/internal/player-stats/record-match', {
    body: JSON.stringify(match),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  }));
}

async function readError(response: Promise<Response>): Promise<{ body: unknown; status: number }> {
  const resolved = await response;
  return {
    body: await resolved.json(),
    status: resolved.status
  };
}

async function readRouteError(
  result: Promise<{ response: Response }> | { response: Response } | undefined
): Promise<{ body: unknown; status: number }> {
  const resolved = await result;
  expect(resolved).toBeDefined();
  return {
    body: await resolved!.response.json(),
    status: resolved!.response.status
  };
}

function createPlayerStatsEnv(stats: PlayerStats): Pick<Env, 'PLAYER_STATS'> {
  return {
    PLAYER_STATS: {
      get: vi.fn(() => ({
        fetch: (request: Request) => stats.fetch(request)
      })),
      idFromName: vi.fn((name: string) => ({
        name,
        toString: () => name
      }))
    } as unknown as DurableObjectNamespace
  };
}

function createResponsePlayerStatsEnv(response: Response): Pick<Env, 'PLAYER_STATS'> {
  return {
    PLAYER_STATS: {
      get: vi.fn(() => ({
        fetch: vi.fn(async () => response.clone())
      })),
      idFromName: vi.fn((name: string) => ({
        name,
        toString: () => name
      }))
    } as unknown as DurableObjectNamespace
  };
}
