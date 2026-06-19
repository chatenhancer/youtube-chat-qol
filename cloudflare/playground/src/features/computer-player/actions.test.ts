import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE,
  CHESS_COMPUTER_PLAYER_BEGINNER_PROFILE,
  CHESS_COMPUTER_PLAYER_CLUB_PROFILE,
  COMPUTER_PLAYER_USER_ID,
  createBountyHuntingBotAction,
  createComputerPlayerAction,
  createReplayTriviaBotAnswerAction,
  createStockfishChessBotAction,
  getComputerPlayerActionDelayMs,
  isComputerPlayerUserId,
  shouldComputerPlayerAct
} from './actions';
import { getStockfishBestMove } from '../../durable-objects/stockfish-container/client';
import { createChessGame } from '../../games/chess';
import {
  advanceReplayTriviaGame,
  createReplayTriviaGame,
  submitReplayTriviaQuestions
} from '../../games/replay-trivia';
import {
  createBountyHuntingGame,
  observeBountyHuntingMessage,
  readyBountyHuntingPlayer,
  startBountyHuntingRound,
  submitBountyHunting
} from '../../games/bounty-hunting';
import type { GameRecord } from '../../games/types';

vi.mock('../../durable-objects/stockfish-container/client', () => ({
  getStockfishBestMove: vi.fn(() => Promise.resolve(createStockfishResult(null)))
}));

