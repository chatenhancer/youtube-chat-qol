import { describe, expect, it, vi } from 'vitest';
import {
  COMPUTER_PLAYER_USER_ID,
  createReplayTriviaBotAnswerAction,
  createStockfishChessBotAction
} from './computer-player';
import { createChessGame } from '../games/chess';
import {
  advanceReplayTriviaGame,
  createReplayTriviaGame,
  submitReplayTriviaQuestions
} from '../games/replay-trivia';

vi.mock('./stockfish', () => ({
  getStockfishBestMove: vi.fn(() => Promise.resolve(null))
}));

describe('computer player', () => {
  it('creates chess move actions in the computer player', async () => {
    const game = createChessGame('game-1', COMPUTER_PLAYER_USER_ID, 'human-user');

    await expect(createStockfishChessBotAction(game, COMPUTER_PLAYER_USER_ID)).resolves.toEqual({
      action: 'move',
      payload: {
        from: expect.any(String),
        to: expect.any(String)
      },
      userId: COMPUTER_PLAYER_USER_ID
    });
  });

  it('creates deterministic Replay Trivia answers with the configured accuracy profile', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'bot-user', 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);
    game = advanceReplayTriviaGame(game, 3_000);

    expect(createReplayTriviaBotAnswerAction(game, 'bot-user', () => 0.1, 4_000)).toEqual({
      action: 'answer',
      payload: { choiceIndex: 0 },
      userId: 'bot-user'
    });

    const randomValues = [0.9, 0.99];
    expect(createReplayTriviaBotAnswerAction(game, 'bot-user', () => randomValues.shift() ?? 0, 4_000)).toEqual({
      action: 'answer',
      payload: { choiceIndex: 3 },
      userId: 'bot-user'
    });
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
