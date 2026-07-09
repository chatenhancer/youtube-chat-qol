/**
 * Chess game panel.
 *
 * Renders the draggable chess board canvas, handles local click/hover feedback,
 * plays move sounds, and emits validated move intents back to the chess adapter.
 */
import { Chess, type Move, type Square } from 'chess.js';
import { t } from '../../../../shared/i18n';
import { jsx, el } from '../../../../shared/jsx-dom';
import {
  showGamePanelFeedbackBubble,
  type GamePanelStatusMessage,
  type GamePanelStatusOverlay,
  toGamePanelStatusMessage
} from '../panel-feedback';
import type { GamePanelShell } from '../panel-shell';
import { createGameSoundController, type GameSoundController } from '../sound';
import type { ChessLastMove, ChessPieceColor, ChessPromotionPiece, PublicChessGame } from './types';

const BOARD_PATH = 'games/chess/board.png';
const CAPTURE_SOUND_PATH = 'games/chess/capture.mp3';
const MOVE_SOUND_PATH = 'games/chess/move.mp3';
const CHESS_SOUND_PATHS = [MOVE_SOUND_PATH, CAPTURE_SOUND_PATH] as const;
const WHITE_PIECES_PATH = 'games/chess/white-pieces.png';
const BLACK_PIECES_PATH = 'games/chess/black-pieces.png';
const BOARD_SIZE = 8;
const CANVAS_CSS_SIZE = 224;
const LEGAL_CAPTURE_RING_RADIUS = 11;
const LEGAL_MOVE_DOT_RADIUS = 4;
const PIECE_SOURCE_SIZE = 32;
const PIECE_DRAW_SIZE = 32;

type PieceColor = ChessPieceColor;
type PieceKind = 'bishop' | 'king' | 'knight' | 'pawn' | 'queen' | 'rook';
type PromotionPiece = ChessPromotionPiece;
type BoardSquare = { x: number; y: number };
type PromotionPickerOption = BoardSquare & { piece: PromotionPiece };
type LegalMoveHint = BoardSquare & { capture: boolean };

interface ChessPiece {
  color: PieceColor;
  kind: PieceKind;
  x: number;
  y: number;
}

interface ChessAssets {
  blackPieces: HTMLImageElement;
  board: HTMLImageElement;
  whitePieces: HTMLImageElement;
}

interface ChessGamePanelRuntime {
  assets: ChessAssets | null;
  canvas: HTMLCanvasElement;
  currentUserId: string;
  game: PublicChessGame;
  hoverPromotionPiece: PromotionPiece | null;
  hoverSquare: BoardSquare | null;
  listeners: AbortController;
  onMove: (gameId: string, from: string, to: string, promotion?: PromotionPiece) => void;
  onVisibilityChanged: (() => void) | null;
  pendingPromotion: PendingPromotion | null;
  pixelRatio: number;
  selectedSquare: BoardSquare | null;
  soundController: GameSoundController;
  statusOverlay: GamePanelStatusOverlay;
  subtitleElement: HTMLElement;
}

interface PendingPromotion {
  color: PieceColor;
  from: string;
  pieces: PromotionPiece[];
  to: string;
}

const PIECE_SOURCE: Record<PieceKind, { x: number; y: number }> = {
  pawn: { x: 0, y: 0 },
  king: { x: 1, y: 0 },
  queen: { x: 0, y: 1 },
  bishop: { x: 1, y: 1 },
  knight: { x: 0, y: 2 },
  rook: { x: 1, y: 2 }
};

const PIECE_BY_FEN: Record<string, { color: PieceColor; kind: PieceKind }> = {
  b: { color: 'black', kind: 'bishop' },
  k: { color: 'black', kind: 'king' },
  n: { color: 'black', kind: 'knight' },
  p: { color: 'black', kind: 'pawn' },
  q: { color: 'black', kind: 'queen' },
  r: { color: 'black', kind: 'rook' },
  B: { color: 'white', kind: 'bishop' },
  K: { color: 'white', kind: 'king' },
  N: { color: 'white', kind: 'knight' },
  P: { color: 'white', kind: 'pawn' },
  Q: { color: 'white', kind: 'queen' },
  R: { color: 'white', kind: 'rook' }
};

