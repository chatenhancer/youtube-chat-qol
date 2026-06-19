/**
 * Replay Trivia realtime game module.
 *
 * The HTTP route generates question packs, then the room stores one pack for
 * the active match and owns answers, scoring, round transitions, and public
 * serialization for both players.
 */
import type { PlaygroundUserLanguage, PublicGame, PublicUserIdentity } from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';
import type {
  ReplayTriviaGameStatus,
  ReplayTriviaPublicAnswer,
  ReplayTriviaPublicQuestion,
  ReplayTriviaQuestion
} from '../../../../../src/shared/playground/trivia';
import type { GameActionInput, GameModule, GameRecord, PublicGameContext } from '../types';

type ChoiceIndex = 0 | 1 | 2 | 3;
type PlayerRole = 'guest' | 'host';

const COUNTDOWN_MS = 3_000;
const REVEAL_MS = 4_300;
const SCORE_MS = 2_200;
const GENERATION_TOKEN_TTL_MS = 2 * 60 * 1000;
const MIN_QUESTIONS = 1;
const MAX_QUESTIONS = 10;

export const REPLAY_TRIVIA_QUESTION_READ_MS = 2_900;
export const REPLAY_TRIVIA_ANSWER_TIME_MS = 9_000;

export interface PublicReplayTriviaGame extends PublicGame {
  answers: Partial<Record<PlayerRole, ReplayTriviaPublicAnswer>>;
  currentQuestion?: ReplayTriviaPublicQuestion;
  currentQuestionIndex: number;
  gameType: 'replay-trivia';
  phaseStartedAt: number;
  players: Record<PlayerRole, PublicUserIdentity>;
  questionProviderUserId: string;
  scores: Record<PlayerRole, number>;
  status: ReplayTriviaGameStatus;
  totalQuestions: number;
  winnerUserId?: string | null;
}

interface ReplayTriviaStoredQuestion {
  choices: [string, string, string, string];
  correctChoiceIndex: ChoiceIndex;
  friendIntro: string;
  id: string;
  localizations: ReplayTriviaStoredQuestionLocalization[];
  prompt: string;
  rightReply: string;
  wrongReply: string;
}

interface ReplayTriviaStoredQuestionLocalization {
  choices: [string, string, string, string];
  friendIntro: string;
  languageCode: string;
  prompt: string;
  rightReply: string;
  wrongReply: string;
}

interface ReplayTriviaGameRecord extends GameRecord {
  answers: Record<string, ChoiceIndex | null | undefined>;
  currentQuestionIndex: number;
  gameType: 'replay-trivia';
  phaseStartedAt: number;
  players: Record<PlayerRole, string>;
  questionProviderUserId: string;
  questions: ReplayTriviaStoredQuestion[];
  scores: Record<PlayerRole, number>;
  scoredQuestionIndexes: number[];
  status: ReplayTriviaGameStatus;
}

export const replayTriviaGameModule: GameModule = {
  applyAction(game, input) {
    const triviaGame = assertReplayTriviaGame(game);
    switch (input.action) {
      case 'submitQuestions':
        return submitReplayTriviaQuestions(triviaGame, input);
      case 'advance':
        return advanceReplayTriviaGame(triviaGame);
      case 'answer':
        return answerReplayTriviaQuestion(triviaGame, input);
      case 'timeout':
        return timeoutReplayTriviaQuestion(triviaGame);
      default:
        throw new ProtocolError('unsupported_action', 'Unsupported Replay Trivia action.');
    }
  },
  canUserAccessGame(game, userId) {
    return getReplayTriviaPlayerRole(assertReplayTriviaGame(game), userId) !== null;
  },
  createGenerationToken(game, input) {
    assertReplayTriviaQuestionProviderCanGenerate(assertReplayTriviaGame(game), input.userId);
    return {
      expiresAt: input.now + GENERATION_TOKEN_TTL_MS
    };
  },
  createGame(gameId, playerUserIds) {
    return createReplayTriviaGame(gameId, playerUserIds[0], playerUserIds[1]);
  },
  getRecipientUserIds(game) {
    const triviaGame = assertReplayTriviaGame(game);
    return [triviaGame.players.host, triviaGame.players.guest];
  },
  getWinnerUserId(game) {
    const triviaGame = assertReplayTriviaGame(game);
    return triviaGame.status === 'finished' ? getReplayTriviaWinnerUserId(triviaGame) : null;
  },
  toPublicGame(game, getUser, context) {
    return toPublicReplayTriviaGame(assertReplayTriviaGame(game), getUser, context);
  },
  validateGenerationToken(game, input) {
    assertReplayTriviaQuestionProviderCanGenerate(assertReplayTriviaGame(game), input.userId);
  }
};

