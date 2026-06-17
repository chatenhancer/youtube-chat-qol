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

const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_ACTION = 'replay_trivia_generate';
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
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Replay Trivia verification</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      align-items: center;
      background: Canvas;
      color: CanvasText;
      display: flex;
      justify-content: center;
      margin: 0;
      min-height: 100vh;
    }
    main {
      display: grid;
      gap: 14px;
      justify-items: center;
      padding: 24px;
      text-align: center;
    }
    .brand {
      align-items: center;
      display: grid;
      gap: 8px;
      justify-items: center;
    }
    .brand svg {
      display: block;
      height: 50px;
      width: 60px;
    }
    .brand span {
      font-size: 13px;
      font-weight: 650;
      letter-spacing: 0;
    }
    h1 {
      font-size: 20px;
      font-weight: 650;
      line-height: 1.25;
      margin: 0;
    }
    p {
      color: color-mix(in srgb, CanvasText 72%, transparent);
      font-size: 14px;
      line-height: 1.45;
      margin: 0;
      max-width: 32ch;
    }
    #turnstile-widget {
      min-height: 65px;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand" aria-label="Chat Enhancer for YouTube">
      <svg width="60" height="50" viewBox="0 0 60 50" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <path d="M0 24.6622C0 4.35287 4.35287 0 24.6622 0H34.527C54.8363 0 59.1892 4.35287 59.1892 24.6622C59.1892 44.9715 54.8363 49.3243 34.527 49.3243H24.6622C4.35287 49.3243 0 44.9715 0 24.6622Z" fill="url(#paint0_linear_39_813)"/>
        <g filter="url(#filter0_d_39_813)">
          <path d="M40.2454 18.4114C42.1615 18.733 43.9292 19.6468 45.2991 21.0247C48.0348 24.1959 48.0348 32.2988 45.2991 35.47C44.8198 35.9902 44.2611 36.4312 43.6438 36.7766L43.3469 38.6233C43.2679 39.086 43.0748 39.5221 42.7844 39.8909C42.4941 40.2596 42.116 40.5503 41.6848 40.7356C41.2537 40.9208 40.7829 40.9945 40.3157 40.9514C39.8484 40.9083 39.399 40.7495 39.009 40.4885L36.0989 38.554C36.0327 38.5074 35.9532 38.4834 35.8723 38.4846C31.795 38.4671 28.3794 37.3344 26.759 35.47C26.5223 35.1881 26.3125 34.8846 26.1321 34.5637C31.272 34.4593 35.4537 32.9781 37.5969 30.4866C39.9145 27.8033 40.803 22.8197 40.2454 18.4114ZM25.5745 9.20728C30.3934 9.20728 34.3971 10.5092 36.2825 12.6907C39.444 16.3474 39.444 25.6864 36.2825 29.344C34.4294 31.4871 30.4922 32.785 25.7483 32.8157C25.5914 32.8135 25.437 32.8564 25.304 32.9397L21.8684 35.2297C21.4515 35.5083 20.9713 35.6778 20.4719 35.7229C19.9727 35.768 19.47 35.6878 19.01 35.4885C18.5501 35.2893 18.1477 34.9773 17.8391 34.5823C17.5305 34.1871 17.3254 33.7205 17.2434 33.2258L16.8586 30.9133C16.1097 30.5098 15.4366 29.9792 14.8684 29.3459C11.7051 25.6867 11.7049 16.3473 14.8665 12.6897C16.7518 10.5091 20.7556 9.20728 25.5745 9.20728ZM23.5793 17.595C23.0941 17.3548 22.5247 17.7078 22.5247 18.2493V24.9514C22.5247 25.4929 23.0941 25.8459 23.5793 25.6057L30.3508 22.2551C30.8924 21.987 30.8924 21.2137 30.3508 20.9456L23.5793 17.595Z" fill="white"/>
        </g>
        <defs>
          <filter id="filter0_d_39_813" x="10.0917" y="8.00534" width="39.6632" height="36.5638" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
            <feFlood flood-opacity="0" result="BackgroundImageFix"/>
            <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
            <feOffset dy="1.20194"/>
            <feGaussianBlur stdDeviation="1.20194"/>
            <feComposite in2="hardAlpha" operator="out"/>
            <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"/>
            <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_39_813"/>
            <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_39_813" result="shape"/>
          </filter>
          <linearGradient id="paint0_linear_39_813" x1="39.3179" y1="50.6269" x2="30.7317" y2="0.271356" gradientUnits="userSpaceOnUse">
            <stop stop-color="#FD0032"/>
            <stop offset="1" stop-color="#FE0031"/>
          </linearGradient>
        </defs>
      </svg>
      <span>Chat Enhancer</span>
    </div>
    <h1>Verify before playing</h1>
    <p id="status">One quick security check before Replay Trivia begins.</p>
    <div id="turnstile-widget"></div>
    <p>This window closes automatically when verification finishes.</p>
  </main>
  <script>
    const config = ${serializedConfig};
    const status = document.getElementById('status');
    let widgetRendered = false;

    function postResult(payload) {
      if (window.opener) {
        window.opener.postMessage({
          requestId: config.requestId,
          source: config.messageSource,
          type: config.messageType,
          ...payload
        }, '*');
      }
    }

    async function submitToken(turnstileToken) {
      status.textContent = 'Finishing verification...';
      try {
        const response = await fetch(config.captchaRoute, {
          body: JSON.stringify({
            gameId: config.gameId,
            requestId: config.requestId,
            streamKey: config.streamKey,
            turnstileToken,
            userId: config.userId
          }),
          headers: {
            'Content-Type': 'application/json'
          },
          method: 'POST'
        });
        const body = await response.json();
        if (!response.ok || !body || body.ok !== true || typeof body.captchaPass !== 'string') {
          const message = body && body.error && typeof body.error.message === 'string'
            ? body.error.message
            : 'Verification failed.';
          postResult({ error: message });
          status.textContent = message;
          return;
        }
        postResult({
          captchaPass: body.captchaPass,
          expiresAt: body.expiresAt
        });
        window.close();
      } catch {
        const message = 'Verification failed. Try again.';
        postResult({ error: message });
        status.textContent = message;
      }
    }

    function renderTurnstile() {
      if (widgetRendered) return;
      if (!config.streamKey || !config.gameId || !config.userId || !config.requestId) {
        status.textContent = 'Verification details are missing.';
        postResult({ error: 'Verification details are missing.' });
        return;
      }
      const turnstileApi = window.turnstile;
      if (!turnstileApi || typeof turnstileApi.render !== 'function') {
        const message = 'Verification could not load. Try again.';
        status.textContent = message;
        postResult({ error: message });
        return;
      }
      widgetRendered = true;
      turnstileApi.render('#turnstile-widget', {
        action: config.action,
        callback: submitToken,
        sitekey: config.siteKey
      });
    }

    window.onloadTurnstileCallback = renderTurnstile;
  </script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback" async defer></script>
</body>
</html>`;
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
