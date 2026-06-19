import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GamePanelMountContext, GamePanelUpdateContext } from '../adapter';
import type { PlaygroundClientState } from '../client';
import type { PublicReplayTriviaGame } from './types';

const panelMock = vi.hoisted(() => ({
  closeReplayTriviaGamePanel: vi.fn(),
  openReplayTriviaGamePanel: vi.fn(),
  updateReplayTriviaGamePanel: vi.fn()
}));

vi.mock('./panel', () => panelMock);

import { replayTriviaGameAdapter } from './adapter';
import { handleReplayTriviaServerMessage, resetReplayTriviaClientData } from './client-data';

describe('Replay Trivia game adapter', () => {
  afterEach(() => {
    resetReplayTriviaClientData();
    vi.clearAllMocks();
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
      context.closePanel
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
      ''
    );
  });

  it('passes preparation errors from the update state', () => {
    const game = createReplayTriviaGame();
    const clientState = createClientState({
      error: 'Replay Trivia questions must include friendIntro.',
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
      'Replay Trivia questions must include friendIntro.'
    );
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
