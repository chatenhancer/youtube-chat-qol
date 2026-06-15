/**
 * Stockfish engine adapter.
 *
 * The engine runs in a Cloudflare Container so CPU-heavy search cannot reset
 * the stream room Durable Object.
 */
import type { Env } from '../types';

const STOCKFISH_CONTAINER_NAME = 'stockfish-engine';
const STOCKFISH_ELO = 1700;
const STOCKFISH_MOVE_TIME_MS = 500;
const STOCKFISH_REQUEST_TIMEOUT_MS = 20_000;

export interface StockfishMove {
  from: string;
  promotion?: 'b' | 'n' | 'q' | 'r';
  to: string;
}

export type StockfishBestMoveProvider = (fen: string) => Promise<StockfishMove | null>;

export function createStockfishBestMoveProvider(env: Pick<Env, 'STOCKFISH_ENGINE'>): StockfishBestMoveProvider {
  return (fen) => getStockfishBestMove(fen, env);
}

export async function getStockfishBestMove(
  fen: string,
  env?: Pick<Env, 'STOCKFISH_ENGINE'>
): Promise<StockfishMove | null> {
  if (!env?.STOCKFISH_ENGINE) {
    throw new Error('Stockfish container binding is not configured.');
  }

  const container = getStockfishContainer(env.STOCKFISH_ENGINE);
  const response = await withTimeout(
    container.fetch('https://stockfish.local/best-move', {
      body: JSON.stringify({
        elo: STOCKFISH_ELO,
        fen,
        moveTimeMs: STOCKFISH_MOVE_TIME_MS
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    }),
    STOCKFISH_REQUEST_TIMEOUT_MS
  );

  const payload = await readStockfishResponse(response);
  return parseStockfishContainerMove(payload.move);
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
  move?: unknown;
}