const PROMOTION_PICKER_ORDER: readonly PromotionPiece[] = ['q', 'r', 'b', 'n'];
const PROMOTION_PIECE_KIND: Record<PromotionPiece, PieceKind> = {
  b: 'bishop',
  n: 'knight',
  q: 'queen',
  r: 'rook'
};
const PROMOTION_PIECE_LABEL: Record<PromotionPiece, string> = {
  b: 'B',
  n: 'N',
  q: 'Q',
  r: 'R'
};
const PROMOTION_PIECE_DRAW_SIZE = 24;

let activeChessGamePanel: ChessGamePanelRuntime | null = null;
let chessAssetsPromise: Promise<ChessAssets> | null = null;

export function openChessGamePanel(
  shell: GamePanelShell,
  game: PublicChessGame,
  currentUserId: string,
  onMove: (gameId: string, from: string, to: string, promotion?: PromotionPiece) => void,
  onVisibilityChanged?: () => void
): void {
  closeChessGamePanel({ notify: false });

  const listeners = new AbortController();

  const soundController = createGameSoundController({
    className: 'ytcq-chess-game-sound-toggle',
    preloadPaths: CHESS_SOUND_PATHS,
    signal: listeners.signal
  });

  const { body, compactButton, statusOverlay, subtitleElement } = shell;
  compactButton.before(soundController.button);
  subtitleElement.textContent = getChessOpponentLabel(game, currentUserId);

  const canvas = el<HTMLCanvasElement>(
    <canvas class="ytcq-chess-board-canvas" aria-label={t('gamesChess')} />
  );
  const pixelRatio = configureChessCanvas(canvas);
  body.append(canvas);

  activeChessGamePanel = {
    assets: null,
    canvas,
    currentUserId,
    game,
    hoverPromotionPiece: null,
    hoverSquare: null,
    listeners,
    onMove,
    onVisibilityChanged: onVisibilityChanged || null,
    pendingPromotion: null,
    pixelRatio,
    selectedSquare: null,
    soundController,
    statusOverlay,
    subtitleElement
  };

  canvas.addEventListener('click', handleChessCanvasClick, { signal: listeners.signal });
  canvas.addEventListener('mousemove', handleChessCanvasMouseMove, { signal: listeners.signal });
  canvas.addEventListener('mouseleave', handleChessCanvasMouseLeave, { signal: listeners.signal });

  syncChessGameStatusMessage();
  renderChessBoard();
  void getChessAssets()
    .then((assets) => {
      if (!activeChessGamePanel || activeChessGamePanel.canvas !== canvas) return;
      activeChessGamePanel.assets = assets;
      renderChessBoard();
    })
    .catch(() => undefined);
}

export function closeChessGamePanel({ notify = true }: { notify?: boolean } = {}): void {
  const runtime = activeChessGamePanel;
  const onVisibilityChanged = runtime?.onVisibilityChanged || null;
  runtime?.statusOverlay.clear();
  runtime?.listeners.abort();
  runtime?.canvas.remove();
  runtime?.soundController.button.remove();
  activeChessGamePanel = null;
  if (notify) onVisibilityChanged?.();
}

export function isChessGamePanelOpen(): boolean {
  return Boolean(activeChessGamePanel);
}

export function getActiveChessGameId(): string {
  return activeChessGamePanel?.game.gameId || '';
}

