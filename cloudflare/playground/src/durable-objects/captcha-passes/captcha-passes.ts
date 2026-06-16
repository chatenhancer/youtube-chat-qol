import { createErrorResponse, createJsonResponse } from '../../http';
import { encodeBase64Url } from '../../protocol/identity';

const CAPTCHA_PASS_KEY_PREFIX = 'captchaPass:';
const CAPTCHA_PASS_KEY_VERSION = ':v1';
const CAPTCHA_PASS_TTL_MS = 10 * 60 * 1000;
const CLEANUP_DELAY_MS = CAPTCHA_PASS_TTL_MS + 60_000;
const GAME_ID_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;
const STREAM_KEY_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;
const USER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const SUPPORTED_CAPTCHA_PASS_PURPOSES = ['replay-trivia-generation'] as const;

export type CaptchaPassPurpose = typeof SUPPORTED_CAPTCHA_PASS_PURPOSES[number];

export interface CaptchaPassRecord {
  expiresAt: number;
  gameId: string;
  purpose: CaptchaPassPurpose;
  requestId?: string;
  streamKey: string;
  userId: string;
}

export class CaptchaPasses {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/internal/captcha/replay-trivia/create') {
      return this.handleCreate(request);
    }
    if (url.pathname === '/internal/captcha/replay-trivia/consume') {
      return this.handleConsume(request);
    }

    return createErrorResponse('not_found', 'Not found.', 404);
  }

  async alarm(): Promise<void> {
    await this.cleanupExpiredPasses(Date.now());
  }

  private async handleCreate(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return createErrorResponse('method_not_allowed', 'Only POST is supported.', 405);
    }

    const payload = await readJsonRequest(request);
    if (payload instanceof Response) return payload;

    const input = parsePassContext(payload);
    if (!input) {
      return createErrorResponse('invalid_request', 'purpose, streamKey, gameId, and userId are required.', 400);
    }

    const captchaPass = createCaptchaPass();
    const expiresAt = Date.now() + CAPTCHA_PASS_TTL_MS;
    const record: CaptchaPassRecord = {
      expiresAt,
      gameId: input.gameId,
      purpose: input.purpose,
      requestId: input.requestId,
      streamKey: input.streamKey,
      userId: input.userId
    };
    await this.state.storage.put(getCaptchaPassKey(captchaPass), record);
    await this.scheduleCleanup(expiresAt + 1_000);

    return createJsonResponse({
      captchaPass,
      expiresAt,
      ok: true,
      requestId: input.requestId
    });
  }

  private async handleConsume(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return createErrorResponse('method_not_allowed', 'Only POST is supported.', 405);
    }

    const payload = await readJsonRequest(request);
    if (payload instanceof Response) return payload;

    const captchaPass = typeof payload.captchaPass === 'string' ? payload.captchaPass.trim() : '';
    const input = parsePassContext(payload);
    if (!captchaPass || !input) {
      return createErrorResponse('invalid_captcha_pass', 'Replay Trivia verification is invalid or expired.', 403);
    }

    const key = getCaptchaPassKey(captchaPass);
    const record = await this.state.storage.get<CaptchaPassRecord>(key);
    await this.state.storage.delete(key);
    if (!isMatchingPass(record, input, Date.now())) {
      return createErrorResponse('invalid_captcha_pass', 'Replay Trivia verification is invalid or expired.', 403);
    }

    return createJsonResponse({
      ok: true
    });
  }

  private async cleanupExpiredPasses(now: number): Promise<void> {
    const passes = await this.state.storage.list<CaptchaPassRecord>({
      prefix: CAPTCHA_PASS_KEY_PREFIX
    });
    let nextExpiresAt = 0;
    const deletes: string[] = [];

    passes.forEach((record, key) => {
      if (!isRecord(record) || typeof record.expiresAt !== 'number' || record.expiresAt <= now) {
        deletes.push(key);
        return;
      }
      nextExpiresAt = nextExpiresAt ? Math.min(nextExpiresAt, record.expiresAt) : record.expiresAt;
    });

    if (deletes.length) await this.state.storage.delete(deletes);
    if (nextExpiresAt) await this.scheduleCleanup(nextExpiresAt + 1_000);
  }

  private async scheduleCleanup(timestamp: number): Promise<void> {
    const currentAlarm = await this.state.storage.getAlarm();
    if (currentAlarm && currentAlarm <= timestamp) return;
    await this.state.storage.setAlarm(timestamp || Date.now() + CLEANUP_DELAY_MS);
  }
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

function parsePassContext(value: Record<string, unknown>): CaptchaPassRecord | null {
  const streamKey = typeof value.streamKey === 'string' ? value.streamKey.trim() : '';
  const gameId = typeof value.gameId === 'string' ? value.gameId.trim() : '';
  const purpose = parseCaptchaPassPurpose(value.purpose);
  const userId = typeof value.userId === 'string' ? value.userId.trim() : '';
  const requestId = typeof value.requestId === 'string' && value.requestId.trim()
    ? value.requestId.trim()
    : undefined;

  if (!purpose || !STREAM_KEY_PATTERN.test(streamKey) || !GAME_ID_PATTERN.test(gameId) || !USER_ID_PATTERN.test(userId)) {
    return null;
  }

  return {
    expiresAt: 0,
    gameId,
    purpose,
    requestId,
    streamKey,
    userId
  };
}

function createCaptchaPass(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `cap_${encodeBase64Url(bytes)}`;
}

function getCaptchaPassKey(captchaPass: string): string {
  return `${CAPTCHA_PASS_KEY_PREFIX}${captchaPass}${CAPTCHA_PASS_KEY_VERSION}`;
}

function isMatchingPass(
  record: CaptchaPassRecord | undefined,
  input: CaptchaPassRecord,
  now: number
): boolean {
  return Boolean(record) &&
    record!.expiresAt > now &&
    record!.gameId === input.gameId &&
    record!.purpose === input.purpose &&
    record!.streamKey === input.streamKey &&
    record!.userId === input.userId;
}

function parseCaptchaPassPurpose(value: unknown): CaptchaPassPurpose | '' {
  return typeof value === 'string' && SUPPORTED_CAPTCHA_PASS_PURPOSES.includes(value as CaptchaPassPurpose)
    ? value as CaptchaPassPurpose
    : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
