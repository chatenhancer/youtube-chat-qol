import {
  REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE,
  type ReplayTriviaQuestionsBackgroundResponse,
  type ReplayTriviaQuestionsRequest,
  type ReplayTriviaQuestionsResponse
} from '../../../../shared/playground-trivia';
import { getCurrentYouTubeChatStreamKey } from '../../../../youtube/source-url';
import { fetchReplayTriviaTranscriptWindow, type FetchReplayTriviaTranscriptOptions } from './transcript';

const MALFORMED_QUESTIONS_ERROR = 'Replay Trivia question generation returned an incomplete question pack.';

export interface GenerateReplayTriviaOptions extends FetchReplayTriviaTranscriptOptions {
  gameId?: string;
  generationToken?: string;
  locale?: string;
  questionCount?: number;
  streamKey?: string;
}

export async function generateReplayTriviaQuestions(
  options: GenerateReplayTriviaOptions = {}
): Promise<ReplayTriviaQuestionsResponse> {
  const streamKey = normalizeStreamKey(options.streamKey || getCurrentYouTubeChatStreamKey());
  if (!streamKey) throw new Error('A YouTube stream key is required for Replay Trivia.');
  const gameId = normalizeGameId(options.gameId || '');
  const generationToken = normalizeGenerationToken(options.generationToken || '');
  if (!gameId || !generationToken) throw new Error('Replay Trivia generation authorization is required.');

  const transcriptWindow = await fetchReplayTriviaTranscriptWindow({
    endSeconds: options.endSeconds,
    languageCodes: options.languageCodes,
    startSeconds: options.startSeconds,
    videoId: options.videoId
  });

  return requestReplayTriviaQuestions(streamKey, {
    ...transcriptWindow,
    gameId,
    generationToken,
    locale: options.locale,
    questionCount: options.questionCount
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