export function updateChessGamePanel(game: PublicChessGame, currentUserId: string): void {
  if (!activeChessGamePanel || activeChessGamePanel.game.gameId !== game.gameId) return;
  const moveSoundPath = getChessMoveSoundPath(activeChessGamePanel.game.fen, game.fen);
  activeChessGamePanel.game = game;
  activeChessGamePanel.currentUserId = currentUserId;
  activeChessGamePanel.hoverPromotionPiece = null;
  activeChessGamePanel.pendingPromotion = null;
  activeChessGamePanel.selectedSquare = null;
  syncChessGameStatusMessage();
  activeChessGamePanel.subtitleElement.textContent = getChessOpponentLabel(game, currentUserId);
  renderChessBoard();
  if (moveSoundPath) activeChessGamePanel.soundController.play(moveSoundPath);
}

function handleChessCanvasClick(event: MouseEvent): void {
  if (!activeChessGamePanel || activeChessGamePanel.game.status !== 'active') return;
  if (activeChessGamePanel.statusOverlay.isBlocking()) return;

  if (activeChessGamePanel.pendingPromotion) {
    const promotion = getPromotionPieceAt(event);
    const pendingPromotion = activeChessGamePanel.pendingPromotion;
    activeChessGamePanel.hoverPromotionPiece = null;
    activeChessGamePanel.pendingPromotion = null;
    if (promotion) {
      activeChessGamePanel.onMove(
        activeChessGamePanel.game.gameId,
        pendingPromotion.from,
        pendingPromotion.to,
        promotion
      );
    }
    renderChessBoard();
    return;
  }

  const square = getChessCanvasSquare(event);
  if (!square) return;

  const ownColor = getCurrentUserColor(
    activeChessGamePanel.game,
    activeChessGamePanel.currentUserId
  );
  if (!ownColor || activeChessGamePanel.game.turn !== ownColor) {
    showChessFeedbackMessage(event, t('gamesNotYourTurn'));
    return;
  }

  const selected = activeChessGamePanel.selectedSquare;
  if (selected) {
    if (selected.x === square.x && selected.y === square.y) {
      activeChessGamePanel.selectedSquare = null;
      renderChessBoard();
      return;
    }

    const piece = getChessPieceAt(activeChessGamePanel.game, square);
    if (piece?.color === ownColor) {
      activeChessGamePanel.selectedSquare = square;
      renderChessBoard();
      return;
    }

    const from = toChessSquare(selected);
    const to = toChessSquare(square);
    const moves = getLegalChessMoves(activeChessGamePanel.game, from, to);
    if (moves.length === 0) {
      showChessFeedbackMessage(event, t('gamesInvalidMove'));
      return;
    }

    const promotionPieces = getPromotionPieces(moves);
    activeChessGamePanel.selectedSquare = null;
    if (promotionPieces.length > 1) {
      activeChessGamePanel.pendingPromotion = {
        color: ownColor,
        from,
        pieces: promotionPieces,
        to
      };
      activeChessGamePanel.hoverPromotionPiece = null;
      renderChessBoard();
      return;
    }

    const move = moves.find((candidate) => !getChessPromotion(candidate)) || moves[0];
    activeChessGamePanel.onMove(
      activeChessGamePanel.game.gameId,
      from,
      to,
      promotionPieces[0] || getChessPromotion(move)
    );
    renderChessBoard();
    return;
  }

  const piece = getChessPieceAt(activeChessGamePanel.game, square);
  if (!piece || piece.color !== ownColor) {
    showChessFeedbackMessage(event, t('gamesChooseOwnPiece'));
    return;
  }

  activeChessGamePanel.selectedSquare = square;
  renderChessBoard();
}

function showChessFeedbackMessage(event: MouseEvent, message: string): void {
  showGamePanelFeedbackBubble({
    className: 'ytcq-chess-feedback-message',
    event,
    message
  });
}

function syncChessGameStatusMessage(): void {
  if (!activeChessGamePanel) return;

  const status = getChessGameStatusMessage(activeChessGamePanel.game);
  if (!status) {
    clearChessStatusMessage({ resetKey: true });
    return;
  }

  showChessStatusMessage(status);
}

function showChessStatusMessage({ key, message, temporary }: GamePanelStatusMessage): void {
  if (!activeChessGamePanel) return;
  activeChessGamePanel.statusOverlay.show(toGamePanelStatusMessage({ key, message, temporary }));
}

