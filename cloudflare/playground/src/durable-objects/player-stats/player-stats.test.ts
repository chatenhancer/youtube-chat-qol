import { describe, expect, it, vi } from 'vitest';
import {
  getPlayerStats,
  getPlayerStatsResponse,
  recordPlayerWin
} from './client';
import { PlayerStats } from './player-stats';
import {
  PLAYER_STATS_ROUTE,
  playerStatsRouteModule
} from './routes';
import type { Env } from '../../types';

class FakeDurableObjectStorage {
  private readonly records = new Map<string, unknown>();

  async deleteAll(): Promise<void> {
    this.records.clear();
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return cloneStoredValue(this.records.get(key)) as T | undefined;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.records.set(key, cloneStoredValue(value));
  }
}

class FakeDurableObjectState {
  readonly id = {
    equals: (other: DurableObjectId) => other.toString() === 'player-stats-id',
    toString: () => 'player-stats-id'
  };

  constructor(readonly storage: FakeDurableObjectStorage) {}

  blockConcurrencyWhile(callback: () => Promise<void> | void): void {
    void callback();
  }

  waitUntil(): void {}
}

describe('playground player stats', () => {
  it('records global wins by user and game type', async () => {
    const storage = new FakeDurableObjectStorage();
    const stats = new PlayerStats(new FakeDurableObjectState(storage) as unknown as DurableObjectState);

    await recordWin(stats, 'user-1', 'chess');
    await recordWin(stats, 'user-1', 'replay-trivia');
    await recordWin(stats, 'user-1', 'chess');

    const response = await stats.fetch(new Request('https://player-stats.test/internal/player-stats/user?userId=user-1'));

    await expect(response.json()).resolves.toEqual({
      ok: true,
      stats: {
        games: {
          chess: {
            wins: 2
          },
          'replay-trivia': {
            wins: 1
          }
        },
        userId: 'user-1',
        wins: 3
      }
    });
    await expect(storage.get('playerStats:user-1:v1')).resolves.toEqual({
      games: {
        chess: {
          wins: 2
        },
        'replay-trivia': {
          wins: 1
        }
      }
    });
    await expect(storage.get('playerStatsGame:chess:v1')).resolves.toBeUndefined();
  });

  it('normalizes stored records and rejects invalid durable object requests', async () => {
    const storage = new FakeDurableObjectStorage();
    await storage.put('playerStats:user-1:v1', {
      games: {
        chess: { wins: 2.8 },
        'replay-trivia': { wins: -1 },
        unsupported: { wins: 100 },
        broken: null
      }
    });
    const stats = new PlayerStats(new FakeDurableObjectState(storage) as unknown as DurableObjectState);

    await expect(readJson(stats.fetch(new Request('https://player-stats.test/internal/player-stats/user?userId=user-1')))).resolves.toEqual({
      ok: true,
      stats: {
        games: {
          chess: {
            wins: 2
          }
        },
        userId: 'user-1',
        wins: 2
      }
    });

    await expect(readError(stats.fetch(new Request('https://player-stats.test/internal/player-stats/record-win')))).resolves.toMatchObject({
      status: 405,
      body: {
        error: {
          code: 'method_not_allowed'
        }
      }
    });
    await expect(readError(stats.fetch(new Request('https://player-stats.test/internal/player-stats/record-win', {
      body: '{',
      method: 'POST'
    })))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_json'
        }
      }
    });
    await expect(readError(stats.fetch(new Request('https://player-stats.test/internal/player-stats/record-win', {
      body: JSON.stringify([]),
      method: 'POST'
    })))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_request'
        }
      }
    });
    await expect(readError(stats.fetch(new Request('https://player-stats.test/internal/player-stats/record-win', {
      body: JSON.stringify({
        gameId: 'not-a-game',
        userId: 'bad user'
      }),
      method: 'POST'
    })))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_request'
        }
      }
    });
    await expect(readError(stats.fetch(new Request('https://player-stats.test/internal/player-stats/user?userId=')))).resolves.toMatchObject({
      status: 400,
      body: {
        error: {
          code: 'invalid_user'
        }
      }
    });
    await expect(readError(stats.fetch(new Request('https://player-stats.test/unknown')))).resolves.toMatchObject({
      status: 404,
      body: {
        error: {
          code: 'not_found'
        }
      }
    });
  });

  it('uses the durable object client for win recording and user reads', async () => {
    const storage = new FakeDurableObjectStorage();
    const env = createPlayerStatsEnv(new PlayerStats(new FakeDurableObjectState(storage) as unknown as DurableObjectState));

    await expect(recordPlayerWin(env, {
      gameId: 'chess',
      userId: 'user-1'
    })).resolves.toEqual({
      games: {
        chess: {
          wins: 1
        }
      },
      userId: 'user-1',
      wins: 1
    });
    await expect(getPlayerStats(env, 'user-1')).resolves.toMatchObject({
      games: {
        chess: {
          wins: 1
        }
      },
      userId: 'user-1',
      wins: 1
    });
  });

  it('reports player stats client failures with useful errors', async () => {
    await expect(getPlayerStats({} as Pick<Env, 'PLAYER_STATS'>, 'user-1')).rejects.toThrow('Player stats binding is not configured.');

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
        games: {},
        userId: 'user-1',
        wins: Number.NaN
      }
    }));
    await expect(getPlayerStats(invalidEnv, 'user-1')).rejects.toThrow('Player stats response was invalid.');

    const unavailable = await getPlayerStatsResponse(errorEnv, 'user-1');
    await expect(unavailable.json()).resolves.toEqual({
      error: {
        code: 'player_stats_unavailable',
        message: 'stored service failed'
      }
    });
    expect(unavailable.status).toBe(503);
  });

  it('serves and validates the public player stats route', async () => {
    const storage = new FakeDurableObjectStorage();
    const env = createPlayerStatsEnv(new PlayerStats(new FakeDurableObjectState(storage) as unknown as DurableObjectState)) as Env;
    await recordPlayerWin(env, {
      gameId: 'replay-trivia',
      userId: 'user-1'
    });
    const route = playerStatsRouteModule.staticRoutes?.find((candidate) => candidate.path === PLAYER_STATS_ROUTE);
    expect(route).toBeDefined();

    const result = await route?.handle({
      env,
      request: new Request('https://playground.test/v1/player-stats?userId=user-1')
    });

    await expect(result?.response.json()).resolves.toEqual({
      ok: true,
      stats: {
        games: {
          'replay-trivia': {
            wins: 1
          }
        },
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

function recordWin(stats: PlayerStats, userId: string, gameId: string): Promise<Response> {
  return stats.fetch(new Request('https://player-stats.test/internal/player-stats/record-win', {
    body: JSON.stringify({
      gameId,
      userId
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  }));
}

function cloneStoredValue<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
}

async function readJson(response: Promise<Response>): Promise<unknown> {
  return (await response).json();
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
