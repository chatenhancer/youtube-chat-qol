import { describe, expect, it } from 'vitest';
import { parseStockfishBestMove } from './stockfish';

describe('Stockfish bot adapter', () => {
  it('parses Stockfish UCI best move output', () => {
    expect(parseStockfishBestMove('bestmove e7e8q ponder a2a1q')).toEqual({
      from: 'e7',
      promotion: 'q',
      to: 'e8'
    });
    expect(parseStockfishBestMove('bestmove 0000')).toBeNull();
  });
});
