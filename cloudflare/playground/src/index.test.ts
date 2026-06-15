import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { DurableObjectId, DurableObjectNamespace, DurableObjectStub, Env } from './types';

describe('playground worker routes', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns health status with CORS headers', async () => {
    const response = await worker.fetch(new Request('https://playground.chatenhancer.com/health', {
      headers: {
        Origin: 'https://chatenhancer.com'
      }
    }), createEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://chatenhancer.com');
    expect(await response.json()).toEqual({
      ok: true,
      service: 'chat-enhancer-playground'
    });
  });

  it('rejects disallowed origins before routing', async () => {
    const response = await worker.fetch(new Request('https://playground.chatenhancer.com/health', {
      headers: {
        Origin: 'https://example.com'
      }
    }), createEnv());

    expect(response.status).toBe(403);
    expect(console.warn).toHaveBeenCalledWith('[Chat Enhancer Playground] origin_rejected', expect.objectContaining({
      event: 'origin_rejected',
      origin: expect.stringMatching(/^h_[a-z0-9]+$/),
      service: 'chat-enhancer-playground'
    }));
    expect(await response.json()).toEqual({
      error: {
        code: 'origin_not_allowed',
        message: 'This origin is not allowed.'
      }
    });
  });

  it('forwards snapshot requests to the stream Durable Object with the sanitized stream key', async () => {
    let forwardedRequest: Request | undefined;
    const env = createEnv(async (request) => {
      forwardedRequest = request instanceof Request ? request : new Request(request);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });

    const response = await worker.fetch(new Request('https://playground.chatenhancer.com/v1/streams/abc_123-Z/snapshot', {
      headers: {
        Origin: 'chrome-extension://abc'
      }
    }), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(forwardedRequest?.headers.get('X-Chat-Enhancer-Stream-Key')).toBe('abc_123-Z');
    expect(console.info).toHaveBeenCalledWith(
      '[Chat Enhancer Playground] room_fetch_succeeded',
      expect.objectContaining({
        endpoint: 'snapshot',
        event: 'room_fetch_succeeded',
        status: 200
      })
    );
  });

  it('rejects invalid stream keys and missing WebSocket upgrades', async () => {
    const env = createEnv();

    const invalidStream = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/../snapshot'
    ), env);
    expect(invalidStream.status).toBe(404);

    const missingUpgrade = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/abc123/socket'
    ), env);
    expect(missingUpgrade.status).toBe(426);
    expect(await missingUpgrade.json()).toEqual({
      error: {
        code: 'websocket_required',
        message: 'Expected WebSocket upgrade.'
      }
    });
  });

  it('handles preflight requests', async () => {
    const response = await worker.fetch(new Request('https://playground.chatenhancer.com/v1/streams/abc123/socket', {
      headers: {
        Origin: 'https://chatenhancer.com'
      },
      method: 'OPTIONS'
    }), createEnv());

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://chatenhancer.com');
  });

  it('generates Replay Trivia questions through OpenAI with CORS headers', async () => {
    let tokenConsumeRequest: Request | undefined;
    const openAIFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('gpt-test');
      expect(body.text.format.type).toBe('json_schema');
      expect(body.text.format.name).toBe('replay_trivia_questions');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-key');

      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          questions: [
            {
              choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
              correctChoiceIndex: 0,
              difficulty: 'easy',
              explanation: 'The transcript says the Game of the Year goes to God of War.',
              friendIntro: 'chat emergency, awards memory check',
              prompt: 'which game won game of the year in this segment?',
              rightReply: 'wow, you actually remembered. thank you.',
              sourceEndSeconds: 13680,
              sourceStartSeconds: 13670,
              wrongReply: 'you missed it. it was God of War.'
            }
          ]
        })
      }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });
    vi.stubGlobal('fetch', openAIFetch);

    const response = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify({
          endSeconds: 13690,
          gameId: 'game-replay-trivia',
          generationToken: 'rtg_1234567890abcdef',
          languageCode: 'en',
          questionCount: 1,
          segments: [
            {
              durationSeconds: 4,
              startSeconds: 13670,
              text: 'The Game Award Game of the Year goes to God of War.'
            }
          ],
          startSeconds: 13660,
          videoId: 'SHt3FyE-VIQ'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv(async (request) => {
      tokenConsumeRequest = request instanceof Request ? request : new Request(request);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }, {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-test'
    }));

    expect(response.status).toBe(200);
    expect(tokenConsumeRequest?.url).toBe('https://stream-room.internal/internal/replay-trivia/generation-token/consume');
    expect(tokenConsumeRequest?.headers.get('X-Chat-Enhancer-Stream-Key')).toBe('SHt3FyE-VIQ');
    expect(await tokenConsumeRequest?.json()).toEqual({
      gameId: 'game-replay-trivia',
      generationToken: 'rtg_1234567890abcdef'
    });
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('chrome-extension://abc');
    expect(await response.json()).toEqual({
      generatedAt: expect.any(String),
      languageCode: 'en',
      model: 'gpt-test',
      questions: [
        {
          choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
          correctChoiceIndex: 0,
          difficulty: 'easy',
          explanation: 'The transcript says the Game of the Year goes to God of War.',
          friendIntro: 'chat emergency, awards memory check',
          id: 'q_1',
          prompt: 'which game won game of the year in this segment?',
          rightReply: 'wow, you actually remembered. thank you.',
          sourceEndSeconds: 13680,
          sourceStartSeconds: 13670,
          wrongReply: 'you missed it. it was God of War.'
        }
      ],
      transcriptWindow: {
        endSeconds: 13690,
        segmentCount: 1,
        startSeconds: 13660,
        videoId: 'SHt3FyE-VIQ'
      }
    });
  });

  it('logs rejected Replay Trivia request body sizes', async () => {
    const response = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: '{}',
        headers: {
          'Content-Length': '1000001',
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv());

    expect(response.status).toBe(413);
    expect(console.warn).toHaveBeenCalledWith('[Chat Enhancer Playground] replay_trivia_request_too_large', expect.objectContaining({
      bytes: 1000001,
      event: 'replay_trivia_request_too_large',
      maxBytes: 1000000,
      room: expect.stringMatching(/^h_[a-z0-9]+$/),
      service: 'chat-enhancer-playground'
    }));
    expect(await response.json()).toEqual({
      error: {
        code: 'request_too_large',
        message: 'Request body must be 1000000 bytes or less.'
      }
    });
  });

  it('logs rejected Replay Trivia transcript text sizes', async () => {
    const response = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify({
          endSeconds: 1000,
          gameId: 'game-replay-trivia',
          generationToken: 'rtg_1234567890abcdef',
          segments: Array.from({ length: 801 }, (_value, index) => ({
            startSeconds: index,
            text: 'x'.repeat(500)
          })),
          startSeconds: 0,
          videoId: 'SHt3FyE-VIQ'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv(undefined, {
      OPENAI_API_KEY: 'test-key'
    }));

    expect(response.status).toBe(413);
    expect(console.warn).toHaveBeenCalledWith('[Chat Enhancer Playground] replay_trivia_failed', expect.objectContaining({
      chars: 400500,
      code: 'transcript_too_large',
      event: 'replay_trivia_failed',
      maxChars: 400000,
      room: expect.stringMatching(/^h_[a-z0-9]+$/),
      service: 'chat-enhancer-playground',
      status: 413
    }));
    expect(await response.json()).toEqual({
      error: {
        code: 'transcript_too_large',
        message: 'Transcript text must be 400000 characters or less.'
      }
    });
  });

  it('rejects Replay Trivia requests when OpenAI is not configured or the payload is invalid', async () => {
    const missingKey = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify({
          endSeconds: 30,
          gameId: 'game-replay-trivia',
          generationToken: 'rtg_1234567890abcdef',
          segments: [{ startSeconds: 1, text: 'hello' }],
          startSeconds: 0,
          videoId: 'SHt3FyE-VIQ'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv());

    expect(missingKey.status).toBe(503);
    expect(await missingKey.json()).toEqual({
      error: {
        code: 'openai_not_configured',
        message: 'Replay Trivia question generation is not configured.'
      }
    });

    const invalidPayload = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify({
          endSeconds: 30,
          gameId: 'game-replay-trivia',
          generationToken: 'rtg_1234567890abcdef',
          segments: [],
          startSeconds: 0,
          videoId: 'SHt3FyE-VIQ'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv(undefined, {
      OPENAI_API_KEY: 'test-key'
    }));

    expect(invalidPayload.status).toBe(400);
    expect(await invalidPayload.json()).toEqual({
      error: {
        code: 'missing_segments',
        message: 'At least one transcript segment is required.'
      }
    });
  });

  it('returns a provider error when OpenAI cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));

    const response = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify({
          endSeconds: 30,
          gameId: 'game-replay-trivia',
          generationToken: 'rtg_1234567890abcdef',
          segments: [{ startSeconds: 1, text: 'hello' }],
          startSeconds: 0,
          videoId: 'SHt3FyE-VIQ'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv(undefined, {
      OPENAI_API_KEY: 'test-key'
    }));

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: {
        code: 'openai_unreachable',
        message: 'Replay Trivia could not reach OpenAI from the Playground backend.'
      }
    });
  });

  it('rejects Replay Trivia requests without a room generation token', async () => {
    const openAIFetch = vi.fn();
    vi.stubGlobal('fetch', openAIFetch);

    const response = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify({
          endSeconds: 30,
          languageCode: 'en',
          questionCount: 1,
          segments: [{ startSeconds: 1, text: 'hello' }],
          startSeconds: 0,
          videoId: 'SHt3FyE-VIQ'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv(undefined, {
      OPENAI_API_KEY: 'test-key'
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: 'invalid_field',
        message: 'gameId must be a non-empty string.'
      }
    });
    expect(openAIFetch).not.toHaveBeenCalled();
  });

  it('rejects Replay Trivia requests when the room denies the generation token', async () => {
    const openAIFetch = vi.fn();
    vi.stubGlobal('fetch', openAIFetch);

    const response = await worker.fetch(new Request(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify({
          endSeconds: 30,
          gameId: 'game-replay-trivia',
          generationToken: 'rtg_1234567890abcdef',
          languageCode: 'en',
          questionCount: 1,
          segments: [{ startSeconds: 1, text: 'hello' }],
          startSeconds: 0,
          videoId: 'SHt3FyE-VIQ'
        }),
        headers: {
          'Content-Type': 'application/json',
          Origin: 'chrome-extension://abc'
        },
        method: 'POST'
      }
    ), createEnv(async () => new Response(JSON.stringify({
      error: {
        code: 'invalid_generation_token',
        message: 'Replay Trivia generation token is invalid or expired.'
      }
    }), {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 403
    }), {
      OPENAI_API_KEY: 'test-key'
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: 'invalid_generation_token',
        message: 'Replay Trivia generation token is invalid or expired.'
      }
    });
    expect(openAIFetch).not.toHaveBeenCalled();
  });
});

function createEnv(
  fetchRoom: DurableObjectStub['fetch'] = async () => new Response('{}'),
  overrides: Partial<Env> = {}
): Env {
  const id: DurableObjectId = {
    toString: () => 'stream-id'
  };

  const namespace: DurableObjectNamespace = {
    get: () => ({
      fetch: fetchRoom
    }),
    idFromName: () => id
  };

  return {
    ALLOWED_ORIGIN_PATTERNS: 'https://chatenhancer.com,chrome-extension://',
    STREAM_ROOMS: namespace,
    ...overrides
  };
}
