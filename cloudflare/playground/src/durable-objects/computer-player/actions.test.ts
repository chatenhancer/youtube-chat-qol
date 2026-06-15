import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPUTER_PLAYER_USER_ID,
  createReplayTriviaBotAnswerAction,
  createStockfishChessBotAction
} from './actions';
import { getStockfishBestMove } from '../stockfish-container/client';
import { createChessGame } from '../../games/chess';
import {
  advanceReplayTriviaGame,
  createReplayTriviaGame,
  submitReplayTriviaQuestions
} from '../../games/replay-trivia';

vi.mock('../stockfish-container/client', () => ({
  getStockfishBestMove: vi.fn(() => Promise.resolve(createStockfishResult(null)))
}));

describe('computer player', () => {
  const getStockfishBestMoveMock = vi.mocked(getStockfishBestMove);

  beforeEach(() => {
    getStockfishBestMoveMock.mockResolvedValue(createStockfishResult(null));
  });

  it('creates chess move actions from Stockfish in the computer player', async () => {
    getStockfishBestMoveMock.mockResolvedValueOnce(createStockfishResult({ from: 'e2', to: 'e4' }));
    const game = createChessGame('game-1', COMPUTER_PLAYER_USER_ID, 'human-user');

    await expect(createStockfishChessBotAction(game, COMPUTER_PLAYER_USER_ID)).resolves.toEqual({
      action: 'move',
      payload: {
        from: 'e2',
        to: 'e4'
      },
      userId: COMPUTER_PLAYER_USER_ID
    });
  });

  it('reports when Stockfish provides the chess bot move', async () => {
    const stockfishResult = createStockfishResult({ from: 'e2', to: 'e4' });
    const game = createChessGame('game-1', COMPUTER_PLAYER_USER_ID, 'human-user');
    const onStockfishFailure = vi.fn();
    const onStockfishMove = vi.fn();
    getStockfishBestMoveMock.mockResolvedValueOnce(stockfishResult);

    await createStockfishChessBotAction(game, COMPUTER_PLAYER_USER_ID, onStockfishFailure, onStockfishMove);

    expect(onStockfishFailure).not.toHaveBeenCalled();
    expect(onStockfishMove).toHaveBeenCalledTimes(1);
    expect(onStockfishMove).toHaveBeenCalledWith(stockfishResult);
  });

  it('does not create a chess move when Stockfish returns no move', async () => {
    const game = createChessGame('game-1', COMPUTER_PLAYER_USER_ID, 'human-user');
    const onStockfishFailure = vi.fn();

    await expect(createStockfishChessBotAction(
      game,
      COMPUTER_PLAYER_USER_ID,
      onStockfishFailure
    )).resolves.toBeNull();

    expect(onStockfishFailure).toHaveBeenCalledTimes(1);
    expect(onStockfishFailure).toHaveBeenCalledWith({
      reason: 'stockfish_no_move'
    });
  });

  it('does not create a chess move after a Stockfish error', async () => {
    const error = new Error('Stockfish failed.');
    const game = createChessGame('game-1', COMPUTER_PLAYER_USER_ID, 'human-user');
    const onStockfishFailure = vi.fn();
    getStockfishBestMoveMock.mockRejectedValueOnce(error);

    await expect(createStockfishChessBotAction(
      game,
      COMPUTER_PLAYER_USER_ID,
      onStockfishFailure
    )).resolves.toBeNull();

    expect(onStockfishFailure).toHaveBeenCalledTimes(1);
    expect(onStockfishFailure).toHaveBeenCalledWith({
      error,
      reason: 'stockfish_error'
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

function createStockfishResult(move: { from: string; to: string } | null) {
  return {
    elapsedMs: 512,
    elo: 1700,
    fenHash: 'h_testfen',
    move,
    moveTimeMs: 500
  };
}
