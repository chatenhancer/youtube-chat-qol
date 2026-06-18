import {
  REPLAY_TRIVIA_CAPTCHA_PAGE_ROUTE,
  REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_SOURCE,
  REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_TYPE,
  REPLAY_TRIVIA_CAPTCHA_ROUTE
} from '../../../../../src/shared/playground-trivia';
import { createErrorResponse, createJsonResponse } from '../../http';
import { getLogErrorMessage, getLogErrorType, hashLogValue, logPlaygroundEvent } from '../../logging';
import { createRouteResult, type RouteContext, type RouteModule, type RouteResult } from '../../routes/types';
import type { Env } from '../../types';
import { createReplayTriviaCaptchaPass } from './client';
import turnstilePageHtml from './replay-trivia-captcha-page.html';

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ACTION = 'replay_trivia_generate';
const TURNSTILE_PAGE_CONFIG_PLACEHOLDER = '__YTCQ_TURNSTILE_CONFIG__';
const MAX_TURNSTILE_TOKEN_LENGTH = 2048;
const GAME_ID_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]{8,120}$/;
const STREAM_KEY_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

export const captchaPassesRouteModule = {
  staticRoutes: [
    {
      handle: handleReplayTriviaCaptchaPageRoute,
      path: REPLAY_TRIVIA_CAPTCHA_PAGE_ROUTE
    },
    {
      handle: handleReplayTriviaCaptchaRoute,
      path: REPLAY_TRIVIA_CAPTCHA_ROUTE
    }
  ]
} satisfies RouteModule;

async function handleReplayTriviaCaptchaPageRoute({ env, request }: RouteContext): Promise<RouteResult> {
  if (request.method !== 'GET') {
    return createRouteResult(createErrorResponse('method_not_allowed', 'Only GET is supported.', 405));
  }
  if (!env.TURNSTILE_SITE_KEY) {
    return createRouteResult(createErrorResponse('turnstile_not_configured', 'Replay Trivia verification is not configured.', 503));
  }

  const url = new URL(request.url);
  const query = {
    gameId: url.searchParams.get('gameId') || '',
    requestId: url.searchParams.get('requestId') || '',
    streamKey: url.searchParams.get('streamKey') || '',
    userId: url.searchParams.get('userId') || ''
  };

  return createRouteResult(new Response(createTurnstilePage({
    action: TURNSTILE_ACTION,
    captchaRoute: REPLAY_TRIVIA_CAPTCHA_ROUTE,
    messageSource: REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_SOURCE,
    messageType: REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_TYPE,
    siteKey: env.TURNSTILE_SITE_KEY,
    ...query
  }), {
    headers: {
      'Content-Security-Policy': [
        "default-src 'none'",
        "connect-src 'self'",
        "frame-src https://challenges.cloudflare.com",
        "script-src 'self' https://challenges.cloudflare.com 'unsafe-inline'",
        "style-src 'unsafe-inline'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'"
      ].join('; '),
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    }
  }), false);
}

async function handleReplayTriviaCaptchaRoute({ env, request }: RouteContext): Promise<RouteResult> {
  if (request.method !== 'POST') {
    return createRouteResult(createErrorResponse('method_not_allowed', 'Only POST is supported.', 405));
  }

  if (!env.TURNSTILE_SECRET_KEY) {
    return createRouteResult(createErrorResponse('turnstile_not_configured', 'Replay Trivia verification is not configured.', 503));
  }

  const payload = await readJsonRequest(request);
  if (payload instanceof Response) return createRouteResult(payload);

  const parsed = parseCaptchaRequest(payload);
  if (parsed instanceof Response) return createRouteResult(parsed);

  try {
    const turnstile = await verifyTurnstileToken(env, parsed.turnstileToken, {
      remoteIp: request.headers.get('CF-Connecting-IP') || '',
      requestId: parsed.requestId
    });
    if (turnstile instanceof Response) return createRouteResult(turnstile);

    const pass = await createReplayTriviaCaptchaPass(env, {
      gameId: parsed.gameId,
      requestId: parsed.requestId,
      streamKey: parsed.streamKey,
      userId: parsed.userId
    });
    logPlaygroundEvent('replay_trivia_captcha_pass_created', {
      game: hashLogValue(parsed.gameId),
      request: parsed.requestId ? hashLogValue(parsed.requestId) : undefined,
      room: hashLogValue(parsed.streamKey),
      user: hashLogValue(parsed.userId)
    });
    return createRouteResult(createJsonResponse(pass));
  } catch (error) {
    logPlaygroundEvent('replay_trivia_captcha_failed', {
      errorMessage: getLogErrorMessage(error),
      errorType: getLogErrorType(error),
      game: hashLogValue(parsed.gameId),
      room: hashLogValue(parsed.streamKey),
      user: hashLogValue(parsed.userId)
    }, 'error');
    return createRouteResult(createErrorResponse(
      'captcha_unavailable',
      'Replay Trivia verification is unavailable.',
      503
    ));
  }
}

