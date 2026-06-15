import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getStockfishBestMove, parseStockfishBestMove } from './client';
import type { DurableObjectNamespace, DurableObjectStub } from '../../types';

describe('Stockfish container client', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
        elo: 1700,
        fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        moveTimeMs: 500
      });

      return Response.json({
        elapsedMs: 215,
        elo: 1700,
        move: {
          from: 'e7',
          to: 'e5'
        },
        moveTimeMs: 500
      });
    });
    const env = {
      STOCKFISH_ENGINE: createNamespace(fetch)
    };

    await expect(getStockfishBestMove(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      env
    )).resolves.toEqual({
      elapsedMs: 215,
      elo: 1700,
      fenHash: expect.stringMatching(/^h_[a-z0-9]+$/),
      move: {
        from: 'e7',
        to: 'e5'
      },
      moveTimeMs: 500
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns null when the Stockfish container has no best move', async () => {
    const env = {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({ move: null }))
    };

    await expect(getStockfishBestMove('8/8/8/8/8/8/8/8 w - - 0 1', env)).resolves.toMatchObject({
      elo: 1700,
      move: null,
      moveTimeMs: 500
    });
  });

  it('uses configured Stockfish strength settings from the environment', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      await expect(request.json()).resolves.toMatchObject({
        elo: 1900,
        moveTimeMs: 750
      });
      return Response.json({
        elo: 1900,
        move: {
          from: 'g8',
          to: 'f6'
        },
        moveTimeMs: 750
      });
    });

    await expect(getStockfishBestMove('startpos', {
      STOCKFISH_ELO: '1900',
      STOCKFISH_ENGINE: createNamespace(fetch),
      STOCKFISH_MOVE_TIME_MS: '750'
    })).resolves.toMatchObject({
      elo: 1900,
      move: {
        from: 'g8',
        to: 'f6'
      },
      moveTimeMs: 750
    });
  });

  it('uses explicit Stockfish strength settings over the environment defaults', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      await expect(request.json()).resolves.toMatchObject({
        elo: 2100,
        moveTimeMs: 600
      });
      return Response.json({
        elo: 2100,
        move: {
          from: 'c7',
          to: 'c5'
        },
        moveTimeMs: 600
      });
    });

    await expect(getStockfishBestMove('startpos', {
      STOCKFISH_ELO: '1500',
      STOCKFISH_ENGINE: createNamespace(fetch),
      STOCKFISH_MOVE_TIME_MS: '300'
    }, {
      elo: 2100,
      moveTimeMs: 600
    })).resolves.toMatchObject({
      elo: 2100,
      move: {
        from: 'c7',
        to: 'c5'
      },
      moveTimeMs: 600
    });
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
