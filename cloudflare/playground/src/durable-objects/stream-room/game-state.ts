import { getGameModuleForRecord } from '../../games/registry';
import type { GameRecord, GameStatePersistence } from '../../games/types';
import { getLogErrorMessage, getLogErrorType, shortLogId } from '../../logging';

type LogDetails = Record<string, boolean | number | string | undefined>;
type LogEvent = (event: string, details?: LogDetails, level?: 'error' | 'info' | 'warn') => void;

const ROOM_STATE_STORAGE_KEY = 'roomState:v1';
export const GAME_STATE_DEFERRED_PERSIST_MS = 1_000;

interface StoredRoomState {
  games: unknown[];
}

export class GameState {
  private readonly games = new Map<string, GameRecord>();
  private deferredWriteTimer: ReturnType<typeof setTimeout> | null = null;
  private storageWriteQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly logEvent: LogEvent
  ) {}

  delete(gameId: string): void {
    this.games.delete(gameId);
    this.queueImmediateWrite();
  }

  get(gameId: string): GameRecord | undefined {
    return this.games.get(gameId);
  }

  set(game: GameRecord, { persistence = 'immediate' }: { persistence?: GameStatePersistence } = {}): void {
    this.games.set(game.gameId, game);
    if (persistence === 'deferred') {
      this.queueDeferredWrite();
      return;
    }
    this.queueImmediateWrite();
  }

  values(): GameRecord[] {
    return [...this.games.values()];
  }

  async load(): Promise<void> {
    let stored: unknown;
    try {
      stored = await this.state.storage.get<StoredRoomState>(ROOM_STATE_STORAGE_KEY);
    } catch (error) {
      this.logEvent('room_state_restore_failed', {
        errorMessage: getLogErrorMessage(error),
        errorType: getLogErrorType(error)
      }, 'warn');
      return;
    }

    const games = getStoredGames(stored);
    if (!games) return;

    games.forEach((game) => {
      const restoredGame = restoreStoredGame(game);
      if (!restoredGame) {
        this.logEvent('stored_game_ignored', {
          game: isRecord(game) && typeof game.gameId === 'string' ? shortLogId(game.gameId) : undefined
        }, 'warn');
        return;
      }

      this.games.set(restoredGame.gameId, restoredGame);
    });

    if (this.games.size > 0) {
      this.logEvent('room_state_restored', {
        gameCount: this.games.size
      });
    }
  }

  private queueDeferredWrite(): void {
    if (this.deferredWriteTimer !== null) return;
    this.deferredWriteTimer = setTimeout(() => {
      this.deferredWriteTimer = null;
      this.queueWrite();
    }, GAME_STATE_DEFERRED_PERSIST_MS);
  }

  private queueImmediateWrite(): void {
    if (this.deferredWriteTimer !== null) {
      clearTimeout(this.deferredWriteTimer);
      this.deferredWriteTimer = null;
    }
    this.queueWrite();
  }

  private queueWrite(): void {
    const write = this.storageWriteQueue
      .then(() => this.write())
      .catch((error: unknown) => {
        this.logEvent('room_state_persist_failed', {
          errorMessage: getLogErrorMessage(error),
          errorType: getLogErrorType(error)
        }, 'warn');
      });
    this.storageWriteQueue = write.catch(() => undefined);
    this.state.waitUntil(write);
  }

  private async write(): Promise<void> {
    await this.state.storage.put(ROOM_STATE_STORAGE_KEY, {
      games: this.values()
    } satisfies StoredRoomState);
  }
}

function getStoredGames(value: unknown): unknown[] | null {
  if (!isRecord(value)) return null;
  return Array.isArray(value.games) ? value.games : null;
}

function restoreStoredGame(value: unknown): GameRecord | null {
  if (!isRecord(value) || typeof value.gameType !== 'string') return null;

  try {
    const game = value as unknown as GameRecord;
    const gameModule = getGameModuleForRecord(game);
    if (!gameModule.isStoredGameRecord(value)) return null;
    return game;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
