import type { Env } from './types';

const DEFAULT_ALLOWED_ORIGIN_PREFIXES = [
  'chrome-extension://',
  'moz-extension://',
  'http://localhost:',
  'http://127.0.0.1:'
];

export function createJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');

  return new Response(`${JSON.stringify(body)}\n`, {
    ...init,
    headers
  });
}

export function createErrorResponse(code: string, message: string, status = 400): Response {
  return createJsonResponse({ error: { code, message } }, { status });
}

export function createOptionsResponse(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(request, env)
  });
}

export function createCorsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin') || '';
  if (isAllowedOrigin(origin, env)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

export function isAllowedOrigin(origin: string, env: Env): boolean {
  if (!origin) return true;

  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.includes(origin)) return true;
  return DEFAULT_ALLOWED_ORIGIN_PREFIXES.some((prefix) => origin.startsWith(prefix));
}

export function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
}