describe('computer player', () => {
  const getStockfishBestMoveMock = vi.mocked(getStockfishBestMove);

  beforeEach(() => {
    getStockfishBestMoveMock.mockReset();
    getStockfishBestMoveMock.mockResolvedValue(createStockfishResult(null));
  });

  it('uses a 750 ELO Beginner chess profile', () => {
    expect(CHESS_COMPUTER_PLAYER_BEGINNER_PROFILE).toMatchObject({
      chessElo: 750,
      displayName: 'Computer (Beginner)',
      userId: 'server:computer:beginner'
    });
  });

  it('uses one Bounty Hunting computer profile', () => {
    expect(BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE).toEqual({
      availableGames: ['bounty-hunting'],
      connectionId: 'server:computer:bounty-hunter',
      displayName: 'Computer (Bounty Hunter)',
      userId: 'server:computer:bounty-hunter'
    });
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

  it('creates chess promotion move actions without dropping the promotion piece', async () => {
    getStockfishBestMoveMock.mockResolvedValueOnce(createStockfishResult({
      from: 'e7',
      promotion: 'q',
      to: 'e8'
    }));
    const game = {
      ...createChessGame('game-1', COMPUTER_PLAYER_USER_ID, 'human-user'),
      fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1'
    };

    await expect(createStockfishChessBotAction(game, COMPUTER_PLAYER_USER_ID)).resolves.toEqual({
      action: 'move',
      payload: {
        from: 'e7',
        promotion: 'q',
        to: 'e8'
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

  it('does not ask Stockfish when the game is not an active chess turn for the bot', async () => {
    const inactiveGame = {
      ...createChessGame('game-1', COMPUTER_PLAYER_USER_ID, 'human-user'),
      status: 'draw'
    };
    const waitingGame = createChessGame('game-2', 'human-user', COMPUTER_PLAYER_USER_ID);
    const unknownGame = {
      gameId: 'game-3',
      gameType: 'replay-trivia',
      status: 'question'
    } as GameRecord;

    await expect(createStockfishChessBotAction(inactiveGame, COMPUTER_PLAYER_USER_ID)).resolves.toBeNull();
    await expect(createStockfishChessBotAction(waitingGame, COMPUTER_PLAYER_USER_ID)).resolves.toBeNull();
    await expect(createStockfishChessBotAction(unknownGame, COMPUTER_PLAYER_USER_ID)).resolves.toBeNull();
    expect(getStockfishBestMoveMock).not.toHaveBeenCalled();
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

  it('checks whether the configured computer profiles should act for current game state', () => {
    const activeChess = createChessGame('chess-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user');
    const waitingChess = createChessGame('chess-2', 'human-user', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId);
    const finishedChess = {
      ...activeChess,
      status: 'checkmate'
    };
    let triviaGame = submitReplayTriviaQuestions(createReplayTriviaGame('trivia-1', 'host-user', COMPUTER_PLAYER_USER_ID, 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);
    triviaGame = advanceReplayTriviaGame(triviaGame, 3_000);
    let bountyGame = submitBountyHunting(
      createBountyHuntingGame('bounty-1', 'host-user', BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 0),
      {
        action: 'submitBounties',
        payload: { bounties: createBounties() },
        userId: 'host-user'
      },
      1_000
    );

    expect(shouldComputerPlayerAct(activeChess, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).toBe(true);
    expect(shouldComputerPlayerAct(waitingChess, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).toBe(false);
    expect(shouldComputerPlayerAct(finishedChess, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).toBe(false);
    expect(shouldComputerPlayerAct(triviaGame, COMPUTER_PLAYER_USER_ID, 4_000)).toBe(true);
    expect(shouldComputerPlayerAct(triviaGame, COMPUTER_PLAYER_USER_ID, 15_000)).toBe(false);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_000)).toBe(true);
    bountyGame = readyBountyHuntingPlayer(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_000);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_500)).toBe(false);
    bountyGame = readyBountyHuntingPlayer(bountyGame, 'host-user', 2_500);
    bountyGame = startBountyHuntingRound(bountyGame, 5_500);
    bountyGame = observeBountyHuntingMessage(bountyGame, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-question-1'
      },
      userId: 'host-user'
    }, 6_000);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 7_000)).toBe(true);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 66_000)).toBe(false);
    expect(shouldComputerPlayerAct({
      gameId: 'unknown-1',
      gameType: 'unknown-game',
      players: { host: COMPUTER_PLAYER_USER_ID },
      status: 'active'
    } as unknown as GameRecord)).toBe(false);
    expect(shouldComputerPlayerAct({
      gameId: 'malformed-1',
      gameType: 'chess',
      players: null,
      status: 'active'
    } as unknown as GameRecord)).toBe(false);
    expect(shouldComputerPlayerAct({
      gameId: 'malformed-2',
      gameType: 'chess',
      players: ['not', 'a', 'map'],
      status: 'active'
    } as unknown as GameRecord)).toBe(false);
  });

  it('computes deterministic computer action delays by game type', () => {
    expect(getComputerPlayerActionDelayMs({
      gameId: 'chess-1',
      gameType: 'chess',
      status: 'active'
    }, () => 0)).toBe(700);
    expect(getComputerPlayerActionDelayMs({
      gameId: 'chess-1',
      gameType: 'chess',
      status: 'active'
    }, () => 1)).toBe(1_500);
    expect(getComputerPlayerActionDelayMs({
      gameId: 'trivia-1',
      gameType: 'replay-trivia',
      status: 'question'
    }, () => 0.5)).toBe(3_650);
    expect(getComputerPlayerActionDelayMs({
      gameId: 'bounty-1',
      gameType: 'bounty-hunting',
      status: 'active'
    }, () => 0.5)).toBe(2_400);
    expect(getComputerPlayerActionDelayMs({
      gameId: 'unknown-1',
      gameType: 'unknown-game',
      status: 'active'
    } as unknown as GameRecord)).toBe(0);
  });

  it('dispatches computer actions for supported game types', async () => {
    const chessGame = createChessGame('chess-1', COMPUTER_PLAYER_USER_ID, 'human-user');
    const stockfish = vi.fn(async () => createStockfishResult({ from: 'g1', to: 'f3' }));
    let triviaGame = submitReplayTriviaQuestions(createReplayTriviaGame('trivia-1', 'host-user', COMPUTER_PLAYER_USER_ID, 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);
    triviaGame = advanceReplayTriviaGame(triviaGame, 3_000);
    let bountyGame = submitBountyHunting(
      createBountyHuntingGame('bounty-1', 'host-user', BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 0),
      {
        action: 'submitBounties',
        payload: { bounties: createBounties() },
        userId: 'host-user'
      },
      1_000
    );

    await expect(createComputerPlayerAction(chessGame, {
      getStockfishBestMove: stockfish
    })).resolves.toMatchObject({
      action: 'move',
      payload: {
        from: 'g1',
        to: 'f3'
      }
    });
    expect(createComputerPlayerAction(triviaGame, {
      now: 4_000,
      random: () => 0.1
    })).toEqual({
      action: 'answer',
      payload: { choiceIndex: 0 },
      userId: COMPUTER_PLAYER_USER_ID
    });
    expect(createComputerPlayerAction(bountyGame, {
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    })).toEqual({
      action: 'ready',
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    });
    bountyGame = readyBountyHuntingPlayer(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_000);
    bountyGame = readyBountyHuntingPlayer(bountyGame, 'host-user', 2_000);
    bountyGame = startBountyHuntingRound(bountyGame, 5_000);
    bountyGame = observeBountyHuntingMessage(bountyGame, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question-1'
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1'
          }
        ]
      },
      userId: 'host-user'
    }, 6_000);
    expect(createComputerPlayerAction(bountyGame, {
      now: 7_000,
      random: () => 0.1,
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    })).toEqual({
      action: 'claimBounty',
      payload: {
        bountyId: 'verified',
        messageId: 'msg-verified-1'
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    });
    expect(createComputerPlayerAction({
      gameId: 'unknown-1',
      gameType: 'unknown-game',
      status: 'active'
    } as unknown as GameRecord)).toBeNull();
  });

  it('sometimes chooses a lower-value witnessed Bounty Hunting claim', () => {
    let game = submitBountyHunting(
      createBountyHuntingGame('bounty-1', 'host-user', BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 0),
      {
        action: 'submitBounties',
        payload: { bounties: createBounties() },
        userId: 'host-user'
      },
      1_000
    );
    game = readyBountyHuntingPlayer(game, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_000);
    game = readyBountyHuntingPlayer(game, 'host-user', 2_000);
    game = startBountyHuntingRound(game, 5_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question-1'
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1'
          }
        ]
      },
      userId: 'host-user'
    }, 6_000);

    const randomValues = [0.9, 0];
    expect(createBountyHuntingBotAction(
      game,
      BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId,
      () => randomValues.shift() ?? 0,
      7_000
    )).toEqual({
      action: 'claimBounty',
      payload: {
        bountyId: 'question',
        messageId: 'msg-question-1'
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    });
  });

  it('does not answer Replay Trivia when the bot is not eligible', () => {
    let game = submitReplayTriviaQuestions(createReplayTriviaGame('game-1', 'host-user', 'bot-user', 0), {
      action: 'submitQuestions',
      payload: { questions: [createQuestion()] },
      userId: 'host-user'
    }, 0);
    game = advanceReplayTriviaGame(game, 3_000);

    expect(createReplayTriviaBotAnswerAction({
      ...game,
      status: 'reveal'
    }, 'bot-user', () => 0.1, 4_000)).toBeNull();
    expect(createReplayTriviaBotAnswerAction(game, 'bot-user', () => 0.1, 15_000)).toBeNull();
    expect(createReplayTriviaBotAnswerAction({
      ...game,
      answers: { 'bot-user': 0 }
    } as unknown as GameRecord, 'bot-user', () => 0.1, 4_000)).toBeNull();
    expect(createReplayTriviaBotAnswerAction(game, 'spectator-user', () => 0.1, 4_000)).toBeNull();
    expect(createReplayTriviaBotAnswerAction({
      ...game,
      questions: []
    } as unknown as GameRecord, 'bot-user', () => 0.1, 4_000)).toBeNull();
    expect(createReplayTriviaBotAnswerAction({
      gameId: 'chess-1',
      gameType: 'chess',
      status: 'active'
    } as GameRecord, 'bot-user', () => 0.1, 4_000)).toBeNull();
  });

  it('recognizes every built-in computer player profile user id', () => {
    expect(isComputerPlayerUserId(COMPUTER_PLAYER_USER_ID)).toBe(true);
    expect(isComputerPlayerUserId(BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId)).toBe(true);
    expect(isComputerPlayerUserId(CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).toBe(true);
    expect(isComputerPlayerUserId('human-user')).toBe(false);
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

function createBounties() {
  return [
    {
      amount: 50,
      description: 'a message that asks a question',
      id: 'question',
      matcher: { kind: 'question' }
    },
    {
      amount: 75,
      description: 'a message by a verified account',
      id: 'verified',
      matcher: { kind: 'verifiedAuthor' }
    },
    {
      amount: 100,
      description: 'a message in all caps',
      id: 'all-caps',
      matcher: { kind: 'allCaps' }
    },
    {
      amount: 125,
      description: 'a message with 3+ emojis',
      id: 'emoji',
      matcher: { kind: 'emojiCount', min: 3 }
    },
    {
      amount: 150,
      description: 'a message that mentions a user',
      id: 'mention',
      matcher: { kind: 'mention' }
    },
    {
      amount: 175,
      description: 'a message from a top fan',
      id: 'top-fan',
      matcher: { kind: 'topFanAuthor' }
    }
  ];
}

function createStockfishResult(move: { from: string; promotion?: 'b' | 'n' | 'q' | 'r'; to: string } | null) {
  return {
    elapsedMs: 512,
    elo: 1700,
    fenHash: 'h_testfen',
    move,
    moveTimeMs: 500
  };
}
