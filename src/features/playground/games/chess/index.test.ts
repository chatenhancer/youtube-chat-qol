import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeChessGamePanel,
  getActiveChessGameId,
  getChessGamePanelOverlay,
  isChessGamePanelOpen,
  isPublicChessGame,
  openChessGamePanel,
  updateChessGamePanel,
  type PublicChessGame
} from './panel';
import { PLAYGROUND_GAME_SOUNDS_STORAGE_KEY } from '../sound';

interface AudioMock {
  play: ReturnType<typeof vi.fn>;
  src: string;
}

let audioMocks: AudioMock[] = [];

describe('playground chess panel feedback', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    await chrome.storage.local.clear();
    vi.mocked(chrome.storage.local.set).mockClear();
    vi.useFakeTimers();
    audioMocks = [];
    vi.stubGlobal('Audio', function Audio(this: AudioMock, src: string) {
      this.src = src;
      this.play = vi.fn(() => Promise.resolve());
      audioMocks.push(this);
    } as unknown as typeof Audio);
    vi.stubGlobal('Image', class {
      complete = true;
      decoding = 'async';
      height = 64;
      naturalHeight = 64;
      naturalWidth = 64;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      width = 64;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    } as unknown as typeof Image);
  });

  afterEach(() => {
    closeChessGamePanel({ notify: false });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows a floating message when clicking before this user can move', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'black' }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e2');

    expect(getFeedbackMessages()).toEqual(['Not your turn']);
    expect(onMove).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1300);
    expect(getFeedbackMessages()).toEqual([]);
  });

  it('tracks panel state, active game id, and public game shape', () => {
    expect(isChessGamePanelOpen()).toBe(false);
    expect(getActiveChessGameId()).toBe('');
    expect(getChessGamePanelOverlay()).toBeNull();
    expect(isPublicChessGame(undefined)).toBe(false);
    expect(isPublicChessGame({ gameId: 'game-1', gameType: 'replay-trivia' } as never)).toBe(false);
    expect(isPublicChessGame(createChessGame({ turn: 'white' }))).toBe(true);

    const visibilityChanged = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn(), visibilityChanged);

    expect(isChessGamePanelOpen()).toBe(true);
    expect(getActiveChessGameId()).toBe('game-1');

    closeChessGamePanel();

    expect(isChessGamePanelOpen()).toBe(false);
    expect(visibilityChanged).toHaveBeenCalledOnce();
  });

  it('ignores clicks when the game is inactive or no board square can be mapped', () => {
    const inactiveMove = vi.fn();
    openChessGamePanel(createChessGame({ status: 'draw', turn: 'white' }), 'me-user', inactiveMove);
    const inactiveCanvas = prepareChessCanvas();

    clickChessSquare(inactiveCanvas, 'e2');

    expect(inactiveMove).not.toHaveBeenCalled();
    expect(getFeedbackMessages()).toEqual([]);

    closeChessGamePanel({ notify: false });

    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: -4,
      clientY: 14
    }));
    mockRect(canvas, { height: 0, left: 0, top: 0, width: 0 });
    clickDisplayedSquare(canvas, { x: 4, y: 6 });

    expect(onMove).not.toHaveBeenCalled();
    expect(getFeedbackMessages()).toEqual([]);
  });

  it('ignores stale game updates and updates the opponent subtitle for active games', () => {
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());
    const subtitle = document.querySelector<HTMLElement>('.ytcq-chess-game-subtitle');
    expect(subtitle?.textContent).toBe('Other player');

    updateChessGamePanel({
      ...createChessGame({ turn: 'white' }),
      gameId: 'other-game',
      players: {
        black: {
          displayName: 'Ignored player',
          userId: 'other-user'
        },
        white: {
          displayName: 'Me',
          userId: 'me-user'
        }
      }
    }, 'me-user');

    expect(subtitle?.textContent).toBe('Other player');

    updateChessGamePanel({
      ...createChessGame({ turn: 'white' }),
      players: {
        black: {
          displayName: '',
          userId: 'other-user'
        },
        white: {
          displayName: 'Me',
          userId: 'me-user'
        }
      }
    }, 'me-user');

    expect(subtitle?.textContent).toBe('Player');
  });

  it('centers floating messages above the click by default', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'black' }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e2');

    const bubble = getFeedbackBubbles()[0];
    expect(bubble?.style.left).toBe('126px');
    expect(bubble?.style.top).toBe('182px');
  });

  it('shows a floating message when choosing the other player piece', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e7');

    expect(getFeedbackMessages()).toEqual(['Choose your piece']);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('uses the white board perspective for spectators and blocks spectator moves', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'white' }), 'spectator-user', onMove);
    const canvas = prepareChessCanvas();

    expect(document.querySelector<HTMLElement>('.ytcq-chess-game-subtitle')?.textContent).toBe('Me');

    clickChessSquare(canvas, 'e2');

    expect(getFeedbackMessages()).toEqual(['Not your turn']);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('shows a floating message for invalid moves and keeps the piece selected', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e2');
    clickChessSquare(canvas, 'e5');

    expect(getFeedbackMessages()).toEqual(['Invalid move']);
    expect(onMove).not.toHaveBeenCalled();

    clickChessSquare(canvas, 'e4');

    expect(onMove).toHaveBeenCalledWith('game-1', 'e2', 'e4', undefined);
  });

  it('deselects a selected piece and retargets another own piece', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e2');
    clickChessSquare(canvas, 'e2');
    clickChessSquare(canvas, 'e4');

    expect(getFeedbackMessages()).toEqual(['Choose your piece']);
    expect(onMove).not.toHaveBeenCalled();

    clickChessSquare(canvas, 'e2');
    clickChessSquare(canvas, 'd2');
    clickChessSquare(canvas, 'd4');

    expect(onMove).toHaveBeenCalledWith('game-1', 'd2', 'd4', undefined);
  });

  it('opens a canvas promotion picker and sends the chosen queen', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({
      fen: '7k/4P3/8/8/8/8/8/4K3 w - - 0 1',
      turn: 'white'
    }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e7');
    clickChessSquare(canvas, 'e8');

    expect(onMove).not.toHaveBeenCalled();

    clickChessSquare(canvas, 'e8');

    expect(onMove).toHaveBeenCalledWith('game-1', 'e7', 'e8', 'q');
  });

  it('supports underpromotion from the canvas promotion picker', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({
      fen: '7k/4P3/8/8/8/8/8/4K3 w - - 0 1',
      turn: 'white'
    }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e7');
    clickChessSquare(canvas, 'e8');
    clickDisplayedSquare(canvas, { x: 4, y: 3 });

    expect(onMove).toHaveBeenCalledWith('game-1', 'e7', 'e8', 'n');
  });

  it('maps black promotion choices through the flipped board perspective', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({
      fen: '7k/8/8/8/8/8/4p3/7K b - - 0 1',
      turn: 'black'
    }), 'other-user', onMove);
    const canvas = prepareChessCanvas();

    clickDisplayedSquare(canvas, { x: 3, y: 1 });
    clickDisplayedSquare(canvas, { x: 3, y: 0 });
    clickDisplayedSquare(canvas, { x: 3, y: 1 });

    expect(onMove).toHaveBeenCalledWith('game-1', 'e2', 'e1', 'r');
  });

  it('keeps malformed chess positions inert instead of throwing', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({
      fen: '4K3/8/8/8/8/8/4P3/4K3 w - - 0 1',
      turn: 'white'
    }), 'me-user', onMove);
    const canvas = prepareChessCanvas();

    clickChessSquare(canvas, 'e2');
    clickChessSquare(canvas, 'e4');

    expect(getFeedbackMessages()).toEqual(['Invalid move']);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('renders empty and overfull FEN board rows defensively', () => {
    const context = createMockChessCanvasContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    openChessGamePanel(createChessGame({ fen: '', turn: 'white' }), 'me-user', vi.fn());
    updateChessGamePanel(createChessGame({
      fen: '9P/8/8/8/8/8/8/8 w - - 0 1',
      turn: 'white'
    }), 'me-user');

    expect(context.clearRect).toHaveBeenCalled();

    getContext.mockRestore();
  });

  it('maps black player clicks through the flipped board perspective', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1',
      turn: 'black'
    }), 'other-user', onMove);
    const canvas = prepareChessCanvas();

    clickDisplayedSquare(canvas, { x: 3, y: 6 });
    clickDisplayedSquare(canvas, { x: 3, y: 4 });

    expect(onMove).toHaveBeenCalledWith('game-1', 'e7', 'e5', undefined);
  });

  it('draws the last move squares on the board', () => {
    const context = createMockChessCanvasContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    openChessGamePanel(createChessGame({
      lastMove: {
        from: 'e2',
        to: 'e4'
      },
      turn: 'black'
    }), 'me-user', vi.fn());

    expect(context.strokeRect).toHaveBeenCalledWith(114.5, 170.5, 23, 23);
    expect(context.strokeRect).toHaveBeenCalledWith(114.5, 114.5, 23, 23);

    getContext.mockRestore();
  });

  it('draws the last move squares through the black board perspective', () => {
    const context = createMockChessCanvasContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    openChessGamePanel(createChessGame({
      lastMove: {
        from: 'e7',
        to: 'e5'
      },
      turn: 'white'
    }), 'other-user', vi.fn());

    expect(context.strokeRect).toHaveBeenCalledWith(86.5, 170.5, 23, 23);
    expect(context.strokeRect).toHaveBeenCalledWith(86.5, 114.5, 23, 23);

    getContext.mockRestore();
  });

  it('draws legal move dots and capture rings for the selected piece', () => {
    const context = createMockChessCanvasContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);

    openChessGamePanel(createChessGame({
      fen: '7k/8/8/3p1p2/4P3/8/8/4K3 w - - 0 1',
      turn: 'white'
    }), 'me-user', vi.fn());
    const canvas = prepareChessCanvas();

    context.arc.mockClear();
    clickChessSquare(canvas, 'e4');

    expect(context.arc).toHaveBeenCalledWith(126, 98, 4, 0, Math.PI * 2);
    expect(context.arc).toHaveBeenCalledWith(98, 98, 11, 0, Math.PI * 2);
    expect(context.arc).toHaveBeenCalledWith(154, 98, 11, 0, Math.PI * 2);

    getContext.mockRestore();
  });

  it('updates hover highlights unless a blocking status overlay is active', () => {
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());
    const canvas = prepareChessCanvas();

    moveDisplayedSquare(canvas, { x: 4, y: 6 });
    expect(canvas.style.cursor).toBe('');

    getChessGamePanelOverlay()?.show({
      key: 'connection:reconnecting',
      message: 'Connection lost.',
      owner: 'system',
      temporary: false
    });
    moveDisplayedSquare(canvas, { x: 5, y: 6 });
    canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

    expect(getStatusMessage()).toBe('Connection lost.');
  });

  it('skips redundant hover redraws and clears hover on mouseleave', () => {
    const context = createMockChessCanvasContext();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as unknown as CanvasRenderingContext2D);
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());
    const canvas = prepareChessCanvas();

    context.fillRect.mockClear();
    canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(context.fillRect).not.toHaveBeenCalled();

    moveDisplayedSquare(canvas, { x: 4, y: 6 });
    expect(context.fillRect).toHaveBeenCalled();

    context.fillRect.mockClear();
    moveDisplayedSquare(canvas, { x: 4, y: 6 });
    expect(context.fillRect).not.toHaveBeenCalled();

    canvas.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(context.fillRect).toHaveBeenCalled();

    context.fillRect.mockClear();
    getChessGamePanelOverlay()?.show({
      key: 'connection:reconnecting',
      message: 'Connection lost.',
      owner: 'system',
      temporary: false
    });
    moveDisplayedSquare(canvas, { x: 5, y: 6 });
    expect(context.fillRect).not.toHaveBeenCalled();

    getContext.mockRestore();
  });

  it('blocks moves while a persistent status overlay is active', () => {
    const onMove = vi.fn();
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', onMove);
    const canvas = prepareChessCanvas();
    getChessGamePanelOverlay()?.show({
      key: 'connection:reconnecting',
      message: 'Connection lost.',
      owner: 'system',
      temporary: false
    });

    clickChessSquare(canvas, 'e2');
    clickChessSquare(canvas, 'e4');

    expect(onMove).not.toHaveBeenCalled();
    expect(getFeedbackMessages()).toEqual([]);
  });

  it('plays the move sound when a received update changes the board position', () => {
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());

    expect(getPlayedAudioMocks()).toHaveLength(0);

    updateChessGamePanel(createChessGame({ turn: 'white' }), 'me-user');
    expect(getPlayedAudioMocks()).toHaveLength(0);

    updateChessGamePanel(createChessGame({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      turn: 'black'
    }), 'me-user');

    expect(getAudioMock('games/chess/move.mp3').play).toHaveBeenCalledOnce();
    expect(getAudioMock('games/chess/capture.mp3').play).not.toHaveBeenCalled();
  });

  it('plays the capture sound when a received update removes a piece', () => {
    openChessGamePanel(createChessGame({
      fen: '8/8/8/3p4/4P3/8/8/4K2k w - - 0 1',
      turn: 'white'
    }), 'me-user', vi.fn());

    updateChessGamePanel(createChessGame({
      fen: '8/8/8/3P4/8/8/8/4K2k b - - 0 1',
      turn: 'black'
    }), 'me-user');

    expect(getAudioMock('games/chess/capture.mp3').play).toHaveBeenCalledOnce();
    expect(getAudioMock('games/chess/move.mp3').play).not.toHaveBeenCalled();
  });

  it('continues rendering when canvas context is missing or unavailable', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValueOnce(null);

    expect(() => openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn())).not.toThrow();

    closeChessGamePanel({ notify: false });
    getContext.mockImplementationOnce(() => {
      throw new Error('canvas unavailable');
    });

    expect(() => openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn())).not.toThrow();
  });

  it('loads image assets and redraws pieces with updated pixel ratio', async () => {
    const restorePixelRatio = setDevicePixelRatio(2);
    try {
      openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());
      const canvas = prepareChessCanvas();

      await Promise.resolve();
      updateChessGamePanel(createChessGame({
        fen: '8/8/8/8/8/8/8/RNBQKBNR w - - 0 1',
        turn: 'white'
      }), 'me-user');

      expect(canvas.width).toBe(448);
      expect(canvas.height).toBe(448);
    } finally {
      restorePixelRatio();
    }
  });

  it('uses a minimum canvas pixel ratio and resizes when the ratio changes', () => {
    const restorePixelRatio = setDevicePixelRatio(0);
    try {
      openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());
      const canvas = prepareChessCanvas();

      expect(canvas.width).toBe(224);
      expect(canvas.height).toBe(224);

      setDevicePixelRatio(2);
      updateChessGamePanel(createChessGame({ turn: 'white' }), 'me-user');

      expect(canvas.width).toBe(448);
      expect(canvas.height).toBe(448);
    } finally {
      restorePixelRatio();
    }
  });

  it('shows game sounds enabled by default', () => {
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());

    const button = getSoundToggleButton();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Mute game sounds');
    expect(button.title).toBe('Mute game sounds');
  });

  it('persists the game sound toggle and skips playback while muted', async () => {
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());

    const button = getSoundToggleButton();
    button.click();

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Unmute game sounds');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: false
    });

    updateChessGamePanel(createChessGame({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      turn: 'black'
    }), 'me-user');

    expect(getPlayedAudioMocks()).toHaveLength(0);

    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: true
    });

    updateChessGamePanel(createChessGame({
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
      turn: 'white'
    }), 'me-user');

    expect(getAudioMock('games/chess/move.mp3').play).toHaveBeenCalledOnce();
    await expect(chrome.storage.local.get(PLAYGROUND_GAME_SOUNDS_STORAGE_KEY)).resolves.toEqual({
      [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: true
    });
  });

  it('restores the muted game sound preference for the next game panel', async () => {
    await chrome.storage.local.set({ [PLAYGROUND_GAME_SOUNDS_STORAGE_KEY]: false });
    vi.mocked(chrome.storage.local.set).mockClear();

    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());
    await Promise.resolve();

    expect(getSoundToggleButton().getAttribute('aria-pressed')).toBe('false');

    updateChessGamePanel(createChessGame({
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      turn: 'black'
    }), 'me-user');

    expect(getPlayedAudioMocks()).toHaveLength(0);
  });

  it('shows check as a temporary centered status message', () => {
    openChessGamePanel(createChessGame({ turn: 'white' }), 'me-user', vi.fn());

    updateChessGamePanel(createChessGame({
      fen: '4k3/8/8/8/8/8/4Q3/4K3 b - - 0 1',
      turn: 'black'
    }), 'me-user');

    expect(getStatusMessage()).toBe('Check');
    expect(getStatusElement()?.dataset.temporary).toBe('true');

    vi.advanceTimersByTime(1500);

    expect(getStatusElement()?.hidden).toBe(true);
    expect(getStatusMessage()).toBe('');
  });

  it.each([
    ['checkmate', 'Checkmate'],
    ['draw', 'Draw'],
    ['resigned', 'Resigned']
  ] as const)('keeps %s visible as a centered status message', (status, message) => {
    openChessGamePanel(createChessGame({ status, turn: 'white' }), 'me-user', vi.fn());

    expect(getStatusMessage()).toBe(message);
    expect(getStatusElement()?.dataset.temporary).toBe('false');

    vi.advanceTimersByTime(1500);

    expect(getStatusMessage()).toBe(message);
    expect(getStatusElement()?.hidden).toBe(false);
  });
});

