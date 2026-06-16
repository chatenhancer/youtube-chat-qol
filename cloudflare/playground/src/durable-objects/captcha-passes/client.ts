import { createErrorResponse } from '../../http';
import type { Env } from '../../types';
import type { CaptchaPassPurpose } from './captcha-passes';

const CAPTCHA_PASSES_OBJECT_NAME = 'global';
const CREATE_REPLAY_TRIVIA_CAPTCHA_PASS_URL =
  'https://captcha-passes.internal/internal/captcha/replay-trivia/create';
const CONSUME_REPLAY_TRIVIA_CAPTCHA_PASS_URL =
  'https://captcha-passes.internal/internal/captcha/replay-trivia/consume';
const REPLAY_TRIVIA_CAPTCHA_PURPOSE: CaptchaPassPurpose = 'replay-trivia-generation';

export interface ReplayTriviaCaptchaPassContext {
  gameId: string;
  requestId?: string;
  streamKey: string;
  userId: string;
}

export interface ReplayTriviaCaptchaPassCreateResult {
  captchaPass: string;
  expiresAt: number;
  ok: true;
  requestId?: string;
}

export async function createReplayTriviaCaptchaPass(
  env: Pick<Env, 'CAPTCHA_PASSES'>,
  input: ReplayTriviaCaptchaPassContext
): Promise<ReplayTriviaCaptchaPassCreateResult> {
  const response = await getCaptchaPassesObject(env).fetch(new Request(CREATE_REPLAY_TRIVIA_CAPTCHA_PASS_URL, {
    body: JSON.stringify({
      ...input,
      purpose: REPLAY_TRIVIA_CAPTCHA_PURPOSE
    }),
    headers: {
      'Content-Type': 'application/json'
    },
    method: 'POST'
  }));
  return readCreateResponse(response);
}

export async function consumeReplayTriviaCaptchaPass(
  env: Pick<Env, 'CAPTCHA_PASSES'>,
  input: ReplayTriviaCaptchaPassContext & { captchaPass: string }
): Promise<Response> {
  try {
    return await getCaptchaPassesObject(env).fetch(new Request(CONSUME_REPLAY_TRIVIA_CAPTCHA_PASS_URL, {
      body: JSON.stringify({
        ...input,
        purpose: REPLAY_TRIVIA_CAPTCHA_PURPOSE
      }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    }));
  } catch (error) {
    return createErrorResponse(
      'captcha_unavailable',
      error instanceof Error ? error.message : 'Replay Trivia verification is unavailable.',
      503
    );
  }
}

function getCaptchaPassesObject(env: Pick<Env, 'CAPTCHA_PASSES'>): { fetch: typeof fetch } {
  if (!env.CAPTCHA_PASSES) throw new Error('Captcha pass binding is not configured.');
  const id = env.CAPTCHA_PASSES.idFromName(CAPTCHA_PASSES_OBJECT_NAME);
  return env.CAPTCHA_PASSES.get(id);
}

async function readCreateResponse(response: Response): Promise<ReplayTriviaCaptchaPassCreateResult> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Captcha pass service returned ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(payload) || `Captcha pass service returned ${response.status}.`);
  }

  if (!isCreateResult(payload)) throw new Error('Captcha pass service response was invalid.');
  return payload;
}

function getErrorMessage(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== 'string') return '';
  return value.error.message;
}

function isCreateResult(value: unknown): value is ReplayTriviaCaptchaPassCreateResult {
  return isRecord(value) &&
    value.ok === true &&
    typeof value.captchaPass === 'string' &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) &&
    (value.requestId === undefined || typeof value.requestId === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
