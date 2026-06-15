import { describe, expect, it } from 'vitest';
import { PlayerStats } from './player-stats';
import type { DurableObjectState, DurableObjectStorage } from '../../types';

class FakeDurableObjectStorage implements DurableObjectStorage {
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

class FakeDurableObjectState implements DurableObjectState {
  readonly id = {
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
    const stats = new PlayerStats(new FakeDurableObjectState(storage));

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
