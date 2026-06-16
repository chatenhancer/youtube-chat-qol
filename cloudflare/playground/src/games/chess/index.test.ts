import { describe, expect, it } from 'vitest';
import {
  applyChessMove,
  type ChessGameRecord,
  chessGameModule,
  createChessGame,
  getChessWinnerUserId,
  resignChessGame,
  toPublicChessGame,
  type PublicChessGame
} from './index';
import { ProtocolError } from '../../protocol/validation';

describe('playground chess game rules', () => {
  it('creates a new chess game with white to move', () => {
    const game = createChessGame('game-1', 'white-user', 'black-user');

    expect(game.status).toBe('active');
    expect(game.gameType).toBe('chess');
    expect(game.turn).toBe('white');
    expect(game.players.white).toBe('white-user');
    expect(game.players.black).toBe('black-user');
  });

  it('applies a legal move and advances the turn', () => {
    const game = createChessGame('game-1', 'white-user', 'black-user');
    const nextGame = applyChessMove(game, {
      from: 'e2',
      to: 'e4',
      userId: 'white-user'
    });

    expect(nextGame.turn).toBe('black');
    expect(nextGame.lastMoveSan).toBe('e4');
    expect(nextGame.pgn).toContain('1. e4');
  });

  it('rejects a move from the wrong player', () => {
    const game = createChessGame('game-1', 'white-user', 'black-user');

    expect(() => applyChessMove(game, {
      from: 'e7',
      to: 'e5',
      userId: 'black-user'
    })).toThrowError(new ProtocolError('not_your_turn', 'It is not your turn.'));
  });

  it('rejects illegal chess moves', () => {
    const game = createChessGame('game-1', 'white-user', 'black-user');

    expect(() => applyChessMove(game, {
      from: 'e2',
      to: 'e5',
      userId: 'white-user'
    })).toThrowError(new ProtocolError('invalid_move', 'That chess move is not legal.'));
  });

  it('detects checkmate and assigns the winner', () => {
    let game = createChessGame('game-1', 'white-user', 'black-user');
    game = applyChessMove(game, { from: 'f2', to: 'f3', userId: 'white-user' });
    game = applyChessMove(game, { from: 'e7', to: 'e5', userId: 'black-user' });
    game = applyChessMove(game, { from: 'g2', to: 'g4', userId: 'white-user' });
    game = applyChessMove(game, { from: 'd8', to: 'h4', userId: 'black-user' });

    expect(game.status).toBe('checkmate');
    expect(game.winner).toBe('black');
    expect(game.lastMoveSan).toBe('Qh4#');
  });

  it('rejects moves after a chess game has finished', () => {
    const game = {
      ...createChessGame('game-1', 'white-user', 'black-user'),
      status: 'draw'
    } as ChessGameRecord;

    expect(() => applyChessMove(game, {
      from: 'e2',
      to: 'e4',
      userId: 'white-user'
    })).toThrowError(new ProtocolError('game_finished', 'This chess game is already finished.'));
  });

  it('detects draw positions after legal moves', () => {
    const game = {
      ...createChessGame('game-1', 'white-user', 'black-user'),
      fen: '8/8/8/8/8/8/8/K6k w - - 0 1',
      pgn: '',
      turn: 'white'
    } as ChessGameRecord;

    const nextGame = applyChessMove(game, {
      from: 'a1',
      to: 'a2',
      userId: 'white-user'
    });

    expect(nextGame.status).toBe('draw');
  });

  it('marks the opponent as winner when a player resigns', () => {
    const game = createChessGame('game-1', 'white-user', 'black-user');
    const nextGame = resignChessGame(game, 'white-user');

    expect(nextGame.status).toBe('resigned');
    expect(nextGame.winner).toBe('black');

    expect(resignChessGame(game, 'black-user').winner).toBe('white');
    expect(() => resignChessGame(game, 'spectator-user')).toThrowError(new ProtocolError('not_in_game', 'You are not a player in this game.'));
  });

  it('serializes public chess game state with public user identities', () => {
    const game = createChessGame('game-1', 'white-user', 'black-user');
    const publicGame = toPublicChessGame(game, (userId) => ({
      displayName: userId === 'white-user' ? 'White player' : 'Black player',
      userId
    }));

    expect(publicGame.players.white.displayName).toBe('White player');
    expect(publicGame.players.black.displayName).toBe('Black player');
    expect(publicGame.fen).toBe(game.fen);
    expect(publicGame.gameType).toBe('chess');
  });

  it('handles chess actions through the game module interface', () => {
    const game = chessGameModule.createGame('game-1', ['white-user', 'black-user']);
    const nextGame = chessGameModule.applyAction(game, {
      action: 'move',
      payload: {
        from: 'E2',
        to: 'e4'
      },
      userId: 'white-user'
    });

    expect(nextGame.status).toBe('active');
    expect(chessGameModule.getRecipientUserIds(nextGame)).toEqual(['white-user', 'black-user']);
    expect(chessGameModule.canUserAccessGame(nextGame, 'white-user')).toBe(true);
    expect(chessGameModule.canUserAccessGame(nextGame, 'other-user')).toBe(false);
    expect(chessGameModule.getWinnerUserId?.(nextGame)).toBeNull();
  });

  it('handles resign actions through the game module interface', () => {
    const game = chessGameModule.createGame('game-1', ['white-user', 'black-user']);
    const nextGame = chessGameModule.applyAction(game, {
      action: 'resign',
      userId: 'black-user'
    });
    const publicGame = chessGameModule.toPublicGame(
      nextGame,
      (userId) => ({ displayName: userId, userId })
    ) as PublicChessGame;

    expect(nextGame.status).toBe('resigned');
    expect(publicGame.winner).toBe('white');
    expect(chessGameModule.getWinnerUserId?.(nextGame)).toBe('white-user');
  });

  it('rejects invalid chess actions through the game module interface', () => {
    const game = chessGameModule.createGame('game-1', ['white-user', 'black-user']);

    expect(() => chessGameModule.applyAction({
      ...game,
      gameType: 'replay-trivia'
    }, {
      action: 'move',
      payload: {
        from: 'e2',
        to: 'e4'
      },
      userId: 'white-user'
    })).toThrowError(new ProtocolError('unsupported_game', 'Expected a chess game.'));

    expect(() => chessGameModule.applyAction(game, {
      action: 'move',
      userId: 'white-user'
    })).toThrowError(new ProtocolError('invalid_square', 'from must be a chess square.'));

    expect(() => chessGameModule.applyAction(game, {
      action: 'move',
      payload: {
        from: 12,
        to: 'e4'
      },
      userId: 'white-user'
    })).toThrowError(new ProtocolError('invalid_square', 'from must be a chess square.'));

    expect(() => chessGameModule.applyAction(game, {
      action: 'move',
      payload: {
        from: 'e9',
        to: 'e4'
      },
      userId: 'white-user'
    })).toThrowError(new ProtocolError('invalid_square', 'from must be a chess square.'));

    expect(() => chessGameModule.applyAction(game, {
      action: 'move',
      payload: {
        from: 'e2',
        promotion: 'king',
        to: 'e4'
      },
      userId: 'white-user'
    })).toThrowError(new ProtocolError('invalid_promotion', 'Promotion must be b, n, q, or r.'));

    expect(() => chessGameModule.applyAction(game, {
      action: 'castleTheBoard',
      userId: 'white-user'
    })).toThrowError(new ProtocolError('unsupported_action', 'Unsupported chess action.'));
  });

  it('accepts promotion values through module move payloads and handles missing winner records', () => {
    const game = {
      ...createChessGame('game-1', 'white-user', 'black-user'),
      fen: '8/P7/8/8/8/8/8/k6K w - - 0 1',
      pgn: '',
      turn: 'white'
    } as ChessGameRecord;

    const promoted = chessGameModule.applyAction(game, {
      action: 'move',
      payload: {
        from: 'a7',
        promotion: 'q',
        to: 'a8'
      },
      userId: 'white-user'
    }) as ChessGameRecord;

    expect(promoted.lastMoveSan).toContain('=Q');
    expect(getChessWinnerUserId({
      ...game,
      winner: 'white'
    })).toBe('white-user');
    expect(getChessWinnerUserId({
      ...game,
      players: {
        black: 'black-user'
      } as ChessGameRecord['players'],
      winner: 'white'
    })).toBeNull();
  });
});
