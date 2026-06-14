/**
 * Chess game panel.
 *
 * Renders the draggable chess board canvas, handles local click/hover feedback,
 * plays move sounds, and emits validated move intents back to the chess adapter.
 */
import { Chess, type Move, type Square } from 'chess.js';
import { createGamesIcon } from '../../../../shared/icons';
import { t } from '../../../../shared/i18n';
import { ytcqCreateElement } from '../../../../shared/managed-dom';
import type { PublicGame, PublicUserIdentity } from '../../../../shared/playground-protocol';
import {
  createGamePanelStatusOverlay,
  showGamePanelFeedbackBubble,
  type GamePanelStatusMessage,
  type GamePanelStatusOverlay,
  toGamePanelStatusMessage
} from '../panel-feedback';
import { createGamePanelShell } from '../panel-shell';
import { createGameSoundController, type GameSoundController } from '../sound';

const BOARD_PATH = 'games/chess/board.png';
const CAPTURE_SOUND_PATH = 'games/chess/capture.mp3';
const MOVE_SOUND_PATH = 'games/chess/move.mp3';
const CHESS_SOUND_PATHS = [MOVE_SOUND_PATH, CAPTURE_SOUND_PATH] as const;
const WHITE_PIECES_PATH = 'games/chess/white-pieces.png';
const BLACK_PIECES_PATH = 'games/chess/black-pieces.png';
const BOARD_SIZE = 8;
const CANVAS_CSS_SIZE = 224;
const PIECE_SOURCE_SIZE = 32;
const PIECE_DRAW_SIZE = 32;

type PieceColor = 'black' | 'white';
type PieceKind = 'bishop' | 'king' | 'knight' | 'pawn' | 'queen' | 'rook';
type PromotionPiece = 'b' | 'n' | 'q' | 'r';
type BoardSquare = { x: number; y: number };

export interface PublicChessGame extends PublicGame {
  fen: string;
  gameType: 'chess';
  lastMoveSan?: string;
  pgn: string;
  players: Record<PieceColor, PublicUserIdentity>;
  status: 'active' | 'checkmate' | 'draw' | 'resigned';
  turn: PieceColor;
  winner?: PieceColor;
}

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

