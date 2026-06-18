import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamePanelMountContext, GamePanelUpdateContext } from '../adapter';
import type { PlaygroundClientState } from '../client';
import type { PublicChessGame } from './types';

const panelMock = vi.hoisted(() => ({
  closeChessGamePanel: vi.fn(),
  openChessGamePanel: vi.fn(),
  updateChessGamePanel: vi.fn()
}));

vi.mock('./panel', () => panelMock);

import { chessGameAdapter } from './adapter';

describe('chess game adapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens chess panels, returns a handle, and converts move payloads', () => {
    const sendGameAction = vi.fn();
    const onPanelChange = vi.fn();

    const game = createChessGame();
    const context = createMountContext({
      onPanelChange,
      sendGameAction
    });
    const handle = chessGameAdapter.mountPanel(game, context);
    const moveCallback = panelMock.openChessGamePanel.mock.calls[0][3] as (
      gameId: string,
      from: string,
      to: string,
      promotion?: string
    ) => void;
    moveCallback('game-1', 'e2', 'e4');
    moveCallback('game-1', 'e7', 'e8', 'q');

    expect(panelMock.openChessGamePanel).toHaveBeenCalledWith(
      context.shell,
      game,
      'white-user',
      expect.any(Function),
      onPanelChange
    );
    expect(handle.gameId).toBe('game-1');
    handle.close();
    expect(panelMock.closeChessGamePanel).toHaveBeenCalledOnce();
    expect(sendGameAction).toHaveBeenNthCalledWith(1, 'game-1', 'move', {
      from: 'e2',
      to: 'e4'
    });
    expect(sendGameAction).toHaveBeenNthCalledWith(2, 'game-1', 'move', {
      from: 'e7',
      promotion: 'q',
      to: 'e8'
    });
  });

  it('updates the active chess panel from client state', () => {
    const game = createChessGame();
    const clientState = createClientState({
      games: [game],
      userId: 'white-user'
    });

    chessGameAdapter.updatePanel(game, createUpdateContext({
      clientState,
      currentUserId: 'white-user',
    }));

    expect(panelMock.updateChessGamePanel).toHaveBeenCalledWith(game, 'white-user');
  });
});

function createChessGame(overrides: Partial<PublicChessGame> = {}): PublicChessGame {
  return {
    fen: 'startpos',
    gameId: 'game-1',
    gameType: 'chess',
    pgn: '',
    players: {
      black: {
        displayName: 'Black Player',
        userId: 'black-user'
      },
      white: {
        displayName: 'White Player',
        userId: 'white-user'
      }
    },
    status: 'active',
    turn: 'white',
    ...overrides
  };
}

function createMountContext(overrides: Partial<GamePanelMountContext> = {}): GamePanelMountContext {
  return {
    closePanel: vi.fn(),
    currentUserId: 'white-user',
    onPanelChange: vi.fn(),
    sendGameAction: vi.fn(),
    shell: {} as GamePanelMountContext['shell'],
    ...overrides
  };
}

function createUpdateContext(overrides: Partial<GamePanelUpdateContext> = {}): GamePanelUpdateContext {
  return {
    clientState: createClientState({ userId: 'white-user' }),
    currentUserId: 'white-user',
    ...overrides
  };
}

function createClientState(overrides: Partial<PlaygroundClientState> = {}): PlaygroundClientState {
  return {
    available: false,
    endedGame: null,
    error: '',
    games: [],
    invites: [],
    status: 'connected',
    userId: '',
    users: [],
    ...overrides
  };
}
