export const REPLAY_TRIVIA_QUESTIONS_ROUTE = 'replay-trivia/questions';
export const REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE = 'ytcq:playground:replay-trivia-questions';
export const REPLAY_TRIVIA_CAPTCHA_ROUTE = '/v1/captcha/replay-trivia';
export const REPLAY_TRIVIA_CAPTCHA_PAGE_ROUTE = '/turnstile/replay-trivia';
export const REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_SOURCE = 'chat-enhancer-playground';
export const REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_TYPE = 'replayTriviaCaptchaPass';

export interface ReplayTriviaTranscriptSegment {
  durationSeconds?: number;
  startSeconds: number;
  text: string;
}

export interface ReplayTriviaGenerationToken {
  expiresAt: number;
  gameId: string;
  generationToken: string;
}

export interface ReplayTriviaQuestionsRequest {
  captchaPass: string;
  endSeconds: number;
  gameId: string;
  generationToken: string;
  languageCode?: string;
  locale?: string;
  questionCount?: number;
  segments: ReplayTriviaTranscriptSegment[];
  startSeconds: number;
  targetLanguages?: ReplayTriviaTargetLanguage[];
  videoId: string;
}

export type ReplayTriviaDifficulty = 'easy' | 'medium';

export interface ReplayTriviaTargetLanguage {
  languageCode: string;
  locale?: string;
}

export interface ReplayTriviaQuestionText {
  choices: [string, string, string, string];
  friendIntro: string;
  prompt: string;
  rightReply: string;
  wrongReply: string;
}

export interface ReplayTriviaQuestionLocalization extends ReplayTriviaQuestionText {
  languageCode: string;
}

export interface ReplayTriviaQuestion extends ReplayTriviaQuestionText {
  correctChoiceIndex: 0 | 1 | 2 | 3;
  difficulty: ReplayTriviaDifficulty;
  explanation: string;
  id: string;
  localizations?: ReplayTriviaQuestionLocalization[];
  sourceEndSeconds: number;
  sourceStartSeconds: number;
}

export interface ReplayTriviaQuestionsResponse {
  generatedAt: string;
  languageCode: string;
  model: string;
  questions: ReplayTriviaQuestion[];
  transcriptWindow: {
    endSeconds: number;
    segmentCount: number;
    startSeconds: number;
    videoId: string;
  };
}

export interface ReplayTriviaQuestionsBackgroundMessage {
  request: ReplayTriviaQuestionsRequest;
  streamKey: string;
  type: typeof REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE;
}

export type ReplayTriviaQuestionsBackgroundResponse =
  | {
    ok: true;
    response: ReplayTriviaQuestionsResponse;
  }
  | {
    code?: string;
    error: string;
    ok: false;
    status?: number;
  };

export type ReplayTriviaGameStatus = 'preparing' | 'countdown' | 'question' | 'reveal' | 'score' | 'finished';
export type ReplayTriviaPlayerRole = 'guest' | 'host';

export function parseReplayTriviaExpectedPhaseStartedAt(
  payload: Record<string, unknown> | undefined
): number | null {
  const value = payload?.expectedPhaseStartedAt;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export interface ReplayTriviaPublicQuestion {
  choices: [string, string, string, string];
  correctChoiceIndex?: 0 | 1 | 2 | 3;
  friendIntro: string;
  id: string;
  prompt: string;
  rightReply: string;
  wrongReply: string;
}

export interface ReplayTriviaPublicAnswer {
  answered: boolean;
  choiceIndex?: 0 | 1 | 2 | 3;
  correct?: boolean;
}