function createChessGame({
  fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  lastMove,
  status = 'active',
  turn
}: {
  fen?: string;
  lastMove?: PublicChessGame['lastMove'];
  status?: PublicChessGame['status'];
  turn: 'black' | 'white';
}): PublicChessGame {
  return {
    fen,
    gameId: 'game-1',
    gameType: 'chess',
    lastMove,
    pgn: '',
    players: {
      black: {
        displayName: 'Other player',
        userId: 'other-user'
      },
      white: {
        displayName: 'Me',
        userId: 'me-user'
      }
    },
    status,
    turn
  };
}

function prepareChessCanvas(): HTMLCanvasElement {
  const canvas = document.querySelector<HTMLCanvasElement>('.ytcq-chess-board-canvas');
  if (!canvas) throw new Error('Missing chess canvas.');

  const body = canvas.closest<HTMLElement>('.ytcq-chess-game-body');
  if (!body) throw new Error('Missing chess body.');

  mockRect(canvas, { height: 224, left: 0, top: 0, width: 224 });
  mockRect(body, { height: 234, left: 0, top: 0, width: 244 });
  return canvas;
}

function clickChessSquare(canvas: HTMLCanvasElement, square: string): void {
  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || !rank) throw new Error(`Bad square: ${square}`);

  clickDisplayedSquare(canvas, { x: file, y: 8 - rank });
}

