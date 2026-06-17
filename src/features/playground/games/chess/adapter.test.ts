import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicGame } from '../../../../shared/playground-protocol';
import type { PlaygroundClientState } from '../client';

const panelMock = vi.hoisted(() => ({
  closeChessGamePanel: vi.fn(),
  getActiveChessGameId: vi.fn(() => ''),
  getChessGamePanelOverlay: vi.fn(() => null),
  isChessGamePanelOpen: vi.fn(() => false),
  isPublicChessGame: vi.fn((game: unknown) =>
    Boolean(game && typeof game === 'object' && (game as { gameType?: unknown }).gameType === 'chess')
  ),
  openChessGamePanel: vi.fn(),
  updateChessGamePanel: vi.fn()
}));

vi.mock('./panel', () => panelMock);

import { chessGameAdapter } from './adapter';

describe('chess game adapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
    panelMock.getActiveChessGameId.mockReturnValue('');
    panelMock.isPublicChessGame.mockImplementation((game: unknown) =>
      Boolean(game && typeof game === 'object' && (game as { gameType?: unknown }).gameType === 'chess')
    );
  });

  it('returns opponent labels with defensive fallbacks', () => {
    expect(chessGameAdapter.getOpponentLabel({ gameType: 'replay-trivia' } as PublicGame, 'white-user')).toBe('Player');
    expect(chessGameAdapter.getOpponentLabel(createChessGame(), 'white-user')).toBe('Black Player');
    expect(chessGameAdapter.getOpponentLabel(createChessGame(), 'black-user')).toBe('White Player');
    expect(chessGameAdapter.getOpponentLabel(createChessGame({
      players: {
        black: { displayName: '', userId: 'black-user' },
        white: { displayName: '', userId: 'white-user' }
      }
    }), 'white-user')).toBe('Player');
  });

  it('opens only valid chess panels and converts move payloads', () => {
    const sendGameAction = vi.fn();
    const onPanelChange = vi.fn();

    chessGameAdapter.openPanel({ gameType: 'replay-trivia' } as PublicGame, 'white-user', sendGameAction, onPanelChange);
    expect(panelMock.openChessGamePanel).not.toHaveBeenCalled();

    const game = createChessGame();
    chessGameAdapter.openPanel(game, 'white-user', sendGameAction, onPanelChange);
    const moveCallback = panelMock.openChessGamePanel.mock.calls[0][2] as (
      gameId: string,
      from: string,
      to: string,
      promotion?: string
    ) => void;
    moveCallback('game-1', 'e2', 'e4');
    moveCallback('game-1', 'e7', 'e8', 'q');

    expect(panelMock.openChessGamePanel).toHaveBeenCalledWith(
      game,
      'white-user',
      expect.any(Function),
      onPanelChange
    );
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
    panelMock.getActiveChessGameId.mockReturnValue('game-1');

    chessGameAdapter.updatePanel(createClientState({
      games: [game],
      userId: 'white-user'
    }));

    expect(panelMock.updateChessGamePanel).toHaveBeenCalledWith(game, 'white-user');
  });

  it('ignores inactive, anonymous, missing, or invalid panel update states', () => {
    chessGameAdapter.updatePanel(createClientState({ userId: 'white-user' }));
    panelMock.getActiveChessGameId.mockReturnValue('game-1');
    chessGameAdapter.updatePanel(createClientState({ userId: '' }));
    chessGameAdapter.updatePanel(createClientState({
      games: [],
      userId: 'white-user'
    }));
    chessGameAdapter.updatePanel(createClientState({
      games: [{ gameId: 'game-1', gameType: 'replay-trivia', status: 'question' } as PublicGame],
      userId: 'white-user'
    }));

    expect(panelMock.updateChessGamePanel).not.toHaveBeenCalled();
  });
});

function createChessGame(overrides: Partial<PublicGame> = {}): PublicGame {
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
  } as PublicGame;
}

function createClientState(overrides: Partial<PlaygroundClientState> = {}): PlaygroundClientState {
  return {
    available: false,
    endedGame: null,
    error: '',
    games: [],
    invites: [],
    replayTriviaGenerationTokens: {},
    status: 'connected',
    userId: '',
    users: [],
    ...overrides
  };
}
