/**
 * Cloudflare Worker entrypoint.
 *
 * This file owns the request trust boundary: CORS preflight, allowed-origin
 * checks, and applying CORS to normal HTTP responses. Route matching and game
 * feature handling live behind `router.ts` so this stays small.
 */
import { StreamRoom } from './durable-objects/stream-room';
import { StockfishContainer } from './containers/stockfish-container';
import {
  createCorsHeaders,
  createErrorResponse,
  createOptionsResponse,
  isAllowedOrigin,
} from './http';
import { hashLogValue, logPlaygroundEvent } from './logging';
import { handlePlaygroundRoute } from './router';
import type { Env } from './types';

export { StockfishContainer, StreamRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return createOptionsResponse(request, env);

    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin, env)) {
      logPlaygroundEvent('origin_rejected', {
        origin: origin ? hashLogValue(origin) : 'none'
      }, 'warn');
      return withCors(createErrorResponse('origin_not_allowed', 'This origin is not allowed.', 403), request, env);
    }

    const routeResponse = await handlePlaygroundRoute(request, env);
    if (!routeResponse.applyCors) return routeResponse.response;
    return withCors(routeResponse.response, request, env);
  }
};

function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  createCorsHeaders(request, env).forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}