function clickDisplayedSquare(canvas: HTMLCanvasElement, square: { x: number; y: number }): void {
  const tileSize = 224 / 8;
  const clientX = square.x * tileSize + tileSize / 2;
  const clientY = square.y * tileSize + tileSize / 2;
  canvas.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    clientX,
    clientY
  }));
}

function moveDisplayedSquare(canvas: HTMLCanvasElement, square: { x: number; y: number }): void {
  const tileSize = 224 / 8;
  const clientX = square.x * tileSize + tileSize / 2;
  const clientY = square.y * tileSize + tileSize / 2;
  canvas.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    clientX,
    clientY
  }));
}

function getFeedbackMessages(): string[] {
  return getFeedbackBubbles()
    .map((element) => element.textContent || '');
}

function getFeedbackBubbles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ytcq-chess-feedback-message'));
}

function getStatusElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.ytcq-chess-game-status');
}

function getSoundToggleButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('.ytcq-chess-game-sound-toggle');
  if (!button) throw new Error('Missing chess sound toggle.');
  return button;
}

function getAudioMock(path: string): AudioMock {
  const src = `chrome-extension://test/${path}`;
  const audio = audioMocks.find((mock) => mock.src === src);
  if (!audio) throw new Error(`Missing audio mock for ${src}.`);
  return audio;
}

function getPlayedAudioMocks(): AudioMock[] {
  return audioMocks.filter((mock) => mock.play.mock.calls.length > 0);
}

function getStatusMessage(): string {
  return getStatusElement()?.textContent || '';
}

function mockRect(
  element: Element,
  rect: {
    height: number;
    left: number;
    top: number;
    width: number;
  }
): void {
  const fullRect = {
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    toJSON: () => ({}),
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top
  } as DOMRect;

  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => fullRect
  });
}

function createMockChessCanvasContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    imageSmoothingEnabled: false,
    lineWidth: 1,
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    strokeStyle: ''
  };
}

function setDevicePixelRatio(value: number): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value
  });

  return () => {
    if (descriptor) {
      Object.defineProperty(window, 'devicePixelRatio', descriptor);
      return;
    }

    Reflect.deleteProperty(window, 'devicePixelRatio');
  };
}
