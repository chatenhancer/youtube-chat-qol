import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicGame } from '../../../../shared/playground-protocol';
import type { PlaygroundClientState } from '../client';

const panelMock = vi.hoisted(() => ({
  closeReplayTriviaGamePanel: vi.fn(),
  getActiveReplayTriviaGameId: vi.fn(() => ''),
  getReplayTriviaGamePanelOverlay: vi.fn(() => null),
  isPublicReplayTriviaGame: vi.fn((game: unknown) =>
    Boolean(game && typeof game === 'object' && (game as { gameType?: unknown }).gameType === 'replay-trivia')
  ),
  isReplayTriviaGamePanelOpen: vi.fn(() => false),
  openReplayTriviaGamePanel: vi.fn(),
  updateReplayTriviaGamePanel: vi.fn()
}));

vi.mock('./panel', () => panelMock);

import { replayTriviaGameAdapter } from './adapter';

describe('Replay Trivia game adapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
    panelMock.getActiveReplayTriviaGameId.mockReturnValue('');
    panelMock.isPublicReplayTriviaGame.mockImplementation((game: unknown) =>
      Boolean(game && typeof game === 'object' && (game as { gameType?: unknown }).gameType === 'replay-trivia')
    );
  });

  it('returns opponent labels with defensive fallbacks', () => {
    expect(replayTriviaGameAdapter.getOpponentLabel({ gameType: 'chess' } as PublicGame, 'host-user')).toBe('Player');
    expect(replayTriviaGameAdapter.getOpponentLabel(createReplayTriviaGame(), 'host-user')).toBe('Guest Player');
    expect(replayTriviaGameAdapter.getOpponentLabel(createReplayTriviaGame(), 'guest-user')).toBe('Host Player');
    expect(replayTriviaGameAdapter.getOpponentLabel(createReplayTriviaGame({
      players: {
        guest: { displayName: '', userId: 'guest-user' },
        host: { displayName: '', userId: 'host-user' }
      }
    }), 'host-user')).toBe('Player');
  });

  it('opens only valid Replay Trivia panels', () => {
    const sendGameAction = vi.fn();
    const onPanelChange = vi.fn();

    replayTriviaGameAdapter.openPanel({ gameType: 'chess' } as PublicGame, 'host-user', sendGameAction, onPanelChange);
    expect(panelMock.openReplayTriviaGamePanel).not.toHaveBeenCalled();

    const game = createReplayTriviaGame();
    replayTriviaGameAdapter.openPanel(game, 'host-user', sendGameAction, onPanelChange);

    expect(panelMock.openReplayTriviaGamePanel).toHaveBeenCalledWith(
      game,
      'host-user',
      sendGameAction,
      onPanelChange
    );
  });

  it('updates the active Replay Trivia panel from client state', () => {
    const game = createReplayTriviaGame();
    panelMock.getActiveReplayTriviaGameId.mockReturnValue('game-1');

    replayTriviaGameAdapter.updatePanel(createClientState({
      games: [game],
      replayTriviaGenerationTokens: {
        'game-1': {
          expiresAt: 123,
          gameId: 'game-1',
          generationToken: 'rtg_1234567890abcdef'
        }
      },
      userId: 'host-user'
    }));

    expect(panelMock.updateReplayTriviaGamePanel).toHaveBeenCalledWith(
      game,
      'host-user',
      {
        expiresAt: 123,
        gameId: 'game-1',
        generationToken: 'rtg_1234567890abcdef'
      },
      ''
    );
  });

  it('ignores inactive, anonymous, missing, or invalid panel update states', () => {
    replayTriviaGameAdapter.updatePanel(createClientState({ userId: 'host-user' }));
    panelMock.getActiveReplayTriviaGameId.mockReturnValue('game-1');
    replayTriviaGameAdapter.updatePanel(createClientState({ userId: '' }));
    replayTriviaGameAdapter.updatePanel(createClientState({
      games: [],
      userId: 'host-user'
    }));
    replayTriviaGameAdapter.updatePanel(createClientState({
      games: [{ gameId: 'game-1', gameType: 'chess', status: 'active' } as PublicGame],
      userId: 'host-user'
    }));

    expect(panelMock.updateReplayTriviaGamePanel).not.toHaveBeenCalled();
  });
});

function createReplayTriviaGame(overrides: Partial<PublicGame> = {}): PublicGame {
  return {
    gameId: 'game-1',
    gameType: 'replay-trivia',
    players: {
      guest: {
        displayName: 'Guest Player',
        userId: 'guest-user'
      },
      host: {
        displayName: 'Host Player',
        userId: 'host-user'
      }
    },
    status: 'question',
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
