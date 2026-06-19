import type { PublicGame, PublicUserIdentity } from '../../../../shared/playground/protocol';

export type ChessPieceColor = 'black' | 'white';
export type ChessPromotionPiece = 'b' | 'n' | 'q' | 'r';

export interface ChessLastMove {
  from: string;
  promotion?: ChessPromotionPiece;
  to: string;
}

export interface PublicChessGame extends PublicGame {
  fen: string;
  gameType: 'chess';
  lastMove?: ChessLastMove;
  lastMoveSan?: string;
  pgn: string;
  players: Record<ChessPieceColor, PublicUserIdentity>;
  status: 'active' | 'checkmate' | 'draw' | 'resigned';
  turn: ChessPieceColor;
  winner?: ChessPieceColor;
}
