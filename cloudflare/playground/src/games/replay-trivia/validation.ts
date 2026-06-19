/**
 * Replay Trivia request validation.
 *
 * These checks keep transcript uploads bounded before they reach the model and
 * normalize the request into the shared shape used by generation code.
 */
import type {
  ReplayTriviaQuestionsRequest,
  ReplayTriviaTranscriptSegment
} from '../../../../../src/shared/playground/trivia';
import { ReplayTriviaError } from './errors';

const DEFAULT_QUESTION_COUNT = 10;
const MAX_QUESTION_COUNT = 10;
const MAX_TARGET_LANGUAGES = 4;
const MAX_SEGMENTS = 5_000;
const MAX_SEGMENT_TEXT_LENGTH = 500;
const MAX_TRANSCRIPT_CHARS = 400_000;
const MAX_WINDOW_SECONDS = 24 * 60 * 60;
const CAPTCHA_PASS_PATTERN = /^cap_[a-zA-Z0-9_-]{16,160}$/;
const GAME_ID_PATTERN = /^[a-zA-Z0-9_-]{4,80}$/;
const GENERATION_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{8,120}$/;
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function parseReplayTriviaQuestionsRequest(value: unknown): ReplayTriviaQuestionsRequest {
  if (!isRecord(value)) {
    throw new ReplayTriviaError('invalid_request', 'Request body must be an object.', 400);
  }

  const videoId = getString(value, 'videoId');
  if (!YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new ReplayTriviaError('invalid_video_id', 'videoId must be a YouTube video ID.', 400);
  }

  const gameId = getString(value, 'gameId');
  if (!GAME_ID_PATTERN.test(gameId)) {
    throw new ReplayTriviaError('invalid_game_id', 'gameId must be a valid Playground game ID.', 400);
  }

  const generationToken = getString(value, 'generationToken');
  if (!GENERATION_TOKEN_PATTERN.test(generationToken)) {
    throw new ReplayTriviaError('invalid_generation_token', 'generationToken must be a valid Replay Trivia generation token.', 400);
  }

  const captchaPass = getString(value, 'captchaPass');
  if (!CAPTCHA_PASS_PATTERN.test(captchaPass)) {
    throw new ReplayTriviaError('invalid_captcha_pass', 'captchaPass must be a valid Replay Trivia verification pass.', 400);
  }

  const startSeconds = getFiniteNumber(value, 'startSeconds');
  const endSeconds = getFiniteNumber(value, 'endSeconds');
  if (startSeconds < 0 || endSeconds <= startSeconds || endSeconds - startSeconds > MAX_WINDOW_SECONDS) {
    throw new ReplayTriviaError('invalid_window', 'Transcript range must be between 1 second and 24 hours.', 400);
  }

  const questionCount = value.questionCount === undefined
    ? DEFAULT_QUESTION_COUNT
    : getIntegerInRange(value, 'questionCount', 1, MAX_QUESTION_COUNT);
  const languageCode = normalizeOptionalCode(value.languageCode, 'languageCode') || 'en';
  const locale = normalizeOptionalCode(value.locale, 'locale');
  const segments = parseSegments(value.segments, startSeconds, endSeconds);
  const targetLanguages = parseTargetLanguages(value.targetLanguages, languageCode, locale);

  return {
    captchaPass,
    endSeconds,
    gameId,
    generationToken,
    languageCode,
    locale,
    questionCount,
    segments,
    startSeconds,
    targetLanguages,
    videoId
  };
}

export function getTranscriptCharLength(segments: ReplayTriviaTranscriptSegment[]): number {
  return segments.reduce((total, segment) => total + segment.text.length, 0);
}

