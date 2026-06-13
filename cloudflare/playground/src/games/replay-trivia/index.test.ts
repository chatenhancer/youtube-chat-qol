import { describe, expect, it } from 'vitest';
import { ProtocolError } from '../../protocol/validation';
import {
  advanceReplayTriviaGame,
  answerReplayTriviaQuestion,
  createReplayTriviaGame,
  replayTriviaGameModule,
  submitReplayTriviaQuestions,
  timeoutReplayTriviaQuestion,
  toPublicReplayTriviaGame
} from './index';

describe('playground replay trivia game rules', () => {
  it('starts in preparing until the question provider submits a pack', () => {
    const game = createReplayTriviaGame('game-1', 'host-user', 'guest-user', 1_000);

    expect(game.status).toBe('preparing');
    expect(game.questionProviderUserId).toBe('host-user');
    expect(game.players.host).toBe('host-user');
    expect(game.players.guest).toBe('guest-user');

    const nextGame = submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 2_000);

    expect(nextGame.status).toBe('countdown');
    expect(nextGame.questions).toHaveLength(1);
    expect(nextGame.phaseStartedAt).toBe(2_000);
  });

  it('rejects question packs from the invited player', () => {
    const game = createReplayTriviaGame('game-1', 'host-user', 'guest-user');

    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'guest-user'
    })).toThrowError(new ProtocolError(
      'not_question_provider',
      'Only the question provider can generate Replay Trivia questions.'
    ));
  });

  it('only grants generation tokens to the question provider while preparing', () => {
    const preparingGame = createReplayTriviaGame('game-1', 'host-user', 'guest-user', 1_000);

    expect(replayTriviaGameModule.createGenerationToken?.(preparingGame, {
      now: 2_000,
      userId: 'host-user'
    })).toEqual({
      expiresAt: 122_000
    });
    expect(() => replayTriviaGameModule.createGenerationToken?.(preparingGame, {
      now: 2_000,
      userId: 'guest-user'
    })).toThrowError(new ProtocolError(
      'not_question_provider',
      'Only the question provider can generate Replay Trivia questions.'
    ));

    const startedGame = submitReplayTriviaQuestions(preparingGame, {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 2_000);
    expect(() => replayTriviaGameModule.validateGenerationToken?.(startedGame, {
      now: 3_000,
      userId: 'host-user'
    })).toThrowError(new ProtocolError(
      'questions_locked',
      'Questions are already set.'
    ));
  });

  it('advances rounds, hides selected choices before reveal, and scores both answers', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);

    game = advanceReplayTriviaGame(game, 3_000);
    expect(game.status).toBe('question');

    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: { choiceIndex: 0 },
      userId: 'host-user'
    }, 4_000);
    let publicGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.answers.host).toEqual({ answered: true });
    expect(publicGame.currentQuestion?.correctChoiceIndex).toBeUndefined();

    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: { choiceIndex: 1 },
      userId: 'guest-user'
    }, 5_000);
    expect(game.status).toBe('reveal');
    expect(game.scores).toEqual({ guest: 0, host: 1 });

    publicGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.answers.host).toEqual({ answered: true, choiceIndex: 0, correct: true });
    expect(publicGame.answers.guest).toEqual({ answered: true, choiceIndex: 1, correct: false });
    expect(publicGame.currentQuestion?.correctChoiceIndex).toBe(0);
  });

  it('times out unanswered rounds and marks the final winner', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);
    game = advanceReplayTriviaGame(game, 3_000);
    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: { choiceIndex: 0 },
      userId: 'host-user'
    }, 4_000);

    expect(() => timeoutReplayTriviaQuestion(game, 4_100)).toThrowError(new ProtocolError(
      'answer_time_remaining',
      'This round still has answer time remaining.'
    ));

    game = timeoutReplayTriviaQuestion(game, 14_900);
    game = advanceReplayTriviaGame(game, 19_200);
    game = advanceReplayTriviaGame(game, 21_400);
    expect(game.status).toBe('finished');

    const publicGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.winnerUserId).toBe('host-user');
  });

  it('handles actions through the game module interface', () => {
    const game = replayTriviaGameModule.createGame('game-1', ['host-user', 'guest-user']);
    const nextGame = replayTriviaGameModule.applyAction(game, {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    });

    expect(nextGame.status).toBe('countdown');
    expect(replayTriviaGameModule.getRecipientUserIds(nextGame)).toEqual(['host-user', 'guest-user']);
    expect(replayTriviaGameModule.canUserAccessGame(nextGame, 'host-user')).toBe(true);
    expect(replayTriviaGameModule.canUserAccessGame(nextGame, 'other-user')).toBe(false);
  });
});

function createQuestion() {
  return {
    choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
    correctChoiceIndex: 0,
    friendIntro: 'chat emergency, who won Game of the Year here?',
    id: 'q_1',
    prompt: 'Which game won Game of the Year in this segment?',
    rightReply: 'wow, you knew the trophy one.',
    wrongReply: 'you missed it. it was God of War.'
  };
}
