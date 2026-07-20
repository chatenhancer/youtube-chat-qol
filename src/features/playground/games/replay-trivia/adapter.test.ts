import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamePanelMountContext, GamePanelUpdateContext } from '../adapter';
import type { PlaygroundClientState } from '../client';
import type { PublicReplayTriviaGame } from './types';

const panelMock = vi.hoisted(() => ({
  closeReplayTriviaGamePanel: vi.fn(),
  handleReplayTriviaPanelActionError: vi.fn(() => false),
  openReplayTriviaGamePanel: vi.fn(),
  resetReplayTriviaGamePanelClientState: vi.fn(),
  updateReplayTriviaGamePanel: vi.fn()
}));

vi.mock('./panel', () => panelMock);

import { replayTriviaGameAdapter, replayTriviaGameDefinition } from './adapter';
import {
  handleReplayTriviaActionError,
  handleReplayTriviaServerMessage,
  resetReplayTriviaClientData,
  takeReplayTriviaGenerationToken,
  takeReplayTriviaPreparationError
} from './client-data';

describe('Replay Trivia game adapter', () => {
  afterEach(() => {
    resetReplayTriviaClientData();
    vi.clearAllMocks();
  });

  it('declares replay-only availability', () => {
    expect(replayTriviaGameDefinition.availability).toBe('replay');
  });

  it('opens Replay Trivia panels and returns a handle', () => {
    const sendGameAction = vi.fn();
    const onPanelChange = vi.fn();

    const game = createReplayTriviaGame();
    const context = createMountContext({
      onPanelChange,
      sendGameAction
    });
    const handle = replayTriviaGameAdapter.mountPanel(game, context);

    expect(panelMock.openReplayTriviaGamePanel).toHaveBeenCalledWith(
      context.shell,
      game,
      'host-user',
      sendGameAction,
      onPanelChange,
      context.closePanel,
      {
        generationToken: undefined,
        preparationError: undefined
      }
    );
    expect(handle.gameId).toBe('game-1');
    handle.close();
    expect(panelMock.closeReplayTriviaGamePanel).toHaveBeenCalledOnce();
  });

  it('updates the active Replay Trivia panel from client state', () => {
    const game = createReplayTriviaGame();
    const clientState = createClientState({
      games: [game],
      userId: 'host-user'
    });
    handleReplayTriviaServerMessage({
      expiresAt: 123,
      gameId: 'game-1',
      generationToken: 'rtg_1234567890abcdef',
      type: 'replayTriviaGenerationToken'
    });

    replayTriviaGameAdapter.updatePanel(game, createUpdateContext({
      clientState,
      currentUserId: 'host-user'
    }));

    expect(panelMock.updateReplayTriviaGamePanel).toHaveBeenCalledWith(
      game,
      'host-user',
      {
        expiresAt: 123,
        gameId: 'game-1',
        generationToken: 'rtg_1234567890abcdef'
      },
      undefined
    );

    panelMock.updateReplayTriviaGamePanel.mockClear();
    replayTriviaGameAdapter.updatePanel(game, createUpdateContext({
      clientState,
      currentUserId: 'host-user'
    }));
    expect(panelMock.updateReplayTriviaGamePanel).toHaveBeenCalledWith(
      game,
      'host-user',
      undefined,
      undefined
    );
  });

  it('clears unused generation tokens once preparation finishes', () => {
    handleReplayTriviaServerMessage({
      expiresAt: 123,
      gameId: 'game-1',
      generationToken: 'rtg_1234567890abcdef',
      type: 'replayTriviaGenerationToken'
    });
    expect(takeReplayTriviaGenerationToken('game-1')).toBeDefined();
    handleReplayTriviaServerMessage({
      expiresAt: 123,
      gameId: 'game-1',
      generationToken: 'rtg_1234567890abcdef',
      type: 'replayTriviaGenerationToken'
    });

    handleReplayTriviaServerMessage({
      game: createReplayTriviaGame({ status: 'countdown' }),
      type: 'gameUpdated'
    });

    expect(takeReplayTriviaGenerationToken('game-1')).toBeUndefined();
  });

  it('passes only correlated Replay Trivia preparation errors to the panel', () => {
    const game = createReplayTriviaGame({ status: 'preparing' });

    expect(handleReplayTriviaActionError({
      code: 'bad_action',
      message: 'Unrelated action failed.'
    })).toBe(false);
    expect(handleReplayTriviaActionError({
      code: 'bad_action',
      message: 'Unrelated game action failed.',
      request: {
        action: 'move',
        gameId: 'game-1',
        type: 'gameAction'
      }
    })).toBe(false);
    expect(handleReplayTriviaActionError({
      code: 'invalid_question',
      message: 'Replay Trivia questions must include friendIntro.',
      request: {
        action: 'submitQuestions',
        gameId: 'game-1',
        type: 'gameAction'
      }
    })).toBe(true);

    replayTriviaGameAdapter.updatePanel(game, createUpdateContext({
      currentUserId: 'host-user'
    }));

    expect(panelMock.updateReplayTriviaGamePanel).toHaveBeenCalledWith(
      game,
      'host-user',
      undefined,
      'Replay Trivia questions must include friendIntro.'
    );
    expect(takeReplayTriviaPreparationError('game-1')).toBeUndefined();
  });

  it('mounts a closed preparation panel with its correlated error before retrying', () => {
    const game = createReplayTriviaGame({ status: 'preparing' });
    handleReplayTriviaActionError({
      code: 'rate_limited',
      message: 'Slow down before requesting more generated content.',
      request: {
        action: 'requestGenerationToken',
        gameId: 'game-1',
        type: 'gameAction'
      }
    });
    const context = createMountContext();

    replayTriviaGameAdapter.mountPanel(game, context);

    expect(panelMock.openReplayTriviaGamePanel).toHaveBeenCalledWith(
      context.shell,
      game,
      'host-user',
      context.sendGameAction,
      context.onPanelChange,
      context.closePanel,
      {
        generationToken: undefined,
        preparationError: 'Slow down before requesting more generated content.'
      }
    );
  });

  it('leaves game-version errors to generic compatibility handling', () => {
    expect(handleReplayTriviaActionError({
      code: 'game_version',
      message: 'Chat Enhancer and Playground versions do not match for this game.',
      request: {
        action: 'requestGenerationToken',
        gameId: 'game-1',
        type: 'gameAction'
      }
    })).toBe(false);
    expect(takeReplayTriviaPreparationError('game-1')).toBeUndefined();
  });
});

function createReplayTriviaGame(overrides: Partial<PublicReplayTriviaGame> = {}): PublicReplayTriviaGame {
  return {
    answers: {},
    currentQuestionIndex: 0,
    gameId: 'game-1',
    gameType: 'replay-trivia',
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
    questionProviderUserId: 'host-user',
    scores: {
      guest: 0,
      host: 0
    },
    status: 'question',
    totalQuestions: 1,
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
