import {
  REPLAY_TRIVIA_CAPTCHA_PAGE_ROUTE,
  REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_SOURCE,
  REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_TYPE,
  REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE,
  type ReplayTriviaQuestionsBackgroundResponse,
  type ReplayTriviaQuestionsRequest,
  type ReplayTriviaQuestionsResponse
} from '../../../../shared/playground-trivia';
import { PLAYGROUND_BACKEND_ORIGIN } from '../../../../shared/playground-protocol';
import { getCurrentYouTubeChatStreamKey } from '../../../../youtube/source-url';
import { fetchReplayTriviaTranscriptWindow, type FetchReplayTriviaTranscriptOptions } from './transcript';

const MALFORMED_QUESTIONS_ERROR = 'Replay Trivia question generation returned an incomplete question pack.';
const CAPTCHA_WINDOW_POLL_MS = 500;
const CAPTCHA_WINDOW_TIMEOUT_MS = 5 * 60 * 1000;

export interface GenerateReplayTriviaOptions extends FetchReplayTriviaTranscriptOptions {
  gameId?: string;
  generationToken?: string;
  locale?: string;
  questionCount?: number;
  streamKey?: string;
  userId?: string;
}

export async function generateReplayTriviaQuestions(
  options: GenerateReplayTriviaOptions = {}
): Promise<ReplayTriviaQuestionsResponse> {
  const streamKey = normalizeStreamKey(options.streamKey || getCurrentYouTubeChatStreamKey());
  if (!streamKey) throw new Error('A YouTube stream key is required for Replay Trivia.');
  const gameId = normalizeGameId(options.gameId || '');
  const generationToken = normalizeGenerationToken(options.generationToken || '');
  if (!gameId || !generationToken) throw new Error('Replay Trivia generation authorization is required.');
  const userId = normalizeUserId(options.userId || '');
  if (!userId) throw new Error('Replay Trivia player identity is required.');

  const transcriptWindow = await fetchReplayTriviaTranscriptWindow({
    endSeconds: options.endSeconds,
    languageCodes: options.languageCodes,
    startSeconds: options.startSeconds,
    videoId: options.videoId
  });
  const captchaPass = await requestReplayTriviaCaptchaPass({
    gameId,
    streamKey,
    userId
  });

  return requestReplayTriviaQuestions(streamKey, {
    ...transcriptWindow,
    captchaPass,
    gameId,
    generationToken,
    locale: options.locale,
    questionCount: options.questionCount
  });
}

export function requestReplayTriviaCaptchaPass(input: {
  gameId: string;
  streamKey: string;
  userId: string;
}): Promise<string> {
  const requestId = createCaptchaRequestId();
  const url = new URL(REPLAY_TRIVIA_CAPTCHA_PAGE_ROUTE, PLAYGROUND_BACKEND_ORIGIN);
  url.searchParams.set('gameId', input.gameId);
  url.searchParams.set('requestId', requestId);
  url.searchParams.set('streamKey', input.streamKey);
  url.searchParams.set('userId', input.userId);

  return new Promise((resolve, reject) => {
    const popup = window.open(url.toString(), 'ytcq-replay-trivia-verify', 'popup,width=420,height=560');
    if (!popup) {
      reject(new Error('Verification window was blocked. Allow popups for this stream and try again.'));
      return;
    }

    let settled = false;
    let pollId = 0;
    let timeoutId = 0;
    let handleMessage: (event: MessageEvent) => void = () => undefined;
    const finish = (error: Error | null, captchaPass = '') => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(pollId);
      window.removeEventListener('message', handleMessage);
      try {
        popup.close();
      } catch {
        // Best effort cleanup for already-closed verification windows.
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(captchaPass);
    };

    handleMessage = (event: MessageEvent) => {
      if (event.origin !== PLAYGROUND_BACKEND_ORIGIN) return;
      const message = event.data;
      if (!isCaptchaPassMessage(message, requestId)) return;
      if (message.error) {
        finish(new Error(message.error));
        return;
      }
      finish(null, message.captchaPass);
    };

    timeoutId = window.setTimeout(() => {
      finish(new Error('Replay Trivia verification timed out. Try again.'));
    }, CAPTCHA_WINDOW_TIMEOUT_MS);
    pollId = window.setInterval(() => {
      if (popup.closed) finish(new Error('Replay Trivia verification was closed before it finished.'));
    }, CAPTCHA_WINDOW_POLL_MS);
    window.addEventListener('message', handleMessage);
  });
}

export async function requestReplayTriviaQuestions(
  streamKey: string,
  request: ReplayTriviaQuestionsRequest
): Promise<ReplayTriviaQuestionsResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      request,
      streamKey,
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, (response: ReplayTriviaQuestionsBackgroundResponse | undefined) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error('Replay Trivia request failed.'));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error));
        return;
      }
      if (!isReplayTriviaQuestionsResponse(response.response)) {
        reject(new Error(MALFORMED_QUESTIONS_ERROR));
        return;
      }
      resolve(response.response);
    });
  });
}

function normalizeStreamKey(value: string): string {
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{4,80}$/.test(trimmed) ? trimmed : '';
}

function normalizeGameId(value: string): string {
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{4,80}$/.test(trimmed) ? trimmed : '';
}

function normalizeGenerationToken(value: string): string {
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{8,120}$/.test(trimmed) ? trimmed : '';
}

function normalizeUserId(value: string): string {
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{1,128}$/.test(trimmed) ? trimmed : '';
}

function createCaptchaRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `rtv_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function isCaptchaPassMessage(
  value: unknown,
  requestId: string
): value is { captchaPass: string; error?: string; requestId: string } {
  if (!isRecord(value)) return false;
  return value.source === REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_SOURCE &&
    value.type === REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_TYPE &&
    value.requestId === requestId &&
    (
      (typeof value.captchaPass === 'string' && /^cap_[a-zA-Z0-9_-]{16,160}$/.test(value.captchaPass)) ||
      typeof value.error === 'string'
    );
}

function isReplayTriviaQuestionsResponse(value: unknown): value is ReplayTriviaQuestionsResponse {
  if (!isRecord(value)) return false;
  if (typeof value.generatedAt !== 'string' ||
    typeof value.languageCode !== 'string' ||
    typeof value.model !== 'string' ||
    !Array.isArray(value.questions) ||
    !value.questions.length ||
    !isRecord(value.transcriptWindow)) {
    return false;
  }

  return value.questions.every(isReplayTriviaQuestion);
}

function isReplayTriviaQuestion(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return isChoices(value.choices) &&
    isChoiceIndex(value.correctChoiceIndex) &&
    (value.difficulty === 'easy' || value.difficulty === 'medium') &&
    isNonEmptyString(value.explanation) &&
    isNonEmptyString(value.friendIntro) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.prompt) &&
    isNonEmptyString(value.rightReply) &&
    isFiniteNumber(value.sourceEndSeconds) &&
    isFiniteNumber(value.sourceStartSeconds) &&
    isNonEmptyString(value.wrongReply);
}

function isChoices(value: unknown): boolean {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every(isNonEmptyString);
}

function isChoiceIndex(value: unknown): boolean {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