function clearChessStatusMessage({ resetKey = false }: { resetKey?: boolean } = {}): void {
  activeChessGamePanel?.statusOverlay.clear({ owner: 'game', resetKey });
}

function getChessGameStatusMessage(game: PublicChessGame): GamePanelStatusMessage | null {
  switch (game.status) {
    case 'checkmate':
      return {
        key: `checkmate:${game.gameId}:${game.winner || ''}`,
        message: t('gamesCheckmate'),
        temporary: false
      };
    case 'draw':
      return {
        key: `draw:${game.gameId}`,
        message: t('gamesDraw'),
        temporary: false
      };
    case 'resigned':
      return {
        key: `resigned:${game.gameId}:${game.winner || ''}`,
        message: t('gamesResigned'),
        temporary: false
      };
    case 'active':
      return isChessInCheck(game.fen)
        ? {
            key: `check:${game.fen}`,
            message: t('gamesCheck'),
            temporary: true
          }
        : null;
  }
}

function isChessInCheck(fen: string): boolean {
  try {
    return new Chess(fen).isCheck();
  } catch {
    return false;
  }
}

function getChessMoveSoundPath(previousFen: string, nextFen: string): string {
  if (previousFen === nextFen) return '';
  return getFenPieceCount(nextFen) < getFenPieceCount(previousFen)
    ? CAPTURE_SOUND_PATH
    : MOVE_SOUND_PATH;
}

function getFenPieceCount(fen: string): number {
  return parseFenPieces(fen).length;
}

function handleChessCanvasMouseMove(event: MouseEvent): void {
  if (!activeChessGamePanel) return;
  if (activeChessGamePanel.statusOverlay.isBlocking()) {
    if (!activeChessGamePanel.hoverSquare && !activeChessGamePanel.hoverPromotionPiece) return;

    activeChessGamePanel.hoverPromotionPiece = null;
    activeChessGamePanel.hoverSquare = null;
    renderChessBoard();
    return;
  }

  if (activeChessGamePanel.pendingPromotion) {
    const hoverPromotionPiece = getPromotionPieceAt(event);
    if (activeChessGamePanel.hoverPromotionPiece === hoverPromotionPiece) return;

    activeChessGamePanel.hoverPromotionPiece = hoverPromotionPiece;
    activeChessGamePanel.hoverSquare = null;
    renderChessBoard();
    return;
  }

  const nextHover = getChessCanvasSquare(event);

  if (
    activeChessGamePanel.hoverSquare?.x === nextHover?.x &&
    activeChessGamePanel.hoverSquare?.y === nextHover?.y
  )
    return;

  activeChessGamePanel.hoverSquare = nextHover;
  renderChessBoard();
}

function handleChessCanvasMouseLeave(): void {
  if (!activeChessGamePanel?.hoverSquare && !activeChessGamePanel?.hoverPromotionPiece) return;
  activeChessGamePanel.hoverPromotionPiece = null;
  activeChessGamePanel.hoverSquare = null;
  renderChessBoard();
}

function renderChessBoard(): void {
  if (!activeChessGamePanel) return;

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = activeChessGamePanel.canvas.getContext('2d');
  } catch {
    return;
  }
  if (!context) return;

  syncChessCanvasPixelRatio(activeChessGamePanel);
  context.setTransform(
    activeChessGamePanel.pixelRatio,
    0,
    0,
    activeChessGamePanel.pixelRatio,
    0,
    0
  );
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, CANVAS_CSS_SIZE, CANVAS_CSS_SIZE);

  drawBoard(context, activeChessGamePanel.assets);

  const perspective = getChessBoardPerspective(activeChessGamePanel);
  drawLastMoveSquares(context, activeChessGamePanel.game.lastMove, perspective);
  drawSelectedSquare(context, activeChessGamePanel.selectedSquare, perspective);
  drawHoverSquare(context, activeChessGamePanel.hoverSquare, perspective);
  if (activeChessGamePanel.assets)
    drawPieces(
      context,
      activeChessGamePanel.assets,
      parseFenPieces(activeChessGamePanel.game.fen),
      perspective
    );
  drawLegalMoveHints(
    context,
    activeChessGamePanel.game,
    activeChessGamePanel.selectedSquare,
    perspective
  );
  drawPromotionPicker(
    context,
    activeChessGamePanel.assets,
    activeChessGamePanel.pendingPromotion,
    activeChessGamePanel.hoverPromotionPiece,
    perspective
  );
}

