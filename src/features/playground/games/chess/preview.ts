/**
 * Chess lobby preview.
 *
 * Draws a compact pixel-art board scene from the same assets used by the real
 * chess panel, so the game card does not depend on a separate baked thumbnail.
 */
import { ytcqCreateElement } from '../../../../shared/managed-dom';

const BOARD_PATH = 'games/chess/board.png';
const WHITE_PIECES_PATH = 'games/chess/white-pieces.png';
const BLACK_PIECES_PATH = 'games/chess/black-pieces.png';
const PREVIEW_WIDTH = 92;
const PREVIEW_HEIGHT = 48;
const BOARD_SIZE = 8;
const BOARD_PIXEL_SIZE = 224;
const TILE_SIZE = BOARD_PIXEL_SIZE / BOARD_SIZE;
const PIECE_SOURCE_SIZE = 32;
const PIECE_DRAW_SIZE = 32;
const PREVIEW_BOARD_ORIGIN = { x: 42, y: 60 };

type PreviewPieceColor = 'black' | 'white';
type PreviewPieceKind = 'bishop' | 'king' | 'knight' | 'pawn' | 'queen' | 'rook';

interface ChessPreviewAssets {
  blackPieces: HTMLImageElement;
  board: HTMLImageElement;
  whitePieces: HTMLImageElement;
}

interface ChessPreviewPiece {
  color: PreviewPieceColor;
  file: number;
  kind: PreviewPieceKind;
  rank: number;
}

const PIECE_SOURCE: Record<PreviewPieceKind, { x: number; y: number }> = {
  pawn: { x: 0, y: 0 },
  king: { x: 1, y: 0 },
  queen: { x: 0, y: 1 },
  bishop: { x: 1, y: 1 },
  knight: { x: 0, y: 2 },
  rook: { x: 1, y: 2 }
};

const PREVIEW_PIECES: readonly ChessPreviewPiece[] = [
  { color: 'black', file: 1, kind: 'knight', rank: 2 },
  { color: 'white', file: 3, kind: 'knight', rank: 2 },
  { color: 'black', file: 4, kind: 'knight', rank: 2 },
  { color: 'white', file: 5, kind: 'bishop', rank: 2 },
  { color: 'white', file: 2, kind: 'knight', rank: 3 },
  { color: 'white', file: 4, kind: 'bishop', rank: 3 },
  { color: 'white', file: 1, kind: 'pawn', rank: 4 },
  { color: 'white', file: 2, kind: 'pawn', rank: 4 }
];

let chessPreviewAssetsPromise: Promise<ChessPreviewAssets> | null = null;

export function renderChessPreview(container: HTMLElement): void {
  const canvas = ytcqCreateElement('canvas');
  canvas.className = 'ytcq-games-preview-canvas';
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  canvas.setAttribute('aria-hidden', 'true');
  container.append(canvas);

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    return;
  }
  if (!context) return;

  drawFallbackPreview(context);
  if (typeof Image === 'undefined') return;

  void getChessPreviewAssets().then((assets) => {
    drawChessPreview(context, assets);
  }).catch(() => undefined);
}

function drawChessPreview(context: CanvasRenderingContext2D, assets: ChessPreviewAssets): void {
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  context.drawImage(
    assets.board,
    PREVIEW_BOARD_ORIGIN.x,
    PREVIEW_BOARD_ORIGIN.y,
    PREVIEW_WIDTH,
    PREVIEW_HEIGHT,
    0,
    0,
    PREVIEW_WIDTH,
    PREVIEW_HEIGHT
  );
  drawBoardTint(context);

  PREVIEW_PIECES.forEach((piece) => {
    const source = PIECE_SOURCE[piece.kind];
    const image = piece.color === 'white' ? assets.whitePieces : assets.blackPieces;
    const boardX = piece.file * TILE_SIZE + ((TILE_SIZE - PIECE_DRAW_SIZE) / 2);
    const boardY = piece.rank * TILE_SIZE + ((TILE_SIZE - PIECE_DRAW_SIZE) / 2);
    context.drawImage(
      image,
      source.x * PIECE_SOURCE_SIZE,
      source.y * PIECE_SOURCE_SIZE,
      PIECE_SOURCE_SIZE,
      PIECE_SOURCE_SIZE,
      boardX - PREVIEW_BOARD_ORIGIN.x,
      boardY - PREVIEW_BOARD_ORIGIN.y,
      PIECE_DRAW_SIZE,
      PIECE_DRAW_SIZE
    );
  });
}

function drawFallbackPreview(context: CanvasRenderingContext2D): void {
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  context.fillStyle = '#e4c489';
  context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
  drawBoardTint(context);
}

function drawBoardTint(context: CanvasRenderingContext2D): void {
  for (let rank = 0; rank < BOARD_SIZE; rank += 1) {
    for (let file = 0; file < BOARD_SIZE; file += 1) {
      context.fillStyle = (file + rank) % 2 === 0
        ? 'rgba(228, 196, 137, 0.16)'
        : 'rgba(86, 62, 59, 0.64)';
      context.fillRect(
        file * TILE_SIZE - PREVIEW_BOARD_ORIGIN.x,
        rank * TILE_SIZE - PREVIEW_BOARD_ORIGIN.y,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }
}

function getChessPreviewAssets(): Promise<ChessPreviewAssets> {
  chessPreviewAssetsPromise ||= Promise.all([
    loadChessPreviewImage(chrome.runtime.getURL(BOARD_PATH)),
    loadChessPreviewImage(chrome.runtime.getURL(WHITE_PIECES_PATH)),
    loadChessPreviewImage(chrome.runtime.getURL(BLACK_PIECES_PATH))
  ]).then(([board, whitePieces, blackPieces]) => ({ blackPieces, board, whitePieces }));
  return chessPreviewAssetsPromise;
}

function loadChessPreviewImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
    if (image.complete) resolve(image);
  });
}
