import { describe, expect, it } from 'vitest';
import { parseStockfishBestMove, resolveStockfishModuleFactory } from './stockfish';

describe('Stockfish bot adapter', () => {
  it('parses Stockfish UCI best move output', () => {
    expect(parseStockfishBestMove('bestmove e7e8q ponder a2a1q')).toEqual({
      from: 'e7',
      promotion: 'q',
      to: 'e8'
    });
    expect(parseStockfishBestMove('bestmove 0000')).toBeNull();
  });

  it('accepts a direct Stockfish module factory export', () => {
    const stockfishModuleFactory = async (_config: unknown) => ({ ccall: () => undefined });

    expect(resolveStockfishModuleFactory(stockfishModuleFactory)).toBe(stockfishModuleFactory);
  });

  it('accepts a wrapped Stockfish module factory export', () => {
    const stockfishModuleFactory = async (_config: unknown) => ({ ccall: () => undefined });
    const createStockfishModuleFactory = () => stockfishModuleFactory;

    expect(resolveStockfishModuleFactory(createStockfishModuleFactory)).toBe(stockfishModuleFactory);
  });
});
