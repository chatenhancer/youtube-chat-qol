import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBountyHuntingBotAction,
  createComputerPlayerAction,
  createReplayTriviaBotAnswerAction,
  createStockfishChessBotAction,
  getComputerPlayerActionDelayMs,
  shouldComputerPlayerAct
} from './actions';
import {
  BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE,
  CHESS_COMPUTER_PLAYER_BEGINNER_PROFILE,
  CHESS_COMPUTER_PLAYER_CLUB_PROFILE,
  REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE,
  getChessComputerPlayerStockfishElo,
  isComputerPlayerUserId
} from './profiles';
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
    expect(CHESS_COMPUTER_PLAYER_BEGINNER_PROFILE).toEqual({
      availableGames: ['chess'],
      connectionId: 'server:computer:chess:beginner',
      displayName: 'Computer (Beginner)',
      userId: 'server:computer:chess:beginner'
    });
    expect(getChessComputerPlayerStockfishElo(CHESS_COMPUTER_PLAYER_BEGINNER_PROFILE.userId)).toBe(750);
  });

  it('uses one Bounty Hunting computer profile', () => {
    expect(BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE).toEqual({
      availableGames: ['bounty-hunting'],
      connectionId: 'server:computer:bounty-hunting',
      displayName: 'Computer (Bounty Hunter)',
      userId: 'server:computer:bounty-hunting'
    });
  });

  it('uses one Replay Trivia computer profile', () => {
    expect(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE).toEqual({
      availableGames: ['replay-trivia'],
      connectionId: 'server:computer:replay-trivia',
      displayName: 'Computer',
      userId: 'server:computer:replay-trivia'
    });
  });

  it('creates chess move actions from Stockfish in the computer player', async () => {
    getStockfishBestMoveMock.mockResolvedValueOnce(createStockfishResult({ from: 'e2', to: 'e4' }));
    const game = createChessGame('game-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user');

    await expect(createStockfishChessBotAction(game, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).resolves.toEqual({
      action: 'move',
      payload: {
        from: 'e2',
        to: 'e4'
      },
      userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
    });
  });

  it('creates chess promotion move actions without dropping the promotion piece', async () => {
    getStockfishBestMoveMock.mockResolvedValueOnce(createStockfishResult({
      from: 'e7',
      promotion: 'q',
      to: 'e8'
    }));
    const game = {
      ...createChessGame('game-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user'),
      fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1'
    };

    await expect(createStockfishChessBotAction(game, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).resolves.toEqual({
      action: 'move',
      payload: {
        from: 'e7',
        promotion: 'q',
        to: 'e8'
      },
      userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
    });
  });

  it('reports when Stockfish provides the chess bot move', async () => {
    const stockfishResult = createStockfishResult({ from: 'e2', to: 'e4' });
    const game = createChessGame('game-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user');
    const onStockfishFailure = vi.fn();
    const onStockfishMove = vi.fn();
    getStockfishBestMoveMock.mockResolvedValueOnce(stockfishResult);

    await createStockfishChessBotAction(game, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, onStockfishFailure, onStockfishMove);

    expect(onStockfishFailure).not.toHaveBeenCalled();
    expect(onStockfishMove).toHaveBeenCalledTimes(1);
    expect(onStockfishMove).toHaveBeenCalledWith(stockfishResult);
  });

  it('does not create a chess move when Stockfish returns no move', async () => {
    const game = createChessGame('game-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user');
    const onStockfishFailure = vi.fn();

    await expect(createStockfishChessBotAction(
      game,
      CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId,
      onStockfishFailure
    )).resolves.toBeNull();

    expect(onStockfishFailure).toHaveBeenCalledTimes(1);
    expect(onStockfishFailure).toHaveBeenCalledWith({
      reason: 'stockfish_no_move'
    });
  });

  it('does not create a chess move after a Stockfish error', async () => {
    const error = new Error('Stockfish failed.');
    const game = createChessGame('game-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user');
    const onStockfishFailure = vi.fn();
    getStockfishBestMoveMock.mockRejectedValueOnce(error);

    await expect(createStockfishChessBotAction(
      game,
      CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId,
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
      ...createChessGame('game-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user'),
      status: 'draw'
    };
    const waitingGame = createChessGame('game-2', 'human-user', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId);
    const unknownGame = {
      gameId: 'game-3',
      gameType: 'replay-trivia',
      status: 'question'
    } as GameRecord;

    await expect(createStockfishChessBotAction(inactiveGame, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).resolves.toBeNull();
    await expect(createStockfishChessBotAction(waitingGame, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).resolves.toBeNull();
    await expect(createStockfishChessBotAction(unknownGame, CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId)).resolves.toBeNull();
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
    let triviaGame = submitReplayTriviaQuestions(createReplayTriviaGame('trivia-1', 'host-user', REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId, 0), {
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
    expect(shouldComputerPlayerAct(triviaGame, REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId, 4_000)).toBe(true);
    expect(shouldComputerPlayerAct(triviaGame, REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId, 15_000)).toBe(false);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_000)).toBe(true);
    bountyGame = readyBountyHuntingPlayer(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_000);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_500)).toBe(false);
    bountyGame = readyBountyHuntingPlayer(bountyGame, 'host-user', 2_500);
    bountyGame = startBountyHuntingRound(bountyGame, 5_500);
    bountyGame = observeBountyHuntingMessage(bountyGame, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-question-1',
        messagePublishedAt: 5_500
      },
      userId: 'host-user'
    }, 6_000);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 7_000)).toBe(true);
    expect(shouldComputerPlayerAct(bountyGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 66_000)).toBe(false);
    expect(shouldComputerPlayerAct({
      gameId: 'unknown-1',
      gameType: 'unknown-game',
      players: { host: REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId },
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
    let bountyWitnessGame = submitBountyHunting(
      createBountyHuntingGame('bounty-witness-1', 'host-user', BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 0),
      {
        action: 'submitBounties',
        payload: { bounties: createBounties() },
        userId: 'host-user'
      },
      1_000
    );
    bountyWitnessGame = readyBountyHuntingPlayer(bountyWitnessGame, BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId, 2_000);
    bountyWitnessGame = readyBountyHuntingPlayer(bountyWitnessGame, 'host-user', 2_000);
    bountyWitnessGame = startBountyHuntingRound(bountyWitnessGame, 5_000);
    bountyWitnessGame = observeBountyHuntingMessage(bountyWitnessGame, {
      action: 'observeBountyMessage',
      payload: {
        bountyIds: ['question'],
        messageId: 'msg-question-1',
        messagePublishedAt: 5_500
      },
      userId: 'host-user'
    }, 6_000);

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
    expect(getComputerPlayerActionDelayMs(
      bountyWitnessGame,
      () => 0.5,
      BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    )).toBe(120);
    expect(getComputerPlayerActionDelayMs({
      gameId: 'unknown-1',
      gameType: 'unknown-game',
      status: 'active'
    } as unknown as GameRecord)).toBe(0);
  });

  it('dispatches computer actions for supported game types', async () => {
    const chessGame = createChessGame('chess-1', CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId, 'human-user');
    const stockfish = vi.fn(async () => createStockfishResult({ from: 'g1', to: 'f3' }));
    let triviaGame = submitReplayTriviaQuestions(createReplayTriviaGame('trivia-1', 'host-user', REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId, 0), {
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
      getStockfishBestMove: stockfish,
      userId: CHESS_COMPUTER_PLAYER_CLUB_PROFILE.userId
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
      userId: REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId
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
            messageId: 'msg-question-1',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1',
            messagePublishedAt: 5_600
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
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question-1',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1',
            messagePublishedAt: 5_600
          }
        ]
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    });
    bountyGame = observeBountyHuntingMessage(bountyGame, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question-1',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1',
            messagePublishedAt: 5_600
          }
        ]
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    }, 7_100);
    expect(createComputerPlayerAction(bountyGame, {
      now: 7_200,
      random: () => 0.1,
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    })).toEqual({
      action: 'claimBounty',
      payload: {
        bountyId: 'verified',
        messageId: 'msg-verified-1',
        messagePublishedAt: 5_600
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
            messageId: 'msg-question-1',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1',
            messagePublishedAt: 5_600
          }
        ]
      },
      userId: 'host-user'
    }, 6_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['question'],
            messageId: 'msg-question-1',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-1',
            messagePublishedAt: 5_600
          }
        ]
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    }, 6_100);

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
        messageId: 'msg-question-1',
        messagePublishedAt: 5_500
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    });
  });

  it('witnesses newer Bounty Hunting messages before old chat backlog', () => {
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
    const oldObservations = Array.from({ length: 21 }, (_, index) => ({
      bountyIds: ['question'],
      messageId: `msg-old-${String(index + 1).padStart(2, '0')}`,
      messagePublishedAt: 5_100 + index
    }));
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: { observations: oldObservations },
      userId: 'host-user'
    }, 6_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [{
          bountyIds: ['question'],
          messageId: 'msg-new-01',
          messagePublishedAt: 8_000
        }]
      },
      userId: 'host-user'
    }, 8_000);

    const action = createBountyHuntingBotAction(
      game,
      BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId,
      () => 0.1,
      8_200
    );
    const observations = action?.payload?.observations as Array<{ bountyIds: string[]; messageId: string }> | undefined;

    expect(action?.action).toBe('observeBountyMessage');
    expect(observations).toHaveLength(20);
    expect(observations?.[0]).toEqual({
      bountyIds: ['question'],
      messageId: 'msg-new-01',
      messagePublishedAt: 8_000
    });
    expect(observations?.map((observation) => observation.messageId)).not.toContain('msg-old-21');
  });

  it('prioritizes newer witnessed Bounty Hunting messages over older higher-value claims', () => {
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
        observations: [{
          bountyIds: ['verified'],
          messageId: 'msg-verified-old',
          messagePublishedAt: 5_500
        }]
      },
      userId: 'host-user'
    }, 6_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [{
          bountyIds: ['question'],
          messageId: 'msg-question-new',
          messagePublishedAt: 8_000
        }]
      },
      userId: 'host-user'
    }, 8_000);
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: {
        observations: [
          {
            bountyIds: ['verified'],
            messageId: 'msg-verified-old',
            messagePublishedAt: 5_500
          },
          {
            bountyIds: ['question'],
            messageId: 'msg-question-new',
            messagePublishedAt: 8_000
          }
        ]
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    }, 8_100);

    expect(createBountyHuntingBotAction(
      game,
      BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId,
      () => 0.1,
      8_200
    )).toEqual({
      action: 'claimBounty',
      payload: {
        bountyId: 'question',
        messageId: 'msg-question-new',
        messagePublishedAt: 8_000
      },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    });
  });

  it('keeps random Bounty Hunting claim fallback inside recent messages', () => {
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
    const observations = [
      { bountyIds: ['top-fan'], messageId: 'msg-old-top-fan', messagePublishedAt: 6_000 },
      { bountyIds: ['mention'], messageId: 'msg-recent-mention', messagePublishedAt: 7_000 },
      { bountyIds: ['emoji'], messageId: 'msg-recent-emoji', messagePublishedAt: 8_000 },
      { bountyIds: ['all-caps'], messageId: 'msg-recent-all-caps', messagePublishedAt: 9_000 },
      { bountyIds: ['verified'], messageId: 'msg-recent-verified', messagePublishedAt: 10_000 },
      { bountyIds: ['question'], messageId: 'msg-recent-question', messagePublishedAt: 11_000 }
    ];
    observations.forEach((observation, index) => {
      game = observeBountyHuntingMessage(game, {
        action: 'observeBountyMessage',
        payload: { observations: [observation] },
        userId: 'host-user'
      }, 6_000 + index * 1_000);
    });
    game = observeBountyHuntingMessage(game, {
      action: 'observeBountyMessage',
      payload: { observations },
      userId: BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId
    }, 12_000);

    const randomValues = [0.9, 0.99];
    expect(createBountyHuntingBotAction(
      game,
      BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE.userId,
      () => randomValues.shift() ?? 0,
      12_100
    )).toEqual({
      action: 'claimBounty',
      payload: {
        bountyId: 'mention',
        messageId: 'msg-recent-mention',
        messagePublishedAt: 7_000
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
    expect(isComputerPlayerUserId(REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE.userId)).toBe(true);
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