function drawBoard(context: CanvasRenderingContext2D, assets: ChessAssets | null): void {
  if (assets) {
    context.drawImage(assets.board, 0, 0, CANVAS_CSS_SIZE, CANVAS_CSS_SIZE);
  }

  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      context.fillStyle =
        (x + y) % 2 === 0 ? 'rgba(228, 196, 137, 0.16)' : 'rgba(86, 62, 59, 0.64)';
      context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
}

function drawHoverSquare(
  context: CanvasRenderingContext2D,
  square: BoardSquare | null,
  perspective: PieceColor
): void {
  if (!square) return;

  const displaySquare = toDisplaySquare(square, perspective);
  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  context.fillStyle = 'rgba(62, 166, 255, 0.28)';
  context.fillRect(displaySquare.x * tileSize, displaySquare.y * tileSize, tileSize, tileSize);
  context.strokeStyle = 'rgba(62, 166, 255, 0.9)';
  context.lineWidth = 2;
  context.strokeRect(
    displaySquare.x * tileSize + 1,
    displaySquare.y * tileSize + 1,
    tileSize - 2,
    tileSize - 2
  );
}

function drawSelectedSquare(
  context: CanvasRenderingContext2D,
  square: BoardSquare | null,
  perspective: PieceColor
): void {
  if (!square) return;

  const displaySquare = toDisplaySquare(square, perspective);
  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  context.fillStyle = 'rgba(255, 183, 77, 0.26)';
  context.fillRect(displaySquare.x * tileSize, displaySquare.y * tileSize, tileSize, tileSize);
  context.strokeStyle = 'rgba(255, 183, 77, 0.95)';
  context.lineWidth = 2;
  context.strokeRect(
    displaySquare.x * tileSize + 1,
    displaySquare.y * tileSize + 1,
    tileSize - 2,
    tileSize - 2
  );
}

