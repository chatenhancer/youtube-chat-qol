/**
 * Stockfish container client.
 *
 * The engine runs in a Cloudflare Container so CPU-heavy search cannot reset
 * the stream room Durable Object.
 */
import { hashLogValue, logPlaygroundEvent } from '../../logging';
import type { Env } from '../../types';

const STOCKFISH_CONTAINER_NAME = 'stockfish-engine';
const DEFAULT_STOCKFISH_ELO = 1700;
const DEFAULT_STOCKFISH_MOVE_TIME_MS = 500;
const MAX_STOCKFISH_ELO = 3190;
const MAX_STOCKFISH_MOVE_TIME_MS = 2_000;
const MIN_STOCKFISH_ELO = 1320;
const MIN_STOCKFISH_MOVE_TIME_MS = 10;
const STOCKFISH_REQUEST_TIMEOUT_MS = 20_000;

export interface StockfishMove {
  from: string;
  promotion?: 'b' | 'n' | 'q' | 'r';
  to: string;
}

export interface StockfishResult {
  elapsedMs?: number;
  elo: number;
  fenHash: string;
  move: StockfishMove | null;
  moveTimeMs: number;
}

export interface StockfishSettings {
  elo: number;
  moveTimeMs: number;
}

export type StockfishBestMoveProvider = (fen: string) => Promise<StockfishResult>;

export function createStockfishBestMoveProvider(
  env: Pick<Env, 'STOCKFISH_ELO' | 'STOCKFISH_ENGINE' | 'STOCKFISH_MOVE_TIME_MS'>
): StockfishBestMoveProvider {
  return (fen) => getStockfishBestMove(fen, env);
}

export async function getStockfishBestMove(
  fen: string,
  env?: Pick<Env, 'STOCKFISH_ELO' | 'STOCKFISH_ENGINE' | 'STOCKFISH_MOVE_TIME_MS'>
): Promise<StockfishResult> {
  if (!env?.STOCKFISH_ENGINE) {
    throw new Error('Stockfish container binding is not configured.');
  }

  const settings = getStockfishSettings(env);
  const container = getStockfishContainer(env.STOCKFISH_ENGINE);
  const response = await withTimeout(
    container.fetch('https://stockfish.local/best-move', {
      body: JSON.stringify({
        elo: settings.elo,
        fen,
        moveTimeMs: settings.moveTimeMs
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    }),
    STOCKFISH_REQUEST_TIMEOUT_MS
  );

  const payload = await readStockfishResponse(response);
  const result = {
    elapsedMs: getOptionalPositiveInteger(payload.elapsedMs),
    elo: getPositiveInteger(payload.elo, settings.elo),
    fenHash: hashLogValue(fen),
    move: parseStockfishContainerMove(payload.move),
    moveTimeMs: getPositiveInteger(payload.moveTimeMs, settings.moveTimeMs)
  };
  logPlaygroundEvent('stockfish_container_best_move_succeeded', {
    elapsedMs: result.elapsedMs,
    elo: result.elo,
    fen: result.fenHash,
    from: result.move?.from,
    moveTimeMs: result.moveTimeMs,
    promotion: result.move?.promotion,
    to: result.move?.to
  });
  return result;
}

export function parseStockfishBestMove(line: string): StockfishMove | null {
  const match = /^bestmove\s+([a-h][1-8])([a-h][1-8])([bnqr])?(\s|$)/.exec(line.trim());
  if (!match) return null;

  return {
    from: match[1],
    promotion: match[3] as StockfishMove['promotion'],
    to: match[2]
  };
}

async function readStockfishResponse(response: Response): Promise<StockfishContainerResponse> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Stockfish container returned invalid JSON with status ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(`Stockfish container failed with status ${response.status}: ${getContainerErrorMessage(payload)}`);
  }

  if (!isRecord(payload)) {
    throw new Error('Stockfish container response must be an object.');
  }

  return payload as StockfishContainerResponse;
}

function parseStockfishContainerMove(value: unknown): StockfishMove | null {
  if (value === null) return null;
  if (!isRecord(value)) throw new Error('Stockfish container move must be an object.');

  const from = getSquare(value.from, 'from');
  const to = getSquare(value.to, 'to');
  const promotion = getPromotion(value.promotion);
  return promotion ? { from, promotion, to } : { from, to };
}

function getSquare(value: unknown, key: string): string {
  if (typeof value !== 'string' || !/^[a-h][1-8]$/.test(value)) {
    throw new Error(`Stockfish container move ${key} must be a chess square.`);
  }
  return value;
}

function getPromotion(value: unknown): StockfishMove['promotion'] {
  if (value === undefined) return undefined;
  if (value === 'b' || value === 'n' || value === 'q' || value === 'r') return value;
  throw new Error('Stockfish container promotion must be b, n, q, or r.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getContainerErrorMessage(payload: unknown): string {
  if (isRecord(payload) && typeof payload.message === 'string') return payload.message;
  if (isRecord(payload) && typeof payload.error === 'string') return payload.error;
  return 'unknown error';
}

function getStockfishSettings(env: Pick<Env, 'STOCKFISH_ELO' | 'STOCKFISH_MOVE_TIME_MS'>): StockfishSettings {
  return {
    elo: getClampedInteger(env.STOCKFISH_ELO, DEFAULT_STOCKFISH_ELO, MIN_STOCKFISH_ELO, MAX_STOCKFISH_ELO),
    moveTimeMs: getClampedInteger(
      env.STOCKFISH_MOVE_TIME_MS,
      DEFAULT_STOCKFISH_MOVE_TIME_MS,
      MIN_STOCKFISH_MOVE_TIME_MS,
      MAX_STOCKFISH_MOVE_TIME_MS
    )
  };
}

function getClampedInteger(value: string | undefined, defaultValue: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

function getOptionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

function getPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) return fallback;
  return value;
}

function getStockfishContainer(stockfishEngine: NonNullable<Env['STOCKFISH_ENGINE']>): { fetch: typeof fetch } {
  const containerId = stockfishEngine.idFromName(STOCKFISH_CONTAINER_NAME);
  return stockfishEngine.get(containerId);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Stockfish container.')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('Stockfish container failed.'));
      }
    );
  });
}

interface StockfishContainerResponse {
  elapsedMs?: number;
  elo?: number;
  move?: unknown;
  moveTimeMs?: number;
}
