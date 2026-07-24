import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamePanelMountContext, GamePanelUpdateContext } from '../adapter';
import type { PlaygroundClientState } from '../client';
import type { PublicBountyHuntingGame } from './types';

const panelMock = vi.hoisted(() => ({
  closeBountyHuntingGamePanel: vi.fn(),
  handleBountyHuntingActionError: vi.fn(),
  openBountyHuntingGamePanel: vi.fn(),
  resetBountyHuntingGameClientState: vi.fn(),
  setBountyHuntingCompactMode: vi.fn(),
  updateBountyHuntingGamePanel: vi.fn()
}));

vi.mock('./panel', () => panelMock);

import {
  bountyHuntingGame,
  bountyHuntingGameAdapter
} from './adapter';

describe('Bounty Hunting game adapter', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens Bounty Hunting panels and returns a handle', () => {
    const game = createBountyHuntingGame();
    const context = createMountContext();
    const handle = bountyHuntingGameAdapter.mountPanel(game, context);

    expect(panelMock.openBountyHuntingGamePanel).toHaveBeenCalledWith(
      context.shell,
      game,
      'host-user',
      expect.any(Function),
      context.onPanelChange,
      context.closePanel,
      context.controls
    );
    const sendAction = panelMock.openBountyHuntingGamePanel.mock.calls[0][3] as (
      gameId: string,
      action: string,
      payload?: Record<string, unknown>
    ) => void;
    expect(sendAction).toBe(context.sendGameAction);
    sendAction('game-1', 'shootBounty', { messageId: 'message-1' });
    expect(context.sendGameAction).toHaveBeenCalledWith(
      'game-1',
      'shootBounty',
      { messageId: 'message-1' }
    );
    sendAction('game-1', 'ready');
    expect(context.sendGameAction).toHaveBeenCalledWith('game-1', 'ready');
    sendAction('game-1', 'observeBountyMessage', { observations: [] });
    expect(context.sendGameAction).toHaveBeenCalledWith(
      'game-1',
      'observeBountyMessage',
      { observations: [] }
    );
    expect(handle.gameId).toBe('game-1');
    handle.setCompactMode?.(true);
    expect(panelMock.setBountyHuntingCompactMode).toHaveBeenCalledWith(true);
    handle.close();
    expect(panelMock.closeBountyHuntingGamePanel).toHaveBeenCalledOnce();
  });

  it('updates the active Bounty Hunting panel from client state', () => {
    const game = createBountyHuntingGame();
    bountyHuntingGameAdapter.updatePanel(game, createUpdateContext({
      currentUserId: 'host-user'
    }));

    expect(panelMock.updateBountyHuntingGamePanel).toHaveBeenCalledWith(game, 'host-user');
  });

  it('routes correlated action errors to the Bounty Hunting panel', () => {
    panelMock.handleBountyHuntingActionError.mockReturnValue(true);
    const error = {
      code: 'rate_limited',
      message: 'Slow down.',
      request: {
        action: 'shootBounty',
        gameId: 'game-1',
        type: 'gameAction' as const
      }
    };

    expect(bountyHuntingGame.handleActionError?.(error)).toBe(true);
    expect(panelMock.handleBountyHuntingActionError).toHaveBeenCalledWith(error);
  });
});

function createBountyHuntingGame(overrides: Partial<PublicBountyHuntingGame> = {}): PublicBountyHuntingGame {
  return {
    bounties: [],
    bountyProviderUserId: 'host-user',
    gameId: 'game-1',
    gameType: 'bounty-hunting',
    phaseStartedAt: 0,
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
    readyPlayers: {},
    scores: {
      guest: 0,
      host: 0
    },
    status: 'preparing',
    ...overrides
  };
}

function createMountContext(overrides: Partial<GamePanelMountContext> = {}): GamePanelMountContext {
  return {
    closePanel: vi.fn(),
    controls: {
      setCompactMode: vi.fn(),
      setPosition: vi.fn()
    },
    currentUserId: 'host-user',
    onPanelChange: vi.fn(),
    sendGameAction: vi.fn(),
    shell: {} as GamePanelMountContext['shell'],
    ...overrides
  };
}

function createUpdateContext(overrides: Partial<GamePanelUpdateContext> = {}): GamePanelUpdateContext {
  return {
    clientState: createClientState({ userId: 'host-user' }),
    currentUserId: 'host-user',
    ...overrides
  };
}

function createClientState(overrides: Partial<PlaygroundClientState> = {}): PlaygroundClientState {
  return {
    available: false,
    connectionError: '',
    endedGame: null,
    games: [],
    incompatibleActiveGames: [],
    incompatibleGames: [],
    invites: [],
    status: 'connected',
    userId: '',
    users: [],
    ...overrides
  };
}