export function createReplayTriviaGame(
  gameId: string,
  hostUserId: string,
  guestUserId: string,
  now = Date.now()
): ReplayTriviaGameRecord {
  return {
    answers: {},
    currentQuestionIndex: 0,
    gameId,
    gameType: 'replay-trivia',
    phaseStartedAt: now,
    players: {
      guest: guestUserId,
      host: hostUserId
    },
    questionProviderUserId: hostUserId,
    questions: [],
    scoredQuestionIndexes: [],
    scores: {
      guest: 0,
      host: 0
    },
    status: 'preparing'
  };
}

export function submitReplayTriviaQuestions(
  game: ReplayTriviaGameRecord,
  input: GameActionInput,
  now = Date.now()
): ReplayTriviaGameRecord {
  assertReplayTriviaQuestionProviderCanGenerate(game, input.userId);

  const questions = parseQuestionPack(input.payload?.questions);
  return {
    ...game,
    answers: {},
    currentQuestionIndex: 0,
    phaseStartedAt: now,
    questions,
    scoredQuestionIndexes: [],
    status: 'countdown'
  };
}

function assertReplayTriviaQuestionProviderCanGenerate(game: ReplayTriviaGameRecord, userId: string): void {
  if (game.status !== 'preparing') throw new ProtocolError('questions_locked', 'Questions are already set.');
  if (userId !== game.questionProviderUserId) {
    throw new ProtocolError('not_question_provider', 'Only the question provider can generate Replay Trivia questions.');
  }
}

export function answerReplayTriviaQuestion(
  game: ReplayTriviaGameRecord,
  input: GameActionInput,
  now = Date.now()
): ReplayTriviaGameRecord {
  if (game.status !== 'question') throw new ProtocolError('not_answering', 'This round is not accepting answers.');
  if (isQuestionDeadlinePassed(game, now)) return revealReplayTriviaRound(game, now);

  const role = getRequiredReplayTriviaPlayerRole(game, input.userId);
  if (game.answers[input.userId] !== undefined) {
    throw new ProtocolError('answer_locked', 'Your answer is already locked.');
  }

  const choiceIndex = parseChoiceIndex(input.payload?.choiceIndex);
  const nextGame = {
    ...game,
    answers: {
      ...game.answers,
      [input.userId]: choiceIndex
    }
  };
  const otherRole = role === 'host' ? 'guest' : 'host';
  return nextGame.answers[nextGame.players[otherRole]] !== undefined
    ? revealReplayTriviaRound(nextGame, now)
    : nextGame;
}

export function timeoutReplayTriviaQuestion(
  game: ReplayTriviaGameRecord,
  now = Date.now()
): ReplayTriviaGameRecord {
  if (game.status !== 'question') return game;
  if (!isQuestionDeadlinePassed(game, now)) {
    throw new ProtocolError('answer_time_remaining', 'This round still has answer time remaining.');
  }

  return revealReplayTriviaRound(game, now);
}

export function advanceReplayTriviaGame(
  game: ReplayTriviaGameRecord,
  now = Date.now()
): ReplayTriviaGameRecord {
  switch (game.status) {
    case 'countdown':
      if (now - game.phaseStartedAt < COUNTDOWN_MS) {
        throw new ProtocolError('countdown_active', 'Countdown is still active.');
      }
      return {
        ...game,
        answers: {},
        phaseStartedAt: now,
        status: 'question'
      };
    case 'reveal':
      if (now - game.phaseStartedAt < REVEAL_MS) {
        throw new ProtocolError('reveal_active', 'Reveal is still active.');
      }
      return {
        ...game,
        phaseStartedAt: now,
        status: 'score'
      };
    case 'score':
      if (now - game.phaseStartedAt < SCORE_MS) {
        throw new ProtocolError('score_active', 'Score is still active.');
      }
      if (game.currentQuestionIndex >= game.questions.length - 1) {
        return {
          ...game,
          phaseStartedAt: now,
          status: 'finished'
        };
      }
      return {
        ...game,
        answers: {},
        currentQuestionIndex: game.currentQuestionIndex + 1,
        phaseStartedAt: now,
        status: 'countdown'
      };
    case 'finished':
      return game;
    default:
      throw new ProtocolError('cannot_advance', 'Replay Trivia cannot advance from this phase.');
  }
}

