import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStockfishBestMoveProvider,
  getStockfishBestMove,
  parseStockfishBestMove
} from './client';

describe('Stockfish container client', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('parses Stockfish UCI best move output', () => {
    expect(parseStockfishBestMove('bestmove e7e8q ponder a2a1q')).toEqual({
      from: 'e7',
      promotion: 'q',
      to: 'e8'
    });
    expect(parseStockfishBestMove('  bestmove b1c3  ')).toEqual({
      from: 'b1',
      promotion: undefined,
      to: 'c3'
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

  it('allows the low Beginner chess strength setting', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      await expect(request.json()).resolves.toMatchObject({
        elo: 750
      });
      return Response.json({
        elo: 750,
        move: {
          from: 'b8',
          to: 'c6'
        },
        moveTimeMs: 500
      });
    });

    await expect(getStockfishBestMove('startpos', {
      STOCKFISH_ENGINE: createNamespace(fetch)
    }, {
      elo: 750
    })).resolves.toMatchObject({
      elo: 750,
      move: {
        from: 'b8',
        to: 'c6'
      }
    });
  });

  it('creates reusable best-move providers with normalized request settings', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      await expect(request.json()).resolves.toMatchObject({
        elo: 3190,
        moveTimeMs: 10
      });
      return Response.json({
        elapsedMs: -1,
        elo: -20,
        move: {
          from: 'a7',
          promotion: 'r',
          to: 'a8'
        },
        moveTimeMs: 0
      });
    });
    const provider = createStockfishBestMoveProvider({
      STOCKFISH_ELO: ' ',
      STOCKFISH_ENGINE: createNamespace(fetch),
      STOCKFISH_MOVE_TIME_MS: 'bad'
    }, {
      elo: 9999,
      moveTimeMs: -5
    });

    await expect(provider('promotion-fen')).resolves.toMatchObject({
      elapsedMs: undefined,
      elo: 3190,
      move: {
        from: 'a7',
        promotion: 'r',
        to: 'a8'
      },
      moveTimeMs: 10
    });
  });

  it('falls back to default settings for non-integer inputs', async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      await expect(request.json()).resolves.toMatchObject({
        elo: 1700,
        moveTimeMs: 500
      });
      return Response.json({
        move: {
          from: 'b8',
          to: 'c6'
        }
      });
    });

    await expect(getStockfishBestMove('startpos', {
      STOCKFISH_ELO: '1700.5',
      STOCKFISH_ENGINE: createNamespace(fetch),
      STOCKFISH_MOVE_TIME_MS: undefined
    }, {
      elo: Number.NaN,
      moveTimeMs: 12.5
    })).resolves.toMatchObject({
      elo: 1700,
      moveTimeMs: 500
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

  it('throws for malformed Stockfish container responses', async () => {
    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(async () => new Response('not-json', { status: 200 }))
    })).rejects.toThrow('Stockfish container returned invalid JSON with status 200.');

    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json(['not', 'an', 'object']))
    })).rejects.toThrow('Stockfish container response must be an object.');

    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({
        move: {
          from: 'e2',
          promotion: 'x',
          to: 'e4'
        }
      }))
    })).rejects.toThrow('Stockfish container promotion must be b, n, q, or r.');

    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({
        move: {
          from: 'e2',
          to: 12
        }
      }))
    })).rejects.toThrow('Stockfish container move to must be a chess square.');
  });

  it('surfaces Stockfish container error payloads', async () => {
    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({
        message: 'engine overloaded'
      }, { status: 503 }))
    })).rejects.toThrow('Stockfish container failed with status 503: engine overloaded');

    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({
        error: 'bad fen'
      }, { status: 400 }))
    })).rejects.toThrow('Stockfish container failed with status 400: bad fen');

    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(async () => Response.json({}, { status: 500 }))
    })).rejects.toThrow('Stockfish container failed with status 500: unknown error');
  });

  it('normalizes non-Error container fetch failures', async () => {
    await expect(getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(() => Promise.reject('network down'))
    })).rejects.toThrow('Stockfish container failed.');
  });

  it('times out when the Stockfish container does not respond', async () => {
    vi.useFakeTimers();
    const promise = getStockfishBestMove('fen', {
      STOCKFISH_ENGINE: createNamespace(() => new Promise<Response>(() => undefined))
    });
    const expectation = expect(promise).rejects.toThrow('Timed out waiting for Stockfish container.');

    await vi.advanceTimersByTimeAsync(20_000);

    await expectation;
  });
});

function createNamespace(fetch: DurableObjectStub['fetch']): DurableObjectNamespace {
  return {
    get: () => ({ fetch }),
    idFromName: (name: string) => ({
      equals: (other: DurableObjectId) => other.toString() === name,
      toString: () => name
    })
  } as unknown as DurableObjectNamespace;
}
