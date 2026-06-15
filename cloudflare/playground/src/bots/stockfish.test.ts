import { describe, expect, it, vi } from 'vitest';
import { getStockfishBestMove, parseStockfishBestMove } from './stockfish';
import type { DurableObjectNamespace, DurableObjectStub } from '../types';

describe('Stockfish bot adapter', () => {
  it('parses Stockfish UCI best move output', () => {
    expect(parseStockfishBestMove('bestmove e7e8q ponder a2a1q')).toEqual({
      from: 'e7',
      promotion: 'q',
      to: 'e8'
    });
    expect(parseStockfishBestMove('bestmove 0000')).toBeNull();
  });

  it('requests a best move from the Stockfish container', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      expect(request.url).toBe('https://stockfish.local/best-move');
      expect(request.method).toBe('POST');
      await expect(request.json()).resolves.toMatchObject({
        elo: 1350,
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        moveTimeMs: 200
      });

      return Response.json({
        elapsedMs: 215,
        move: {
          from: 'e7',
          to: 'e5'
        }
      });
    });
    const env = {
      STOCKFISH_ENGINE: createNamespace(fetch)
    };

    await expect(getStockfishBestMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      env
    )).resolves.toEqual({
      from: 'e7',
      to: 'e5'
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the Stockfish container has no best move', async () => {
    const env = {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({ move: null }))
    };

    await expect(getStockfishBestMove('8/8/8/8/8/8/8/8 w - - 0 1', env)).resolves.toBeNull();
  });

  it('throws when the Stockfish container binding is missing', async () => {
    await expect(getStockfishBestMove('8/8/8/8/8/8/8/8 w - - 0 1')).rejects.toThrow(
      'Stockfish container binding is not configured.'
    );
  });

  it('throws when the Stockfish container returns an invalid move', async () => {
    const env = {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({
        move: {
          from: 'bad',
          to: 'e5'
        }
      }))
    };

    await expect(getStockfishBestMove('8/8/8/8/8/8/8/8 w - - 0 1', env)).rejects.toThrow(
      'Stockfish container move from must be a chess square.'
    );
  });
});

function createNamespace(fetch: DurableObjectStub['fetch']): DurableObjectNamespace {
  return {
    get: () => ({ fetch }),
    idFromName: (name: string) => ({
      toString: () => name
    })
  };
}
