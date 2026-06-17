/**
 * OpenAI adapter for Replay Trivia.
 *
 * Keeps provider-specific request formatting and response validation out of
 * the HTTP route handler. The rest of the backend deals only with shared
 * Replay Trivia request/response types.
 */
import type {
  ReplayTriviaDifficulty,
  ReplayTriviaQuestion,
  ReplayTriviaQuestionsRequest,
  ReplayTriviaQuestionsResponse
} from '../../../../../src/shared/playground-trivia';
import type { Env } from '../../types';
import { ReplayTriviaError } from './errors';

const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_PUBLIC_UNAVAILABLE_MESSAGE = 'Replay Trivia is temporarily unavailable. Try again later.';
const MAX_PROVIDER_ERROR_MESSAGE_LENGTH = 300;
const CHOICE_INDEXES = [0, 1, 2, 3] as const satisfies readonly ReplayTriviaQuestion['correctChoiceIndex'][];

interface OpenAIResponsePayload {
  error?: {
    code?: string;
    message?: string;
  };
  output?: {
    content?: {
      text?: string;
      type?: string;
    }[];
    type?: string;
  }[];
  output_text?: string;
}

export async function generateReplayTriviaQuestions(
  env: Env,
  request: ReplayTriviaQuestionsRequest
): Promise<ReplayTriviaQuestionsResponse> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new ReplayTriviaError('openai_not_configured', 'Replay Trivia question generation is not configured.', 503);
  }

  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      body: JSON.stringify(createOpenAIRequest(model, request)),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });
  } catch (error) {
    throw new ReplayTriviaError(
      'openai_unreachable',
      OPENAI_PUBLIC_UNAVAILABLE_MESSAGE,
      502,
      {
        provider: 'openai',
        providerErrorMessage: getProviderErrorMessage(error instanceof Error ? error.message : String(error)),
        providerErrorType: error instanceof Error ? error.name : typeof error
      }
    );
  }

  let payload: OpenAIResponsePayload;
  try {
    payload = await response.json() as OpenAIResponsePayload;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new ReplayTriviaError(
      'openai_request_failed',
      OPENAI_PUBLIC_UNAVAILABLE_MESSAGE,
      502,
      {
        provider: 'openai',
        providerCode: payload.error?.code || '',
        providerMessage: getProviderErrorMessage(payload.error?.message),
        providerStatus: response.status
      }
    );
  }

  const outputText = getOutputText(payload);
  if (!outputText) {
    throw new ReplayTriviaError('openai_empty_output', 'Replay Trivia question generation returned no output.', 502);
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    throw new ReplayTriviaError('openai_invalid_json', 'Replay Trivia question generation returned invalid JSON.', 502);
  }

  return {
    generatedAt: new Date().toISOString(),
    languageCode: request.languageCode || 'en',
    model,
    questions: distributeCorrectChoiceIndexes(parseGeneratedQuestions(parsedOutput), request),
    transcriptWindow: {
      endSeconds: request.endSeconds,
      segmentCount: request.segments.length,
      startSeconds: request.startSeconds,
      videoId: request.videoId
    }
  };
}