interface ChessGamePanelState {
  assets: ChessAssets | null;
  canvas: HTMLCanvasElement;
  currentUserId: string;
  game: PublicChessGame;
  hoverSquare: BoardSquare | null;
  listeners: AbortController;
  onMove: (gameId: string, from: string, to: string, promotion?: PromotionPiece) => void;
  onVisibilityChanged: (() => void) | null;
  panel: HTMLElement;
  pixelRatio: number;
  selectedSquare: BoardSquare | null;
  soundController: GameSoundController;
  statusOverlay: GamePanelStatusOverlay;
  subtitleElement: HTMLElement;
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

let activeChessGamePanel: ChessGamePanelState | null = null;
let chessAssetsPromise: Promise<ChessAssets> | null = null;

export function openChessGamePanel(
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

  const {
    body,
    panel,
    subtitleElement
  } = createGamePanelShell({
    ariaLabel: t('gamesChess'),
    classNamePrefix: 'ytcq-chess-game',
    closeLabel: t('gamesMinimize'),
    headerActions: [soundController.button],
    icon: createGamesIcon(),
    onClose: () => closeChessGamePanel(),
    signal: listeners.signal,
    subtitle: getChessOpponentLabel(game, currentUserId),
    title: t('gamesChess')
  });

  const canvas = ytcqCreateElement('canvas');
  canvas.className = 'ytcq-chess-board-canvas';
  canvas.setAttribute('aria-label', t('gamesChess'));
  const pixelRatio = configureChessCanvas(canvas);
  const statusOverlay = createGamePanelStatusOverlay({
    classNamePrefix: 'ytcq-chess-game'
  });
  body.append(canvas, statusOverlay.element);

  activeChessGamePanel = {
    assets: null,
    canvas,
    currentUserId,
    game,
    hoverSquare: null,
    listeners,
    onMove,
    onVisibilityChanged: onVisibilityChanged || null,
    panel,
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
  void getChessAssets().then((assets) => {
    if (!activeChessGamePanel || activeChessGamePanel.canvas !== canvas) return;
    activeChessGamePanel.assets = assets;
    renderChessBoard();
  }).catch(() => undefined);
}

export function updateChessGamePanel(game: PublicChessGame, currentUserId: string): void {
  if (!activeChessGamePanel || activeChessGamePanel.game.gameId !== game.gameId) return;
  const moveSoundPath = getChessMoveSoundPath(activeChessGamePanel.game.fen, game.fen);
  activeChessGamePanel.game = game;
  activeChessGamePanel.currentUserId = currentUserId;
  activeChessGamePanel.selectedSquare = null;
  syncChessGameStatusMessage();
  activeChessGamePanel.subtitleElement.textContent = getChessOpponentLabel(game, currentUserId);
  renderChessBoard();
  if (moveSoundPath) activeChessGamePanel.soundController.play(moveSoundPath);
}

export function closeChessGamePanel({ notify = true }: { notify?: boolean } = {}): void {
  const onVisibilityChanged = activeChessGamePanel?.onVisibilityChanged || null;
  activeChessGamePanel?.statusOverlay.clear();
  activeChessGamePanel?.listeners.abort();
  activeChessGamePanel?.panel.remove();
  activeChessGamePanel = null;
  if (notify) onVisibilityChanged?.();
}

export function isChessGamePanelOpen(): boolean {
  return Boolean(activeChessGamePanel);
}

export function getActiveChessGameId(): string {
  return activeChessGamePanel?.game.gameId || '';
}

export function getChessGamePanelOverlay(): GamePanelStatusOverlay | null {
  return activeChessGamePanel?.statusOverlay || null;
}

export function isPublicChessGame(game: PublicGame | undefined): game is PublicChessGame {
  return Boolean(game) &&
    game?.gameType === 'chess' &&
    typeof (game as Partial<PublicChessGame>).fen === 'string' &&
    Boolean((game as Partial<PublicChessGame>).players?.white?.userId) &&
    Boolean((game as Partial<PublicChessGame>).players?.black?.userId);
}

function handleChessCanvasClick(event: MouseEvent): void {
  if (!activeChessGamePanel || activeChessGamePanel.game.status !== 'active') return;
  if (activeChessGamePanel.statusOverlay.isBlocking()) return;

  const square = getChessCanvasSquare(event);
  if (!square) return;

  const ownColor = getCurrentUserColor(activeChessGamePanel.game, activeChessGamePanel.currentUserId);
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
    const move = getLegalChessMove(activeChessGamePanel.game, from, to);
    if (!move) {
      showChessFeedbackMessage(event, t('gamesInvalidMove'));
      return;
    }

    activeChessGamePanel.selectedSquare = null;
    activeChessGamePanel.onMove(
      activeChessGamePanel.game.gameId,
      from,
      to,
      getChessPromotion(move)
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

function showChessStatusMessage({
  key,
  message,
  temporary
}: GamePanelStatusMessage): void {
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
    if (!activeChessGamePanel.hoverSquare) return;

    activeChessGamePanel.hoverSquare = null;
    renderChessBoard();
    return;
  }

  const nextHover = getChessCanvasSquare(event);

  if (activeChessGamePanel.hoverSquare?.x === nextHover?.x && activeChessGamePanel.hoverSquare?.y === nextHover?.y) return;

  activeChessGamePanel.hoverSquare = nextHover;
  renderChessBoard();
}

function handleChessCanvasMouseLeave(): void {
  if (!activeChessGamePanel?.hoverSquare) return;
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
  context.setTransform(activeChessGamePanel.pixelRatio, 0, 0, activeChessGamePanel.pixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, CANVAS_CSS_SIZE, CANVAS_CSS_SIZE);

  drawBoard(context, activeChessGamePanel.assets);

  const perspective = getChessBoardPerspective(activeChessGamePanel);
  drawSelectedSquare(context, activeChessGamePanel.selectedSquare, perspective);
  drawHoverSquare(context, activeChessGamePanel.hoverSquare, perspective);
  if (activeChessGamePanel.assets) drawPieces(context, activeChessGamePanel.assets, parseFenPieces(activeChessGamePanel.game.fen), perspective);
}

function drawBoard(context: CanvasRenderingContext2D, assets: ChessAssets | null): void {
  if (assets) {
    context.drawImage(assets.board, 0, 0, CANVAS_CSS_SIZE, CANVAS_CSS_SIZE);
  }

  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      context.fillStyle = (x + y) % 2 === 0
        ? 'rgba(228, 196, 137, 0.16)'
        : 'rgba(86, 62, 59, 0.64)';
      context.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
}

function drawHoverSquare(context: CanvasRenderingContext2D, square: BoardSquare | null, perspective: PieceColor): void {
  if (!square) return;

  const displaySquare = toDisplaySquare(square, perspective);
  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  context.fillStyle = 'rgba(62, 166, 255, 0.28)';
  context.fillRect(displaySquare.x * tileSize, displaySquare.y * tileSize, tileSize, tileSize);
  context.strokeStyle = 'rgba(62, 166, 255, 0.9)';
  context.lineWidth = 2;
  context.strokeRect(displaySquare.x * tileSize + 1, displaySquare.y * tileSize + 1, tileSize - 2, tileSize - 2);
}

function drawSelectedSquare(context: CanvasRenderingContext2D, square: BoardSquare | null, perspective: PieceColor): void {
  if (!square) return;

  const displaySquare = toDisplaySquare(square, perspective);
  const tileSize = CANVAS_CSS_SIZE / BOARD_SIZE;
  context.fillStyle = 'rgba(255, 183, 77, 0.26)';
  context.fillRect(displaySquare.x * tileSize, displaySquare.y * tileSize, tileSize, tileSize);
  context.strokeStyle = 'rgba(255, 183, 77, 0.95)';
  context.lineWidth = 2;
  context.strokeRect(displaySquare.x * tileSize + 1, displaySquare.y * tileSize + 1, tileSize - 2, tileSize - 2);
}

function drawPieces(context: CanvasRenderingContext2D, assets: ChessAssets, pieces: ChessPiece[], perspective: PieceColor): void {
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

function getLegalChessMove(game: PublicChessGame, from: string, to: string): Move | null {
  if (!isChessSquare(from) || !isChessSquare(to)) return null;

  try {
    const chess = new Chess(game.fen);
    return chess.moves({ square: from, verbose: true }).find((move) => move.to === to) || null;
  } catch {
    return null;
  }
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

  const rect = activeChessGamePanel.canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const x = Math.floor(((event.clientX - rect.left) / rect.width) * BOARD_SIZE);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * BOARD_SIZE);
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE
    ? toBoardSquare({ x, y }, getChessBoardPerspective(activeChessGamePanel))
    : null;
}

function toChessSquare(square: BoardSquare): string {
  return `${'abcdefgh'[square.x]}${8 - square.y}`;
}

function getChessBoardPerspective(state: ChessGamePanelState): PieceColor {
  return getCurrentUserColor(state.game, state.currentUserId) || 'white';
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
  const opponent = currentUserColor === 'white'
    ? game.players.black
    : game.players.white;
  return opponent.displayName || 'Player';
}

function configureChessCanvas(canvas: HTMLCanvasElement): number {
  const pixelRatio = getCanvasPixelRatio();
  canvas.width = CANVAS_CSS_SIZE * pixelRatio;
  canvas.height = CANVAS_CSS_SIZE * pixelRatio;
  return pixelRatio;
}

function syncChessCanvasPixelRatio(state: ChessGamePanelState): void {
  const pixelRatio = getCanvasPixelRatio();
  const backingSize = CANVAS_CSS_SIZE * pixelRatio;
  if (state.canvas.width !== backingSize || state.canvas.height !== backingSize) {
    state.canvas.width = backingSize;
    state.canvas.height = backingSize;
  }
  state.pixelRatio = pixelRatio;
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
