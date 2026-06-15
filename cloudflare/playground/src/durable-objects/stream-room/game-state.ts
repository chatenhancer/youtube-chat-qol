import { getGameModuleForRecord } from '../../games/registry';
import type { GameRecord } from '../../games/types';
import { shortLogId } from '../../logging';
import type { PublicUserIdentity } from '../../protocol/messages';
import type { DurableObjectState } from '../../types';

type LogDetails = Record<string, boolean | number | string | undefined>;
type LogEvent = (event: string, details?: LogDetails, level?: 'error' | 'info' | 'warn') => void;

const ROOM_STATE_STORAGE_KEY = 'roomState:v1';

interface StoredRoomState {
  games: unknown[];
  knownUsers: unknown[];
}

export class GameState {
  private readonly games = new Map<string, GameRecord>();
  private readonly knownUsers = new Map<string, PublicUserIdentity>();
  private storageWriteQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly logEvent: LogEvent
  ) {}

  delete(gameId: string): void {
    this.games.delete(gameId);
    this.queueWrite();
  }

  get(gameId: string): GameRecord | undefined {
    return this.games.get(gameId);
  }

  set(game: GameRecord): void {
    this.games.set(game.gameId, game);
    this.queueWrite();
  }

  setKnownUser(user: PublicUserIdentity): void {
    const existing = this.knownUsers.get(user.userId);
    if (existing?.displayName === user.displayName) return;
    this.knownUsers.set(user.userId, user);
    this.queueWrite();
  }

  getKnownUsers(): PublicUserIdentity[] {
    return [...this.knownUsers.values()];
  }

  values(): GameRecord[] {
    return [...this.games.values()];
  }

  async load(): Promise<void> {
    let stored: unknown;
    try {
      stored = await this.state.storage.get<StoredRoomState>(ROOM_STATE_STORAGE_KEY);
    } catch {
      this.logEvent('room_state_restore_failed', {}, 'warn');
      return;
    }

    const games = getStoredGames(stored);
    const knownUsers = getStoredKnownUsers(stored);
    if (!games && !knownUsers.length) return;

    knownUsers.forEach((user) => {
      this.knownUsers.set(user.userId, user);
    });

    games?.forEach((game) => {
      if (!isSupportedStoredGame(game)) {
        this.logEvent('stored_game_ignored', {
          game: isRecord(game) && typeof game.gameId === 'string' ? shortLogId(game.gameId) : undefined
        }, 'warn');
        return;
      }

      this.games.set(game.gameId, game);
    });

    if (this.games.size > 0) {
      this.logEvent('room_state_restored', {
        gameCount: this.games.size,
        knownUserCount: this.knownUsers.size
      });
    }
  }

  private queueWrite(): void {
    const write = this.storageWriteQueue
      .then(() => this.write())
      .catch(() => {
        this.logEvent('room_state_persist_failed', {}, 'warn');
      });
    this.storageWriteQueue = write.catch(() => undefined);
    this.state.waitUntil(write);
  }

  private async write(): Promise<void> {
    await this.state.storage.put(ROOM_STATE_STORAGE_KEY, {
      games: this.values(),
      knownUsers: this.getKnownUsers()
    } satisfies StoredRoomState);
  }
}

function getStoredGames(value: unknown): unknown[] | null {
  if (!isRecord(value)) return null;
  return Array.isArray(value.games) ? value.games : null;
}

function getStoredKnownUsers(value: unknown): PublicUserIdentity[] {
  if (!isRecord(value) || !Array.isArray(value.knownUsers)) return [];
  return value.knownUsers.filter(isStoredPublicUser);
}

function isStoredPublicUser(value: unknown): value is PublicUserIdentity {
  return isRecord(value) && typeof value.userId === 'string' && typeof value.displayName === 'string';
}

function isSupportedStoredGame(value: unknown): value is GameRecord {
  if (!isRecord(value)) return false;
  if (typeof value.gameId !== 'string' || typeof value.gameType !== 'string' || typeof value.status !== 'string') {
    return false;
  }

  try {
    getGameModuleForRecord(value as unknown as GameRecord);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