export function toPublicReplayTriviaGame(
  game: ReplayTriviaGameRecord,
  getUser: (userId: string) => PublicUserIdentity,
  context?: PublicGameContext
): PublicReplayTriviaGame {
  const currentQuestion = game.questions[game.currentQuestionIndex];
  const revealAnswers = shouldRevealAnswers(game.status);
  const language = getReplayTriviaRecipientLanguage(context);
  return {
    answers: toPublicReplayTriviaAnswers(game, revealAnswers),
    currentQuestion: currentQuestion ? toPublicReplayTriviaQuestion(currentQuestion, revealAnswers, language) : undefined,
    currentQuestionIndex: game.currentQuestionIndex,
    gameId: game.gameId,
    gameType: 'replay-trivia',
    phaseStartedAt: game.phaseStartedAt,
    players: {
      guest: getUser(game.players.guest),
      host: getUser(game.players.host)
    },
    questionProviderUserId: game.questionProviderUserId,
    scores: game.scores,
    status: game.status,
    totalQuestions: game.questions.length,
    winnerUserId: game.status === 'finished' ? getReplayTriviaWinnerUserId(game) : undefined
  };
}

function revealReplayTriviaRound(game: ReplayTriviaGameRecord, now: number): ReplayTriviaGameRecord {
  if (game.scoredQuestionIndexes.includes(game.currentQuestionIndex)) {
    return {
      ...game,
      phaseStartedAt: now,
      status: 'reveal'
    };
  }

  const question = getCurrentStoredQuestion(game);
  const scores = { ...game.scores };
  (['host', 'guest'] as const).forEach((role) => {
    const answer = game.answers[game.players[role]];
    if (answer === question.correctChoiceIndex) scores[role] += 1;
  });

  return {
    ...game,
    phaseStartedAt: now,
    scoredQuestionIndexes: [...game.scoredQuestionIndexes, game.currentQuestionIndex],
    scores,
    status: 'reveal'
  };
}

function toPublicReplayTriviaAnswers(
  game: ReplayTriviaGameRecord,
  revealAnswers: boolean
): Partial<Record<PlayerRole, ReplayTriviaPublicAnswer>> {
  const question = game.questions[game.currentQuestionIndex];
  const answers: Partial<Record<PlayerRole, ReplayTriviaPublicAnswer>> = {};
  (['host', 'guest'] as const).forEach((role) => {
    const choiceIndex = game.answers[game.players[role]];
    if (choiceIndex === undefined) return;

    answers[role] = revealAnswers
      ? {
        answered: choiceIndex !== null,
        choiceIndex: choiceIndex ?? undefined,
        correct: question ? choiceIndex === question.correctChoiceIndex : false
      }
      : {
        answered: choiceIndex !== null
      };
  });
  return answers;
}

function toPublicReplayTriviaQuestion(
  question: ReplayTriviaStoredQuestion,
  revealAnswer: boolean,
  language: PlaygroundUserLanguage | null
): ReplayTriviaPublicQuestion {
  const text = getLocalizedQuestionText(question, language);
  return {
    choices: text.choices,
    correctChoiceIndex: revealAnswer ? question.correctChoiceIndex : undefined,
    friendIntro: text.friendIntro,
    id: question.id,
    prompt: text.prompt,
    rightReply: text.rightReply,
    wrongReply: text.wrongReply
  };
}

function parseQuestionPack(value: unknown): ReplayTriviaStoredQuestion[] {
  if (!Array.isArray(value) || value.length < MIN_QUESTIONS) {
    throw new ProtocolError('missing_questions', 'At least one Replay Trivia question is required.');
  }
  if (value.length > MAX_QUESTIONS) {
    throw new ProtocolError('too_many_questions', `At most ${MAX_QUESTIONS} Replay Trivia questions are allowed.`);
  }

  return value.map(parseQuestion);
}

function parseQuestion(value: unknown): ReplayTriviaStoredQuestion {
  const question = getRecord(value, 'question');
  const generated = question as Partial<ReplayTriviaQuestion>;
  const choices = parseChoices(generated.choices);
  return {
    choices,
    correctChoiceIndex: parseChoiceIndex(generated.correctChoiceIndex),
    friendIntro: getGeneratedText(question.friendIntro, 'friendIntro', 140),
    id: getGeneratedText(question.id, 'id', 80),
    localizations: parseQuestionLocalizations(generated.localizations),
    prompt: getGeneratedText(generated.prompt, 'prompt', 260),
    rightReply: getGeneratedText(question.rightReply, 'rightReply', 180),
    wrongReply: getGeneratedText(question.wrongReply, 'wrongReply', 220)
  };
}

