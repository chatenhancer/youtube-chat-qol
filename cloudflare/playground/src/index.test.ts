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
    expect(console.warn).toHaveBeenCalledWith('[Chat Enhancer Playground]', expect.objectContaining({
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
});

function createEnv(fetchRoom: DurableObjectStub['fetch'] = async () => new Response('{}')): Env {
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
    STREAM_ROOMS: namespace
  };
}