function parseSegments(value: unknown, startSeconds: number, endSeconds: number): ReplayTriviaTranscriptSegment[] {
  if (!Array.isArray(value) || !value.length) {
    throw new ReplayTriviaError('missing_segments', 'At least one transcript segment is required.', 400);
  }
  if (value.length > MAX_SEGMENTS) {
    throw new ReplayTriviaError('too_many_segments', `At most ${MAX_SEGMENTS} transcript segments are allowed.`, 413);
  }

  const segments = value.map(parseSegment).filter((segment) => {
    const segmentEnd = segment.durationSeconds !== undefined
      ? segment.startSeconds + segment.durationSeconds
      : segment.startSeconds;
    return segment.startSeconds < endSeconds && segmentEnd >= startSeconds;
  });
  if (!segments.length) {
    throw new ReplayTriviaError('empty_window', 'No transcript segments overlap the requested window.', 400);
  }
  const transcriptChars = getTranscriptCharLength(segments);
  if (transcriptChars > MAX_TRANSCRIPT_CHARS) {
    throw new ReplayTriviaError(
      'transcript_too_large',
      `Transcript text must be ${MAX_TRANSCRIPT_CHARS} characters or less.`,
      413,
      {
        chars: transcriptChars,
        maxChars: MAX_TRANSCRIPT_CHARS
      }
    );
  }

  return segments;
}

function parseSegment(value: unknown): ReplayTriviaTranscriptSegment {
  if (!isRecord(value)) {
    throw new ReplayTriviaError('invalid_segment', 'Transcript segments must be objects.', 400);
  }

  const startSeconds = getFiniteNumber(value, 'startSeconds');
  if (startSeconds < 0) throw new ReplayTriviaError('invalid_segment_start', 'Segment start times must be positive.', 400);

  const text = getString(value, 'text').replace(/\s+/g, ' ').trim();
  if (text.length > MAX_SEGMENT_TEXT_LENGTH) {
    throw new ReplayTriviaError('segment_too_large', `Transcript segment text must be ${MAX_SEGMENT_TEXT_LENGTH} characters or less.`, 413);
  }

  const durationSeconds = value.durationSeconds === undefined
    ? undefined
    : getFiniteNumber(value, 'durationSeconds');
  if (durationSeconds !== undefined && (durationSeconds < 0 || durationSeconds > MAX_WINDOW_SECONDS)) {
    throw new ReplayTriviaError('invalid_segment_duration', 'Segment durations must fit inside the transcript window.', 400);
  }

  return {
    durationSeconds,
    startSeconds,
    text
  };
}

function getString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || !field.trim()) {
    throw new ReplayTriviaError('invalid_field', `${key} must be a non-empty string.`, 400);
  }
  return field.trim();
}

function getFiniteNumber(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isFinite(field)) {
    throw new ReplayTriviaError('invalid_field', `${key} must be a finite number.`, 400);
  }
  return field;
}

function getIntegerInRange(value: Record<string, unknown>, key: string, min: number, max: number): number {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isInteger(field) || field < min || field > max) {
    throw new ReplayTriviaError('invalid_field', `${key} must be an integer between ${min} and ${max}.`, 400);
  }
  return field;
}

function normalizeOptionalCode(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new ReplayTriviaError('invalid_field', `${key} must be a string.`, 400);
  }

  const code = value.trim();
  if (!code) return undefined;
  if (!/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})?$/.test(code)) {
    throw new ReplayTriviaError('invalid_field', `${key} must be a valid language or locale code.`, 400);
  }
  return code.replace('_', '-');
}

function parseTargetLanguages(
  value: unknown,
  fallbackLanguageCode: string,
  fallbackLocale?: string
): ReplayTriviaQuestionsRequest['targetLanguages'] {
  if (value === undefined) {
    return [{ languageCode: fallbackLanguageCode, locale: fallbackLocale }];
  }
  if (!Array.isArray(value)) {
    throw new ReplayTriviaError('invalid_field', 'targetLanguages must be an array.', 400);
  }
  if (value.length > MAX_TARGET_LANGUAGES) {
    throw new ReplayTriviaError('too_many_target_languages', `At most ${MAX_TARGET_LANGUAGES} target languages are allowed.`, 400);
  }

  const languages = new Map<string, { languageCode: string; locale?: string }>();
  value.forEach((item) => {
    if (!isRecord(item)) {
      throw new ReplayTriviaError('invalid_field', 'targetLanguages entries must be objects.', 400);
    }
    const languageCode = normalizeOptionalCode(item.languageCode, 'target languageCode');
    if (!languageCode) {
      throw new ReplayTriviaError('invalid_field', 'target languageCode must be a valid language code.', 400);
    }
    const locale = normalizeOptionalCode(item.locale, 'target locale');
    languages.set(locale || languageCode, {
      languageCode,
      locale
    });
  });

  return [...languages.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
