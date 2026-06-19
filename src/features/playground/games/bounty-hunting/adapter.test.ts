import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamePanelMountContext, GamePanelUpdateContext } from '../adapter';
import type { PlaygroundClientState } from '../client';
import type { PublicBountyHuntingGame } from './types';

const panelMock = vi.hoisted(() => ({
  closeBountyHuntingGamePanel: vi.fn(),
  openBountyHuntingGamePanel: vi.fn(),
  setBountyHuntingCompactMode: vi.fn(),
  updateBountyHuntingGamePanel: vi.fn()
}));

vi.mock('./panel', () => panelMock);

import { bountyHuntingGameAdapter, bountyHuntingGameDefinition } from './adapter';

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
      context.sendGameAction,
      context.onPanelChange,
      context.closePanel,
      context.controls
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

  it('uses the full game label and short panel title keys', () => {
    expect(bountyHuntingGameDefinition.labelKey).toBe('gamesBountyHunting');
    expect(bountyHuntingGameDefinition.panelTitleKey).toBe('gamesBountyHuntingPanelTitle');
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