function createOpenAIRequest(model: string, request: ReplayTriviaQuestionsRequest): Record<string, unknown> {
  return {
    input: [
      {
        content: [
          'You create short replay trivia questions from YouTube transcript excerpts.',
          'The game is called HELP-A-FRIEND! Trivia. It is not a formal quiz show.',
          'The premise is a tiny group chat where one friend clearly did not pay attention to the stream and now is annoyingly asking questions.',
          'Use only facts stated or clearly implied in the transcript.',
          'Do not invent facts, names, dates, or context outside the transcript.',
          'Avoid asking about exact timestamps.',
          'Return concise, friendly questions for a live chat mini-game.',
          'Answer choices must be clean standalone answers.',
          'Do not include explanatory suffixes or clue restatements in choices, such as "Roger Clark as Arthur Morgan"; use "Roger Clark".',
          'Distractor choices should be the same kind of entity as the answer, plausible, concise, and not obviously formatted differently.',
          'Distribute correctChoiceIndex across the answer choices. Do not put the correct answer first every time.',
          'Write prompt like a real person asking in chat: casual sentence casing, not headline/title casing.',
          'prompt should usually start lowercase unless it starts with a proper name.',
          'Use lowercase for generic award/category phrases like "game of the year" or "best performance"; keep names and titles correctly capitalized.',
          'For each question, also write one short friendIntro, one rightReply, and one wrongReply.',
          'Make those chat lines context-aware to the question or stream moment, playful, and safe.',
          'Write friendIntro, rightReply, and wrongReply in casual texting style: mostly lowercase, except names and titles.',
          'Use plain "you" when addressing the player. Do not use usernames, handles, mentions, or player labels.',
          'friendIntro should sound like a friend mildly panicking, trying to save face, or begging for help because they missed the replay moment.',
          'About half of friendIntro lines can be lightly humorous or dramatic, like a real friend being silly in a group chat.',
          'Do not force memes, do not be random, and do not make every intro a joke.',
          'The actual trivia question must appear only in prompt.',
          'friendIntro is the first chat bubble before prompt. It should sound like a friend urgently asking for help.',
          'friendIntro must not include the trivia question, repeat prompt, ask who/what/which/when/where/how, or contain a question mark.',
          'Keep friendIntro short.',
          'rightReply should sound relieved and thank the user for saving the friend.',
          'wrongReply should be a roast or judgment, must say the correct answer, and must be valid for any wrong choice.',
          'wrongReply can sound annoyed, betrayed, or mock-disappointed.',
          'wrongReply should be more teasing than neutral.',
          'Do not mention a specific wrong choice in wrongReply.'
        ].join(' '),
        role: 'system'
      },
      {
        content: JSON.stringify({
          endSeconds: request.endSeconds,
          languageCode: request.languageCode || 'en',
          locale: request.locale || request.languageCode || 'en',
          questionCount: request.questionCount || 10,
          startSeconds: request.startSeconds,
          transcript: formatTranscript(request)
        }),
        role: 'user'
      }
    ],
    max_output_tokens: 5000,
    model,
    reasoning: {
      effort: 'low'
    },
    store: false,
    text: {
      format: {
        name: 'replay_trivia_questions',
        schema: REPLAY_TRIVIA_SCHEMA,
        strict: true,
        type: 'json_schema'
      },
      verbosity: 'medium'
    }
  };
}

function formatTranscript(request: ReplayTriviaQuestionsRequest): string {
  return request.segments
    .map((segment) => {
      const timestamp = formatTimestamp(segment.startSeconds);
      return `[${timestamp}] ${segment.text}`;
    })
    .join('\n');
}