function parseQuestionLocalizations(value: unknown): ReplayTriviaStoredQuestionLocalization[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new ProtocolError('invalid_question', 'Replay Trivia question localizations must be an array.');
  }

  const localizations = new Map<string, ReplayTriviaStoredQuestionLocalization>();
  value.forEach((item) => {
    const localization = getRecord(item, 'question localization');
    const languageCode = getGeneratedLanguageCode(localization.languageCode);
    const choices = parseChoices(localization.choices);
    localizations.set(languageCode.toLowerCase(), {
      choices,
      friendIntro: getGeneratedText(localization.friendIntro, 'localized friendIntro', 140),
      languageCode,
      prompt: getGeneratedText(localization.prompt, 'localized prompt', 260),
      rightReply: getGeneratedText(localization.rightReply, 'localized rightReply', 180),
      wrongReply: getGeneratedText(localization.wrongReply, 'localized wrongReply', 220)
    });
  });

  return [...localizations.values()];
}

function parseChoices(value: unknown): [string, string, string, string] {
  if (!Array.isArray(value) || value.length !== 4) {
    throw new ProtocolError('invalid_choices', 'Each Replay Trivia question must have four choices.');
  }

  return value.map((choice, index) => getGeneratedText(choice, `choice ${index + 1}`, 120)) as [string, string, string, string];
}

function parseChoiceIndex(value: unknown): ChoiceIndex {
  if (value === 0 || value === 1 || value === 2 || value === 3) return value;
  throw new ProtocolError('invalid_choice', 'Choice index must be 0, 1, 2, or 3.');
}

function getGeneratedText(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new ProtocolError('invalid_question', `Replay Trivia questions must include ${field}.`);
  return text.slice(0, maxLength);
}

function getGeneratedLanguageCode(value: unknown): string {
  const text = getGeneratedText(value, 'localized languageCode', 16);
  if (!/^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})?$/.test(text)) {
    throw new ProtocolError('invalid_question', 'Replay Trivia question localizations must include valid languageCode.');
  }
  return text.replace('_', '-');
}

function getRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProtocolError('invalid_question', `${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function getRequiredReplayTriviaPlayerRole(game: ReplayTriviaGameRecord, userId: string): PlayerRole {
  const role = getReplayTriviaPlayerRole(game, userId);
  if (!role) throw new ProtocolError('not_in_game', 'You are not a player in this game.');
  return role;
}

function getReplayTriviaPlayerRole(game: ReplayTriviaGameRecord, userId: string): PlayerRole | null {
  if (game.players.host === userId) return 'host';
  if (game.players.guest === userId) return 'guest';
  return null;
}

function getCurrentStoredQuestion(game: ReplayTriviaGameRecord): ReplayTriviaStoredQuestion {
  const question = game.questions[game.currentQuestionIndex];
  if (!question) throw new ProtocolError('missing_question', 'Replay Trivia question is unavailable.');
  return question;
}

function getReplayTriviaWinnerUserId(game: ReplayTriviaGameRecord): string | null {
  if (game.scores.host === game.scores.guest) return null;
  return game.scores.host > game.scores.guest ? game.players.host : game.players.guest;
}

function getReplayTriviaRecipientLanguage(context?: PublicGameContext): PlaygroundUserLanguage | null {
  if (!context?.recipientUserId || !context.getUserLanguage) return null;
  return context.getUserLanguage(context.recipientUserId);
}

function getLocalizedQuestionText(
  question: ReplayTriviaStoredQuestion,
  language: PlaygroundUserLanguage | null
): ReplayTriviaStoredQuestionLocalization | ReplayTriviaStoredQuestion {
  if (!language) return question;

  const localizations = Array.isArray(question.localizations) ? question.localizations : [];
  const preferredCodes = [
    language.locale,
    language.languageCode,
    language.locale?.split('-')[0],
    language.languageCode.split('-')[0]
  ].filter(Boolean).map((code) => String(code).toLowerCase());
  return localizations.find((localization) =>
    preferredCodes.includes(localization.languageCode.toLowerCase()) ||
    preferredCodes.includes(localization.languageCode.split('-')[0].toLowerCase())
  ) || question;
}

function isQuestionDeadlinePassed(game: ReplayTriviaGameRecord, now: number): boolean {
  return now - game.phaseStartedAt >= REPLAY_TRIVIA_QUESTION_READ_MS + REPLAY_TRIVIA_ANSWER_TIME_MS;
}

function shouldRevealAnswers(status: ReplayTriviaGameStatus): boolean {
  return status === 'reveal' || status === 'score' || status === 'finished';
}

function assertReplayTriviaGame(game: GameRecord): ReplayTriviaGameRecord {
  if (game.gameType !== 'replay-trivia') {
    throw new ProtocolError('unsupported_game', 'Expected a Replay Trivia game.');
  }
  return game as ReplayTriviaGameRecord;
}
