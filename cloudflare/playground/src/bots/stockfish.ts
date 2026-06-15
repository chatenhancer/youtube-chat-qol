/**
 * Stockfish library adapter.
 *
 * This file owns the UCI/runtime boundary only. Game-state checks and action
 * creation stay in the computer player.
 */
import createStockfishModuleFactory from 'stockfish/bin/stockfish-18-lite-single.js';
import stockfishWasmModule from 'stockfish/bin/stockfish-18-lite-single.wasm';

const STOCKFISH_ELO = 1350;
const STOCKFISH_MOVE_TIME_MS = 200;
const STOCKFISH_SEARCH_TIMEOUT_MS = 3_000;
const STOCKFISH_STOP_TIMEOUT_MS = 1_000;

export interface StockfishMove {
  from: string;
  promotion?: 'b' | 'n' | 'q' | 'r';
  to: string;
}

interface StockfishModule {
  ccall: (
    name: string,
    returnType: null,
    argTypes: ['string'],
    args: [string],
    options?: { async?: boolean }
  ) => unknown;
  listener?: (line: string) => void;
  terminate?: () => void;
}

interface StockfishRuntime {
  module: StockfishModule;
  waiters: Set<(line: string) => void>;
}

let stockfishRuntimePromise: Promise<StockfishRuntime> | null = null;
let stockfishQueue: Promise<unknown> = Promise.resolve();

export function getStockfishBestMove(fen: string): Promise<StockfishMove | null> {
  return getQueuedStockfishMove(fen);
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

function getQueuedStockfishMove(fen: string): Promise<StockfishMove | null> {
  const result = stockfishQueue.then(() => getStockfishMove(fen));
  stockfishQueue = result.catch(() => undefined);
  return result;
}

async function getStockfishMove(fen: string): Promise<StockfishMove | null> {
  const runtime = await withTimeout(getStockfishRuntime(), STOCKFISH_SEARCH_TIMEOUT_MS);
  sendStockfishCommand(runtime.module, `position fen ${fen}`);
  let bestMoveLine: string;
  try {
    bestMoveLine = await waitForStockfishLine(
      runtime,
      (line) => line.startsWith('bestmove '),
      () => sendStockfishCommand(runtime.module, `go movetime ${STOCKFISH_MOVE_TIME_MS}`, true),
      STOCKFISH_SEARCH_TIMEOUT_MS
    );
  } catch (error) {
    await stopTimedOutSearch(runtime);
    throw error;
  }

  return parseStockfishBestMove(bestMoveLine);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Stockfish.')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error('Stockfish failed.'));
      }
    );
  });
}

async function getStockfishRuntime(): Promise<StockfishRuntime> {
  stockfishRuntimePromise ||= createStockfishRuntime();
  return stockfishRuntimePromise;
}

async function createStockfishRuntime(): Promise<StockfishRuntime> {
  const waiters = new Set<(line: string) => void>();
  const stockfishModuleFactory = createStockfishModuleFactory();
  const module = await stockfishModuleFactory({
    instantiateWasm(imports, successCallback) {
      void instantiateStockfishWasm(imports, successCallback);
      return {};
    },
    listener(line) {
      waiters.forEach((waiter) => waiter(line));
    }
  }) as StockfishModule;
  const runtime = { module, waiters };

  await waitForStockfishLine(runtime, (line) => line === 'uciok', () => {
    sendStockfishCommand(module, 'uci');
  });
  sendStockfishCommand(module, 'setoption name UCI_LimitStrength value true');
  sendStockfishCommand(module, `setoption name UCI_Elo value ${STOCKFISH_ELO}`);
  await waitForStockfishLine(runtime, (line) => line === 'readyok', () => {
    sendStockfishCommand(module, 'isready');
  });

  return runtime;
}

async function instantiateStockfishWasm(
  imports: WebAssembly.Imports,
  successCallback: (instance: WebAssembly.Instance) => void
): Promise<void> {
  const result = await WebAssembly.instantiate(
    stockfishWasmModule as WebAssembly.Module | BufferSource,
    imports
  ) as WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource;
  successCallback(result instanceof WebAssembly.Instance ? result : result.instance);
}

function waitForStockfishLine(
  runtime: StockfishRuntime,
  predicate: (line: string) => boolean,
  start: () => void,
  timeoutMs = STOCKFISH_SEARCH_TIMEOUT_MS
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      runtime.waiters.delete(waiter);
      reject(new Error('Timed out waiting for Stockfish.'));
    }, timeoutMs);
    const waiter = (line: string): void => {
      if (!predicate(line)) return;
      clearTimeout(timeout);
      runtime.waiters.delete(waiter);
      resolve(line);
    };

    runtime.waiters.add(waiter);
    start();
  });
}

function sendStockfishCommand(module: StockfishModule, command: string, async = false): void {
  module.ccall('command', null, ['string'], [command], async ? { async: true } : undefined);
}

async function stopTimedOutSearch(runtime: StockfishRuntime): Promise<void> {
  let stopped = false;
  try {
    stopped = await waitForStockfishLine(
      runtime,
      (line) => line.startsWith('bestmove '),
      () => sendStockfishCommand(runtime.module, 'stop'),
      STOCKFISH_STOP_TIMEOUT_MS
    ).then(
      () => true,
      () => false
    );
  } catch {
    stopped = false;
  }

  if (!stopped) resetStockfishRuntime(runtime);
}

function resetStockfishRuntime(runtime: StockfishRuntime): void {
  stockfishRuntimePromise = null;
  runtime.waiters.clear();
  try {
    runtime.module.terminate?.();
  } catch {
    // The next request will create a fresh runtime.
  }
}
