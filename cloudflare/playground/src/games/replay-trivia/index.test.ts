import { describe, expect, it } from 'vitest';
import { PLAYGROUND_GAME_VERSIONS } from '../../protocol/messages';
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

type QuestionFixture = {
  choices: [string, string, string, string];
  correctChoiceIndex: 0 | 1 | 2 | 3;
  friendIntro: string;
  id: string;
  localizations?: {
    choices: [string, string, string, string];
    friendIntro: string;
    languageCode: string;
    prompt: string;
    rightReply: string;
    wrongReply: string;
  }[];
  prompt: string;
  rightReply: string;
  wrongReply: string;
};

describe('playground replay trivia game rules', () => {
  it('starts in preparing until the question provider submits a pack', () => {
    const game = createReplayTriviaGame('game-1', 'host-user', 'guest-user', 1_000);

    expect(game.gameVersion).toBe(2);
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

  it('does not restore Replay Trivia records from the previous game version', () => {
    const game = createReplayTriviaGame('game-1', 'host-user', 'guest-user', 1_000);

    expect(replayTriviaGameModule.isStoredGameRecord(game)).toBe(true);
    expect(replayTriviaGameModule.isStoredGameRecord({
      ...game,
      gameVersion: 1
    })).toBe(false);
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
      expiresAt: 122_000,
      tokenPrefix: 'rtg'
    });
    expect(replayTriviaGameModule.createGenerationTokenMessage?.({
      expiresAt: 122_000,
      gameId: preparingGame.gameId,
      generationToken: 'rtg_1234567890abcdef'
    })).toEqual({
      expiresAt: 122_000,
      gameId: preparingGame.gameId,
      generationToken: 'rtg_1234567890abcdef',
      type: 'replayTriviaGenerationToken'
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

    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 3_000);
    expect(game.status).toBe('question');

    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'host-user'
    }, 4_000);
    let publicGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.answers.host).toEqual({ answered: true });
    expect(publicGame.currentQuestion?.correctChoiceIndex).toBeUndefined();

    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 1
      },
      userId: 'guest-user'
    }, 5_000);
    expect(game.status).toBe('reveal');
    expect(game.scores).toEqual({ guest: 0, host: 1 });

    publicGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.answers.host).toEqual({ answered: true, choiceIndex: 0, correct: true });
    expect(publicGame.answers.guest).toEqual({ answered: true, choiceIndex: 1, correct: false });
    expect(publicGame.currentQuestion?.correctChoiceIndex).toBe(0);
  });

  it('publishes localized question text for the recipient language', () => {
    const game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: {
        questions: [createQuestion({
          localizations: [
            {
              choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
              friendIntro: 'chat, necesito ayuda',
              languageCode: 'es',
              prompt: 'Que juego gano el premio en este segmento?',
              rightReply: 'gracias, salvada total.',
              wrongReply: 'fallaste. era God of War.'
            }
          ]
        })]
      },
      userId: 'host-user'
    }, 0);

    const englishGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }), {
      getUserLanguage: () => ({ languageCode: 'en' }),
      recipientUserId: 'host-user'
    });
    const spanishGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }), {
      getUserLanguage: () => ({ languageCode: 'es' }),
      recipientUserId: 'guest-user'
    });

    expect(englishGame.currentQuestion?.prompt).toBe('Which game won Game of the Year in this segment?');
    expect(spanishGame.currentQuestion?.prompt).toBe('Que juego gano el premio en este segmento?');
    expect(spanishGame.currentQuestion?.choices[0]).toBe('God of War');
    expect(spanishGame.currentQuestion?.correctChoiceIndex).toBeUndefined();
  });

  it('times out unanswered rounds and marks the final winner', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 3_000);
    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'host-user'
    }, 4_000);

    expect(() => timeoutReplayTriviaQuestion(
      game,
      createReplayTriviaAction(game, 'timeout'),
      4_100
    )).toThrowError(new ProtocolError(
      'answer_time_remaining',
      'This round still has answer time remaining.'
    ));

    game = timeoutReplayTriviaQuestion(game, createReplayTriviaAction(game, 'timeout'), 14_900);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 19_200);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 21_400);
    expect(game.status).toBe('finished');

    const publicGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.winnerUserId).toBe('host-user');
    expect(replayTriviaGameModule.getWinnerUserId?.(game)).toBe('host-user');
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

  it('rejects missing and stale phase tokens before they can affect another phase or question', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: {
        questions: [
          createQuestion(),
          createQuestion({ id: 'q_2', correctChoiceIndex: 1 })
        ]
      },
      userId: 'host-user'
    }, 0);

    (['advance', 'answer', 'timeout'] as const).forEach((action) => {
      expect(() => replayTriviaGameModule.applyAction(game, {
        action,
        payload: action === 'answer' ? { choiceIndex: 0 } : {},
        userId: 'host-user'
      })).toThrowError(new ProtocolError(
        'invalid_action_context',
        'Replay Trivia actions must identify their phase.'
      ));
    });

    const firstCountdownAdvance = createReplayTriviaAction(game, 'advance');
    game = advanceReplayTriviaGame(game, firstCountdownAdvance, 3_000);
    const firstQuestionAnswer = createReplayTriviaAction(game, 'answer', { choiceIndex: 0 });
    const firstQuestionTimeout = createReplayTriviaAction(game, 'timeout');

    expect(() => advanceReplayTriviaGame(game, firstCountdownAdvance, 3_001)).toThrowError(new ProtocolError(
      'stale_action',
      'This Replay Trivia action belongs to an earlier question or phase.'
    ));

    game = answerReplayTriviaQuestion(game, firstQuestionAnswer, 4_000);
    game = answerReplayTriviaQuestion(
      game,
      createReplayTriviaAction(game, 'answer', { choiceIndex: 1 }, 'guest-user'),
      4_100
    );

    expect(() => timeoutReplayTriviaQuestion(game, firstQuestionTimeout, 14_900)).toThrowError(new ProtocolError(
      'stale_action',
      'This Replay Trivia action belongs to an earlier question or phase.'
    ));

    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 8_400);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 10_600);
    expect(game.status).toBe('countdown');
    expect(game.currentQuestionIndex).toBe(1);

    expect(() => advanceReplayTriviaGame(game, firstCountdownAdvance, 13_600)).toThrowError(new ProtocolError(
      'stale_action',
      'This Replay Trivia action belongs to an earlier question or phase.'
    ));
  });

  it('rejects unsupported actions, unsupported games, and invalid question packs', () => {
    const game = createReplayTriviaGame('game-1', 'host-user', 'guest-user');

    expect(() => replayTriviaGameModule.applyAction(game, {
      action: 'dance',
      userId: 'host-user'
    })).toThrowError(new ProtocolError('unsupported_action', 'Unsupported Replay Trivia action.'));
    expect(() => replayTriviaGameModule.applyAction({
      gameId: 'game-1',
      gameType: 'chess',
      gameVersion: PLAYGROUND_GAME_VERSIONS.chess,
      status: 'active'
    }, {
      action: 'advance',
      userId: 'host-user'
    })).toThrowError(new ProtocolError('unsupported_game', 'Expected a Replay Trivia game.'));
    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: {},
      userId: 'host-user'
    })).toThrowError(new ProtocolError('missing_questions', 'At least one Replay Trivia question is required.'));
    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: new Array(11).fill(createQuestion()) },
      userId: 'host-user'
    })).toThrowError(new ProtocolError('too_many_questions', 'At most 10 Replay Trivia questions are allowed.'));
    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: [createQuestion(), createQuestion()] },
      userId: 'host-user'
    })).toThrowError(new ProtocolError(
      'duplicate_question_id',
      'Replay Trivia question IDs must be unique.'
    ));
    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: [null] },
      userId: 'host-user'
    })).toThrowError(new ProtocolError('invalid_question', 'question must be an object.'));
    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: [{ ...createQuestion(), choices: ['one'] }] },
      userId: 'host-user'
    })).toThrowError(new ProtocolError('invalid_choices', 'Each Replay Trivia question must have four choices.'));
    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: [{ ...createQuestion(), correctChoiceIndex: 4 }] },
      userId: 'host-user'
    })).toThrowError(new ProtocolError('invalid_choice', 'Choice index must be 0, 1, 2, or 3.'));
    expect(() => submitReplayTriviaQuestions(game, {
      action: 'submitQuestions',
      payload: { questions: [{ ...createQuestion(), friendIntro: '   ' }] },
      userId: 'host-user'
    })).toThrowError(new ProtocolError('invalid_question', 'Replay Trivia questions must include friendIntro.'));
  });

  it('guards phase transitions until each timer has elapsed', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion(), createQuestion({ id: 'q_2', correctChoiceIndex: 1 })] },
      userId: 'host-user'
    }, 0);

    expect(() => advanceReplayTriviaGame(
      game,
      createReplayTriviaAction(game, 'advance'),
      2_999
    )).toThrowError(new ProtocolError('countdown_active', 'Countdown is still active.'));
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 3_000);
    expect(() => advanceReplayTriviaGame(
      game,
      createReplayTriviaAction(game, 'advance'),
      3_001
    )).toThrowError(new ProtocolError('cannot_advance', 'Replay Trivia cannot advance from this phase.'));

    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'host-user'
    }, 4_000);
    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'guest-user'
    }, 4_100);
    expect(() => advanceReplayTriviaGame(
      game,
      createReplayTriviaAction(game, 'advance'),
      8_399
    )).toThrowError(new ProtocolError('reveal_active', 'Reveal is still active.'));
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 8_400);
    expect(() => advanceReplayTriviaGame(
      game,
      createReplayTriviaAction(game, 'advance'),
      10_599
    )).toThrowError(new ProtocolError('score_active', 'Score is still active.'));
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 10_600);

    expect(game.status).toBe('countdown');
    expect(game.currentQuestionIndex).toBe(1);
  });

  it('handles timeout no-ops, deadline answers, locked answers, and non-player answers', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);

    expect(timeoutReplayTriviaQuestion(
      game,
      createReplayTriviaAction(game, 'timeout'),
      10_000
    )).toBe(game);
    expect(() => answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'host-user'
    }, 1_000)).toThrowError(new ProtocolError('not_answering', 'This round is not accepting answers.'));

    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 3_000);
    expect(() => answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'other-user'
    }, 4_000)).toThrowError(new ProtocolError('not_in_game', 'You are not a player in this game.'));

    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'host-user'
    }, 4_000);
    expect(() => answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 1
      },
      userId: 'host-user'
    }, 4_100)).toThrowError(new ProtocolError('answer_locked', 'Your answer is already locked.'));

    const revealed = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 1
      },
      userId: 'guest-user'
    }, 14_900);
    expect(revealed.status).toBe('reveal');
    expect(revealed.answers).toEqual({
      'host-user': 0
    });
  });

  it('publishes unanswered, tied, and guest-winning finished games', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'guest-user', 0), {
      action: 'submitQuestions',
      payload: {
        questions: [
          createQuestion(),
          createQuestion({ id: 'q_2', correctChoiceIndex: 1 })
        ]
      },
      userId: 'host-user'
    }, 0);

    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 3_000);
    game = timeoutReplayTriviaQuestion(game, createReplayTriviaAction(game, 'timeout'), 14_900);
    let publicGame = toPublicReplayTriviaGame(game, (userId) => ({ displayName: userId, userId }));
    expect(publicGame.answers).toEqual({});
    expect(publicGame.winnerUserId).toBeUndefined();

    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 19_200);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 21_400);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 24_400);
    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 0
      },
      userId: 'host-user'
    }, 25_000);
    game = answerReplayTriviaQuestion(game, {
      action: 'answer',
      payload: {
        ...expectedReplayTriviaPhase(game),
        choiceIndex: 1
      },
      userId: 'guest-user'
    }, 25_100);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 29_400);
    game = advanceReplayTriviaGame(game, createReplayTriviaAction(game, 'advance'), 31_600);

    publicGame = replayTriviaGameModule.toPublicGame(game, (userId) => ({ displayName: userId, userId })) as typeof publicGame;
    expect(publicGame.status).toBe('finished');
    expect(publicGame.winnerUserId).toBe('guest-user');
    expect(replayTriviaGameModule.getWinnerUserId?.(game)).toBe('guest-user');

    const tied = {
      ...game,
      scores: {
        guest: 1,
        host: 1
      }
    };
    expect(toPublicReplayTriviaGame(tied, (userId) => ({ displayName: userId, userId })).winnerUserId).toBeNull();
  });
});

function createQuestion(overrides: Partial<QuestionFixture> = {}): QuestionFixture {
  return {
    choices: ['God of War', 'Celeste', 'Monster Hunter', 'Red Dead Redemption 2'],
    correctChoiceIndex: 0,
    friendIntro: 'chat emergency, who won Game of the Year here?',
    id: 'q_1',
    prompt: 'Which game won Game of the Year in this segment?',
    rightReply: 'wow, you knew the trophy one.',
    wrongReply: 'you missed it. it was God of War.',
    ...overrides
  };
}

function expectedReplayTriviaPhase(game: {
  phaseStartedAt: number;
}) {
  return {
    expectedPhaseStartedAt: game.phaseStartedAt
  };
}

function createReplayTriviaAction(
  game: Parameters<typeof expectedReplayTriviaPhase>[0],
  action: string,
  payload: Record<string, unknown> = {},
  userId = 'host-user'
) {
  return {
    action,
    payload: {
      ...expectedReplayTriviaPhase(game),
      ...payload
    },
    userId
  };
}