function drawLegalMoveHints(
  context: CanvasRenderingContext2D,
  game: PublicChessGame,
  selectedSquare: BoardSquare | null,
  perspective: PieceColor
): void {
  const hints = getLegalMoveHints(game, selectedSquare);
  if (!hints.length) return;
  if (!canDrawLegalMoveHints(context)) return;

  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  hints.forEach((hint) => {
    const displaySquare = toDisplaySquare(hint, perspective);
    const centerX = displaySquare.x * tileSize + tileSize / 2;
    const centerY = displaySquare.y * tileSize + tileSize / 2;

    if (hint.capture) {
      context.beginPath();
      context.arc(centerX, centerY, LEGAL_CAPTURE_RING_RADIUS, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(47, 51, 54, 0.72)';
      context.lineWidth = 4;
      context.stroke();

      context.beginPath();
      context.arc(centerX, centerY, LEGAL_CAPTURE_RING_RADIUS, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      context.lineWidth = 2;
      context.stroke();
      return;
    }

    context.beginPath();
    context.arc(centerX, centerY, LEGAL_MOVE_DOT_RADIUS, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 255, 255, 0.84)';
    context.fill();
    context.strokeStyle = 'rgba(47, 51, 54, 0.58)';
    context.lineWidth = 1;
    context.stroke();
  });
}

function canDrawLegalMoveHints(context: CanvasRenderingContext2D): boolean {
  return (
    typeof context.beginPath === 'function' &&
    typeof context.arc === 'function' &&
    typeof context.fill === 'function' &&
    typeof context.stroke === 'function'
  );
}

function drawPieces(
  context: CanvasRenderingContext2D,
  assets: ChessAssets,
  pieces: ChessPiece[],
  perspective: PieceColor
): void {
  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  const pieceOffset = (tileSize - PIECE_DRAW_SIZE) / 2;

  pieces.forEach((piece) => {
    const source = PIECE_SOURCE[piece.kind];
    const image = piece.color === 'white' ? assets.whitePieces : assets.blackPieces;
    const displaySquare = toDisplaySquare(piece, perspective);
    context.drawImage(
      image,
      source.x * PIECE_SOURCE_SIZE,
      source.y * PIECE_SOURCE_SIZE,
      PIECE_SOURCE_SIZE,
      PIECE_SOURCE_SIZE,
      displaySquare.x * tileSize + pieceOffset,
      displaySquare.y * tileSize + pieceOffset,
      PIECE_DRAW_SIZE,
      PIECE_DRAW_SIZE
    );
  });
}

function drawPromotionPicker(
  context: CanvasRenderingContext2D,
  assets: ChessAssets | null,
  pendingPromotion: PendingPromotion | null,
  hoverPromotionPiece: PromotionPiece | null,
  perspective: PieceColor
): void {
  if (!pendingPromotion) return;

  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  getPromotionPickerOptions(pendingPromotion, perspective).forEach((option) => {
    const x = option.x * tileSize;
    const y = option.y * tileSize;
    const hovered = option.piece === hoverPromotionPiece;

    context.fillStyle = hovered
      ? 'rgba(62, 166, 255, 0.92)'
      : pendingPromotion.color === 'white'
        ? 'rgba(32, 33, 36, 0.94)'
        : 'rgba(255, 255, 255, 0.96)';
    context.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
    context.strokeStyle = hovered ? 'rgba(255, 255, 255, 0.96)' : 'rgba(15, 15, 15, 0.42)';
    context.lineWidth = hovered ? 2 : 1;
    context.strokeRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
    drawPromotionPickerPiece(context, assets, option, pendingPromotion.color, tileSize);
  });
}

function drawPromotionPickerPiece(
  context: CanvasRenderingContext2D,
  assets: ChessAssets | null,
  option: PromotionPickerOption,
  color: PieceColor,
  tileSize: number
): void {
  const x = option.x * tileSize;
  const y = option.y * tileSize;
  const offset = (tileSize - PROMOTION_PIECE_DRAW_SIZE) / 2;
  const kind = PROMOTION_PIECE_KIND[option.piece];

  if (assets) {
    const source = PIECE_SOURCE[kind];
    const image = color === 'white' ? assets.whitePieces : assets.blackPieces;
    context.drawImage(
      image,
      source.x * PIECE_SOURCE_SIZE,
      source.y * PIECE_SOURCE_SIZE,
      PIECE_SOURCE_SIZE,
      PIECE_SOURCE_SIZE,
      x + offset,
      y + offset,
      PROMOTION_PIECE_DRAW_SIZE,
      PROMOTION_PIECE_DRAW_SIZE
    );
    return;
  }

  if (typeof context.fillText !== 'function') return;
  context.fillStyle = color === 'white' ? '#fff' : '#111';
  context.font = '700 16px system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(PROMOTION_PIECE_LABEL[option.piece], x + tileSize / 2, y + tileSize / 2 + 1);
}

function drawLastMoveSquares(
  context: CanvasRenderingContext2D,
  lastMove: ChessLastMove | undefined,
  perspective: PieceColor
): void {
  if (!lastMove) return;

  const from = fromChessSquare(lastMove.from);
  const to = fromChessSquare(lastMove.to);
  if (!from || !to) return;

  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  [from, to].forEach((square, index) => {
    const displaySquare = toDisplaySquare(square, perspective);
    const x = displaySquare.x * tileSize;
    const y = displaySquare.y * tileSize;

    context.fillStyle = index === 0 ? 'rgba(255, 214, 10, 0.14)' : 'rgba(255, 214, 10, 0.2)';
    context.fillRect(x, y, tileSize, tileSize);
    context.strokeStyle = index === 0 ? 'rgba(255, 214, 10, 0.38)' : 'rgba(255, 214, 10, 0.52)';
    context.lineWidth = 1;
    context.strokeRect(x + 2.5, y + 2.5, tileSize - 5, tileSize - 5);
  });
}

function parseFenPieces(fen: string): ChessPiece[] {
  const board = fen.split(/\s+/)[0] || '';
  const rows = board.split('/');
  const pieces: ChessPiece[] = [];

  rows.slice(0, BOARD_SIZE).forEach((row, y) => {
    let x = 0;
    for (const symbol of row) {
      const skip = Number(symbol);
      if (Number.isInteger(skip) && skip > 0) {
        x += skip;
        continue;
      }

      const piece = PIECE_BY_FEN[symbol];
      if (!piece || x >= BOARD_SIZE) continue;
      pieces.push({
        color: piece.color,
        kind: piece.kind,
        x,
        y
      });
      x += 1;
    }
  });

  return pieces;
}

function getChessPieceAt(game: PublicChessGame, square: BoardSquare): ChessPiece | undefined {
  return parseFenPieces(game.fen).find((piece) => piece.x === square.x && piece.y === square.y);
}

function getLegalChessMoves(game: PublicChessGame, from: string, to: string): Move[] {
  if (!isChessSquare(from) || !isChessSquare(to)) return [];

  try {
    const chess = new Chess(game.fen);
    return chess.moves({ square: from, verbose: true }).filter((move) => move.to === to);
  } catch {
    return [];
  }
}

function getLegalMoveHints(
  game: PublicChessGame,
  selectedSquare: BoardSquare | null
): LegalMoveHint[] {
  if (!selectedSquare) return [];

  const from = toChessSquare(selectedSquare);
  if (!isChessSquare(from)) return [];

  try {
    const chess = new Chess(game.fen);
    const hintsBySquare = new Map<string, LegalMoveHint>();
    chess.moves({ square: from, verbose: true }).forEach((move) => {
      const square = fromChessSquare(move.to);
      if (!square) return;

      const existing = hintsBySquare.get(move.to);
      hintsBySquare.set(move.to, {
        ...square,
        capture: Boolean(move.captured) || Boolean(existing?.capture)
      });
    });
    return Array.from(hintsBySquare.values());
  } catch {
    return [];
  }
}

function getPromotionPieces(moves: Move[]): PromotionPiece[] {
  const pieces = new Set<PromotionPiece>();
  moves.forEach((move) => {
    const promotion = getChessPromotion(move);
    if (promotion) pieces.add(promotion);
  });
  return PROMOTION_PICKER_ORDER.filter((piece) => pieces.has(piece));
}

function getChessPromotion(move: Move): PromotionPiece | undefined {
  return move.promotion === 'b' ||
    move.promotion === 'n' ||
    move.promotion === 'q' ||
    move.promotion === 'r'
    ? move.promotion
    : undefined;
}

function isChessSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

function getChessCanvasSquare(event: MouseEvent): BoardSquare | null {
  if (!activeChessGamePanel) return null;
  const displaySquare = getChessCanvasDisplaySquare(event);
  return displaySquare
    ? toBoardSquare(displaySquare, getChessBoardPerspective(activeChessGamePanel))
    : null;
}

function getChessCanvasDisplaySquare(event: MouseEvent): BoardSquare | null {
  if (!activeChessGamePanel) return null;
  const rect = activeChessGamePanel.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const x = Math.floor(((event.clientX - rect.left) / rect.width) * BOARD_SIZE);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * BOARD_SIZE);
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE ? { x, y } : null;
}

function toChessSquare(square: BoardSquare): string {
  return `${'abcdefgh'[square.x]}${8 - square.y}`;
}

function fromChessSquare(square: string): BoardSquare | null {
  if (!isChessSquare(square)) return null;
  return {
    x: 'abcdefgh'.indexOf(square[0]),
    y: BOARD_SIZE - Number(square[1])
  };
}

function getPromotionPieceAt(event: MouseEvent): PromotionPiece | null {
  if (!activeChessGamePanel?.pendingPromotion) return null;

  const displaySquare = getChessCanvasDisplaySquare(event);
  if (!displaySquare) return null;

  const perspective = getChessBoardPerspective(activeChessGamePanel);
  return (
    getPromotionPickerOptions(activeChessGamePanel.pendingPromotion, perspective).find(
      (option) => option.x === displaySquare.x && option.y === displaySquare.y
    )?.piece || null
  );
}

function getPromotionPickerOptions(
  pendingPromotion: PendingPromotion,
  perspective: PieceColor
): PromotionPickerOption[] {
  const targetSquare = fromChessSquare(pendingPromotion.to);
  if (!targetSquare) return [];

  const displayTarget = toDisplaySquare(targetSquare, perspective);
  const direction = displayTarget.y + pendingPromotion.pieces.length <= BOARD_SIZE ? 1 : -1;
  return pendingPromotion.pieces.map((piece, index) => ({
    piece,
    x: displayTarget.x,
    y: displayTarget.y + index * direction
  }));
}

function getChessBoardPerspective(runtime: ChessGamePanelRuntime): PieceColor {
  return getCurrentUserColor(runtime.game, runtime.currentUserId) || 'white';
}

function toDisplaySquare(square: BoardSquare, perspective: PieceColor): BoardSquare {
  return perspective === 'black'
    ? { x: BOARD_SIZE - 1 - square.x, y: BOARD_SIZE - 1 - square.y }
    : square;
}

function toBoardSquare(square: BoardSquare, perspective: PieceColor): BoardSquare {
  return toDisplaySquare(square, perspective);
}

function getCurrentUserColor(game: PublicChessGame, currentUserId: string): PieceColor | null {
  if (game.players.white.userId === currentUserId) return 'white';
  if (game.players.black.userId === currentUserId) return 'black';
  return null;
}

function getChessOpponentLabel(game: PublicChessGame, currentUserId: string): string {
  const currentUserColor = getCurrentUserColor(game, currentUserId);
  const opponent = currentUserColor === 'white' ? game.players.black : game.players.white;
  return opponent.displayName || 'Player';
}

function configureChessCanvas(canvas: HTMLCanvasElement): number {
  const pixelRatio = getCanvasPixelRatio();
  canvas.width = CANVAS_CSS_SIZE * pixelRatio;
  canvas.height = CANVAS_CSS_SIZE * pixelRatio;
  return pixelRatio;
}

function syncChessCanvasPixelRatio(runtime: ChessGamePanelRuntime): void {
  const pixelRatio = getCanvasPixelRatio();
  const backingSize = CANVAS_CSS_SIZE * pixelRatio;
  if (runtime.canvas.width !== backingSize || runtime.canvas.height !== backingSize) {
    runtime.canvas.width = backingSize;
    runtime.canvas.height = backingSize;
  }
  runtime.pixelRatio = pixelRatio;
}

function getCanvasPixelRatio(): number {
  return Math.max(1, Math.round(window.devicePixelRatio || 1));
}

function getChessAssets(): Promise<ChessAssets> {
  chessAssetsPromise ||= Promise.all([
    loadChessImage(chrome.runtime.getURL(BOARD_PATH)),
    loadChessImage(chrome.runtime.getURL(WHITE_PIECES_PATH)),
    loadChessImage(chrome.runtime.getURL(BLACK_PIECES_PATH))
  ]).then(([board, whitePieces, blackPieces]) => ({ blackPieces, board, whitePieces }));
  return chessAssetsPromise;
}

function loadChessImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
    if (image.complete) resolve(image);
  });
}
