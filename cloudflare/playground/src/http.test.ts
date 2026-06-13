import { describe, expect, it } from 'vitest';
import {
  createCorsHeaders,
  createErrorResponse,
  createJsonResponse,
  createOptionsResponse,
  isAllowedOrigin,
  isWebSocketUpgrade
} from './http';
import type { Env } from './types';

describe('playground HTTP helpers', () => {
  const env = {
    ALLOWED_ORIGIN_PATTERNS: 'https://chatenhancer.com, chrome-extension://, moz-extension://, http://localhost:, http://127.0.0.1:'
  } as Env;

  it('allows configured exact origins and prefix patterns', () => {
    expect(isAllowedOrigin('https://chatenhancer.com', env)).toBe(true);
    expect(isAllowedOrigin('chrome-extension://abc', env)).toBe(true);
    expect(isAllowedOrigin('moz-extension://generated-id', env)).toBe(true);
    expect(isAllowedOrigin('http://localhost:8787', env)).toBe(true);
    expect(isAllowedOrigin('https://example.com', env)).toBe(false);
  });

  it('does not allow extension origins unless the pattern is configured', () => {
    const strictEnv = {
      ALLOWED_ORIGIN_PATTERNS: 'https://chatenhancer.com'
    } as Env;

    expect(isAllowedOrigin('chrome-extension://abc', strictEnv)).toBe(false);
    expect(isAllowedOrigin('moz-extension://generated-id', strictEnv)).toBe(false);
  });

  it('creates CORS headers only for allowed origins', () => {
    const allowedHeaders = createCorsHeaders(new Request('https://playground.chatenhancer.com/health', {
      headers: {
        Origin: 'https://chatenhancer.com'
      }
    }), env);

    expect(allowedHeaders.get('Access-Control-Allow-Origin')).toBe('https://chatenhancer.com');
    expect(allowedHeaders.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');

    const deniedHeaders = createCorsHeaders(new Request('https://playground.chatenhancer.com/health', {
      headers: {
        Origin: 'https://example.com'
      }
    }), env);

    expect(deniedHeaders.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('creates JSON, error, and preflight responses', async () => {
    const json = createJsonResponse({ ok: true });
    expect(json.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(await json.json()).toEqual({ ok: true });

    const error = createErrorResponse('bad_request', 'Bad request.', 400);
    expect(error.status).toBe(400);
    expect(await error.json()).toEqual({
      error: {
        code: 'bad_request',
        message: 'Bad request.'
      }
    });

    const options = createOptionsResponse(new Request('https://playground.chatenhancer.com/health', {
      headers: {
        Origin: 'https://chatenhancer.com'
      },
      method: 'OPTIONS'
    }), env);
    expect(options.status).toBe(204);
    expect(options.headers.get('Access-Control-Allow-Origin')).toBe('https://chatenhancer.com');
  });

  it('detects WebSocket upgrade requests case-insensitively', () => {
    expect(isWebSocketUpgrade(new Request('https://playground.chatenhancer.com/socket', {
      headers: {
        Upgrade: 'WebSocket'
      }
    }))).toBe(true);
    expect(isWebSocketUpgrade(new Request('https://playground.chatenhancer.com/socket'))).toBe(false);
  });
});
