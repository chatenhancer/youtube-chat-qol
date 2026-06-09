import { Chess } from 'chess.js';
import type { PublicGame, PublicUserIdentity } from '../protocol/messages';
import { ProtocolError } from '../protocol/validation';
import type { GameActionInput, GameModule, GameRecord } from './types';

export type PlayerColor = 'black' | 'white';
export type ChessGameStatus = 'active' | 'checkmate' | 'draw' | 'resigned';

export interface PublicChessGame extends PublicGame {
  fen: string;
  gameType: 'chess';
  lastMoveSan?: string;
  pgn: string;
  players: Record<PlayerColor, PublicUserIdentity>;
  status: ChessGameStatus;
  turn: PlayerColor;
  winner?: PlayerColor;
}

export interface ChessGameRecord extends GameRecord {
  fen: string;
  gameType: 'chess';
  lastMoveSan?: string;
  pgn: string;
  players: Record<PlayerColor, string>;
  status: ChessGameStatus;
  turn: PlayerColor;
  winner?: PlayerColor;
}

export interface ChessMoveInput {
  from: string;
  promotion?: 'b' | 'n' | 'q' | 'r';
  to: string;
  userId: string;
}

export const chessGameModule: GameModule = {
  applyAction(game, input) {
    const chessGame = assertChessGame(game);
    switch (input.action) {
      case 'move':
        return applyChessMove(chessGame, parseChessMoveInput(input));
      case 'resign':
        return resignChessGame(chessGame, input.userId);
      default:
        throw new ProtocolError('unsupported_action', 'Unsupported chess action.');
    }
  },
  canUserAccessGame(game, userId) {
    return canSeeChessGame(assertChessGame(game), userId);
  },
  createGame(gameId, playerUserIds) {
    return createChessGame(gameId, playerUserIds[0], playerUserIds[1]);
  },
  getRecipientUserIds(game) {
    const chessGame = assertChessGame(game);
    return [chessGame.players.white, chessGame.players.black];
  },
  toPublicGame(game, getUser) {
    return toPublicChessGame(assertChessGame(game), getUser);
  }
};

export function createChessGame(gameId: string, whiteUserId: string, blackUserId: string): ChessGameRecord {
  const chess = new Chess();
  return {
    fen: chess.fen(),
    gameType: 'chess',
    gameId,
    pgn: chess.pgn(),
    players: {
      black: blackUserId,
      white: whiteUserId
    },
    status: 'active',
    turn: 'white'
  };
}

export function applyChessMove(game: ChessGameRecord, input: ChessMoveInput): ChessGameRecord {
  if (game.status !== 'active') throw new ProtocolError('game_finished', 'This chess game is already finished.');

  const expectedUserId = game.players[game.turn];
  if (input.userId !== expectedUserId) {
    throw new ProtocolError('not_your_turn', 'It is not your turn.');
  }

  const chess = new Chess(game.fen);
  let move;
  try {
    move = chess.move({
      from: input.from,
      promotion: input.promotion,
      to: input.to
    });
  } catch {
    throw new ProtocolError('invalid_move', 'That chess move is not legal.');
  }

  const nextGame: ChessGameRecord = {
    ...game,
    fen: chess.fen(),
    lastMoveSan: move.san,
    pgn: chess.pgn(),
    turn: chess.turn() === 'w' ? 'white' : 'black'
  };

  if (chess.isCheckmate()) {
    nextGame.status = 'checkmate';
    nextGame.winner = game.turn;
  } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
    nextGame.status = 'draw';
  }

  return nextGame;
}

export function resignChessGame(game: ChessGameRecord, userId: string): ChessGameRecord {
  const color = getPlayerColor(game, userId);
  const winner = color === 'white' ? 'black' : 'white';

  return {
    ...game,
    status: 'resigned',
    winner
  };
}

export function getPlayerColor(game: ChessGameRecord, userId: string): PlayerColor {
  if (game.players.white === userId) return 'white';
  if (game.players.black === userId) return 'black';
  throw new ProtocolError('not_in_game', 'You are not a player in this game.');
}

export function canSeeChessGame(game: ChessGameRecord, userId: string): boolean {
  return game.players.white === userId || game.players.black === userId;
}

export function toPublicChessGame(
  game: ChessGameRecord,
  getUser: (userId: string) => PublicUserIdentity
): PublicChessGame {
  return {
    fen: game.fen,
    gameType: 'chess',
    gameId: game.gameId,
    lastMoveSan: game.lastMoveSan,
    pgn: game.pgn,
    players: {
      black: getUser(game.players.black),
      white: getUser(game.players.white)
    },
    status: game.status,
    turn: game.turn,
    winner: game.winner
  };
}

function assertChessGame(game: GameRecord): ChessGameRecord {
  if (game.gameType !== 'chess') throw new ProtocolError('unsupported_game', 'Expected a chess game.');
  return game as ChessGameRecord;
}

function parseChessMoveInput(input: GameActionInput): ChessMoveInput {
  const payload = input.payload || {};
  return {
    from: getChessSquare(payload, 'from'),
    promotion: getPromotion(payload.promotion),
    to: getChessSquare(payload, 'to'),
    userId: input.userId
  };
}

function getChessSquare(value: Record<string, unknown>, key: string): string {
  const text = value[key];
  if (typeof text !== 'string') throw new ProtocolError('invalid_square', `${key} must be a chess square.`);
  const square = text.trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(square)) throw new ProtocolError('invalid_square', `${key} must be a chess square.`);
  return square;
}

function getPromotion(value: unknown): 'b' | 'n' | 'q' | 'r' | undefined {
  if (value === undefined) return undefined;
  if (value === 'b' || value === 'n' || value === 'q' || value === 'r') return value;
  throw new ProtocolError('invalid_promotion', 'Promotion must be b, n, q, or r.');
}