function formatTimestamp(value: number): string {
  const totalSeconds = Math.max(0, Math.floor(value));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getOutputText(payload: OpenAIResponsePayload): string {
  if (typeof payload.output_text === 'string') return payload.output_text;

  return payload.output
    ?.flatMap((item) => item.content || [])
    .find((content) => typeof content.text === 'string' && (!content.type || content.type === 'output_text'))
    ?.text || '';
}

function getProviderErrorMessage(value: unknown): string {
  return typeof value === 'string'
    ? value.slice(0, MAX_PROVIDER_ERROR_MESSAGE_LENGTH)
    : '';
}

function parseGeneratedQuestions(value: unknown): ReplayTriviaQuestion[] {
  if (!isRecord(value) || !Array.isArray(value.questions)) {
    throw new ReplayTriviaError('openai_invalid_output', 'Replay Trivia question generation returned malformed output.', 502);
  }

  const questions = value.questions.map(parseGeneratedQuestion);
  if (!questions.length) {
    throw new ReplayTriviaError('openai_no_questions', 'Replay Trivia question generation returned no questions.', 502);
  }
  return questions;
}

function distributeCorrectChoiceIndexes(
  questions: ReplayTriviaQuestion[],
  request: ReplayTriviaQuestionsRequest
): ReplayTriviaQuestion[] {
  const pattern = getCorrectChoiceIndexPattern(request);
  return questions.map((question, index) => moveCorrectChoice(
    question,
    pattern[index % pattern.length]
  ));
}

function getCorrectChoiceIndexPattern(request: ReplayTriviaQuestionsRequest): ReplayTriviaQuestion['correctChoiceIndex'][] {
  const indexes = [...CHOICE_INDEXES];
  let seed = hashString(`${request.gameId}:${request.generationToken}:${request.videoId}`);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    seed = nextSeed(seed);
    const swapIndex = seed % (index + 1);
    const choiceIndex = indexes[index];
    indexes[index] = indexes[swapIndex];
    indexes[swapIndex] = choiceIndex;
  }
  return indexes;
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function nextSeed(seed: number): number {
  return (seed * 1_664_525 + 1_013_904_223) >>> 0;
}

function moveCorrectChoice(
  question: ReplayTriviaQuestion,
  targetIndex: ReplayTriviaQuestion['correctChoiceIndex']
): ReplayTriviaQuestion {
  if (question.correctChoiceIndex === targetIndex) return question;

  const choices = [...question.choices] as ReplayTriviaQuestion['choices'];
  const displacedChoice = choices[targetIndex];
  choices[targetIndex] = choices[question.correctChoiceIndex];
  choices[question.correctChoiceIndex] = displacedChoice;
  return {
    ...question,
    choices,
    correctChoiceIndex: targetIndex
  };
}

function parseGeneratedQuestion(value: unknown, index: number): ReplayTriviaQuestion {
  if (!isRecord(value)) {
    throw new ReplayTriviaError('openai_invalid_question', 'Replay Trivia question generation returned an invalid question.', 502);
  }

  const correctChoiceIndex = value.correctChoiceIndex;
  const difficulty = value.difficulty;
  if (typeof correctChoiceIndex !== 'number' || !Number.isInteger(correctChoiceIndex) || correctChoiceIndex < 0 || correctChoiceIndex > 3) {
    throw new ReplayTriviaError('openai_invalid_answer', 'Replay Trivia question generation returned an invalid answer.', 502);
  }
  if (difficulty !== 'easy' && difficulty !== 'medium') {
    throw new ReplayTriviaError('openai_invalid_difficulty', 'Replay Trivia question generation returned invalid difficulty.', 502);
  }

  const prompt = getRequiredString(value, 'prompt');
  const choices = getChoices(value.choices);
  const answerIndex = correctChoiceIndex as 0 | 1 | 2 | 3;
  const correctChoice = choices[answerIndex];
  const wrongReply = ensureWrongReplyIncludesCorrectChoice(getRequiredString(value, 'wrongReply'), correctChoice);
  return {
    choices,
    correctChoiceIndex: answerIndex,
    difficulty: difficulty as ReplayTriviaDifficulty,
    explanation: getRequiredString(value, 'explanation'),
    friendIntro: getRequiredString(value, 'friendIntro'),
    id: `q_${index + 1}`,
    prompt,
    rightReply: getRequiredString(value, 'rightReply'),
    sourceEndSeconds: getRequiredNumber(value, 'sourceEndSeconds'),
    sourceStartSeconds: getRequiredNumber(value, 'sourceStartSeconds'),
    wrongReply
  };
}

function getChoices(value: unknown): [string, string, string, string] {
  if (!Array.isArray(value) || value.length !== 4 || !value.every((choice) => typeof choice === 'string' && choice.trim())) {
    throw new ReplayTriviaError('openai_invalid_choices', 'Replay Trivia question generation returned invalid choices.', 502);
  }

  const choices = value.map((choice) => String(choice).trim());
  if (choices.some((choice) => !choice)) {
    throw new ReplayTriviaError('openai_invalid_choices', 'Replay Trivia question generation returned invalid choices.', 502);
  }
  return choices as [string, string, string, string];
}

function getRequiredString(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== 'string' || !field.trim()) {
    throw new ReplayTriviaError('openai_invalid_output', `Replay Trivia question generation omitted ${key}.`, 502);
  }
  return field.trim();
}

function ensureWrongReplyIncludesCorrectChoice(wrongReply: string, correctChoice: string): string {
  if (wrongReply.toLowerCase().includes(correctChoice.toLowerCase())) return wrongReply;
  const separator = /[.!?]$/.test(wrongReply) ? ' ' : '. ';
  return `${wrongReply}${separator}it was ${correctChoice}.`;
}

function getRequiredNumber(value: Record<string, unknown>, key: string): number {
  const field = value[key];
  if (typeof field !== 'number' || !Number.isFinite(field)) {
    throw new ReplayTriviaError('openai_invalid_output', `Replay Trivia question generation omitted ${key}.`, 502);
  }
  return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const REPLAY_TRIVIA_SCHEMA = {
  additionalProperties: false,
  properties: {
    questions: {
      items: {
        additionalProperties: false,
        properties: {
          choices: {
            items: { type: 'string' },
            maxItems: 4,
            minItems: 4,
            type: 'array'
          },
          correctChoiceIndex: {
            maximum: 3,
            minimum: 0,
            type: 'integer'
          },
          difficulty: {
            enum: ['easy', 'medium'],
            type: 'string'
          },
          explanation: { type: 'string' },
          friendIntro: { type: 'string' },
          prompt: { type: 'string' },
          rightReply: { type: 'string' },
          sourceEndSeconds: { type: 'number' },
          sourceStartSeconds: { type: 'number' },
          wrongReply: { type: 'string' }
        },
        required: [
          'prompt',
          'choices',
          'correctChoiceIndex',
          'explanation',
          'sourceStartSeconds',
          'sourceEndSeconds',
          'difficulty',
          'friendIntro',
          'rightReply',
          'wrongReply'
        ],
        type: 'object'
      },
      maxItems: 10,
      minItems: 1,
      type: 'array'
    }
  },
  required: ['questions'],
  type: 'object'
} as const;
