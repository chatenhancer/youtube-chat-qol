import { afterEach, describe, expect, it, vi } from 'vitest';
import { handlePlaygroundRoute } from './router';
import type { Env } from './types';

describe('playground router', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handles static health routes and unknown routes', async () => {
    const health = await handlePlaygroundRoute(new Request('https://playground.example/health'), {} as Env);
    expect(health.applyCors).toBe(true);
    await expect(health.response.json()).resolves.toMatchObject({
      ok: true,
      service: 'chat-enhancer-playground'
    });

    const missing = await handlePlaygroundRoute(new Request('https://playground.example/missing'), {} as Env);
    expect(missing.response.status).toBe(404);
  });

  it('rejects malformed stream keys before route handlers run', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await handlePlaygroundRoute(
      new Request('https://playground.example/v1/streams/%2E%2E%2Fbad/snapshot'),
      {} as Env
    );

    expect(result.response.status).toBe(400);
    await expect(result.response.json()).resolves.toEqual({
      error: {
        code: 'invalid_stream',
        message: 'Stream key must be a YouTube-style video ID.'
      }
    });
    expect(console.warn).toHaveBeenCalledWith('[playground] invalid_stream_key', expect.objectContaining({
      endpoint: 'snapshot',
      errorMessage: 'Stream key must be a YouTube-style video ID.',
      errorType: 'ProtocolError',
      event: 'invalid_stream_key'
    }));
  });

  it('returns not found for known stream prefixes with unknown endpoints', async () => {
    const result = await handlePlaygroundRoute(
      new Request('https://playground.example/v1/streams/abc123/unknown'),
      {} as Env
    );

    expect(result.response.status).toBe(404);
  });
});