interface CaptchaRequestPayload {
  gameId: string;
  requestId?: string;
  streamKey: string;
  turnstileToken: string;
  userId: string;
}

interface TurnstileVerifyOptions {
  remoteIp: string;
  requestId?: string;
}

interface TurnstileVerifyResponse {
  action?: string;
  'error-codes'?: string[];
  hostname?: string;
  success?: boolean;
}

async function readJsonRequest(request: Request): Promise<Record<string, unknown> | Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return createErrorResponse('invalid_json', 'Request body must be valid JSON.', 400);
  }

  if (!isRecord(payload)) {
    return createErrorResponse('invalid_request', 'Request body must be an object.', 400);
  }
  return payload;
}

function parseCaptchaRequest(value: Record<string, unknown>): CaptchaRequestPayload | Response {
  const streamKey = getString(value.streamKey);
  const gameId = getString(value.gameId);
  const userId = getString(value.userId);
  const requestId = getString(value.requestId);
  const turnstileToken = getString(value.turnstileToken);

  if (!STREAM_KEY_PATTERN.test(streamKey) ||
    !GAME_ID_PATTERN.test(gameId) ||
    !USER_ID_PATTERN.test(userId) ||
    (requestId && !REQUEST_ID_PATTERN.test(requestId))) {
    return createErrorResponse('invalid_request', 'Replay Trivia verification request is invalid.', 400);
  }

  if (!turnstileToken || turnstileToken.length > MAX_TURNSTILE_TOKEN_LENGTH) {
    return createErrorResponse('invalid_turnstile_token', 'Turnstile token is invalid.', 400);
  }

  return {
    gameId,
    requestId: requestId || undefined,
    streamKey,
    turnstileToken,
    userId
  };
}

async function verifyTurnstileToken(
  env: Pick<Env, 'TURNSTILE_EXPECTED_HOSTNAME' | 'TURNSTILE_SECRET_KEY'>,
  turnstileToken: string,
  options: TurnstileVerifyOptions
): Promise<true | Response> {
  const body = new URLSearchParams({
    response: turnstileToken,
    secret: env.TURNSTILE_SECRET_KEY || ''
  });
  if (options.remoteIp) body.set('remoteip', options.remoteIp);
  if (options.requestId) body.set('idempotency_key', options.requestId);

  const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
    body,
    method: 'POST'
  });
  if (!response.ok) {
    return createErrorResponse('captcha_unavailable', 'Replay Trivia verification is unavailable.', 503);
  }

  const result = await response.json() as TurnstileVerifyResponse;
  if (!result.success) {
    logPlaygroundEvent('turnstile_rejected', {
      errors: Array.isArray(result['error-codes']) ? result['error-codes'].join(',') : undefined
    }, 'warn');
    return createErrorResponse('captcha_failed', 'Complete the verification to generate Replay Trivia.', 403);
  }

  if (result.action !== TURNSTILE_ACTION) {
    logPlaygroundEvent('turnstile_action_rejected', {
      action: result.action || ''
    }, 'warn');
    return createErrorResponse('captcha_failed', 'Complete the verification to generate Replay Trivia.', 403);
  }

  const expectedHostname = (env.TURNSTILE_EXPECTED_HOSTNAME || '').trim();
  if (expectedHostname && result.hostname !== expectedHostname) {
    logPlaygroundEvent('turnstile_hostname_rejected', {
      hostname: result.hostname || ''
    }, 'warn');
    return createErrorResponse('captcha_failed', 'Complete the verification to generate Replay Trivia.', 403);
  }

  return true;
}

function createTurnstilePage(config: Record<string, string>): string {
  const serializedConfig = JSON.stringify(config).replace(/</g, '\\u003c');
  return turnstilePageHtml.replace(TURNSTILE_PAGE_CONFIG_PLACEHOLDER, serializedConfig);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
