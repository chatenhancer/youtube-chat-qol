import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GameId,
  LobbySnapshot,
  PlaygroundBackgroundMessage,
  PlaygroundContentMessage,
  PublicGame,
  PublicInvite
} from '../../../shared/playground/protocol';
import { clearToast } from '../../../shared/toast';
import {
  cancelPlaygroundInvite,
  getPlaygroundAvailability,
  getPlaygroundClientState,
  respondToPlaygroundInvite,
  sendPlaygroundGameAction,
  sendPlaygroundInvite,
  setPlaygroundAvailability,
  startPlaygroundClient,
  stopPlaygroundClient,
  subscribePlaygroundClient
} from './client';
import {
  takeReplayTriviaGenerationToken,
  takeReplayTriviaPreparationError
} from './replay-trivia/client-data';

describe('Playground games client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/watch?v=stream-a');
    mockPorts.length = 0;
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
  });

  afterEach(() => {
    stopPlaygroundClient();
    clearToast();
    vi.useRealTimers();
    delete (chrome.runtime as Partial<typeof chrome.runtime>).connect;
  });

  it('reports an unavailable stream without opening a runtime port', async () => {
    window.history.replaceState({}, '', '/watch');
    vi.resetModules();
    vi.doMock('../../../youtube/source-url', () => ({
      getCurrentYouTubeChatStreamKey: () => ''
    }));
    const client = await import('./client');
    const listener = vi.fn();
    const unsubscribe = client.subscribePlaygroundClient(listener);

    client.startPlaygroundClient(true);

    expect(chrome.runtime.connect).not.toHaveBeenCalled();
    expect(client.getPlaygroundClientState()).toMatchObject({
      connectionError: 'Stream unavailable.',
      status: 'disconnected'
    });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      connectionError: 'Stream unavailable.'
    }));
    unsubscribe();
    client.stopPlaygroundClient();
    vi.doUnmock('../../../youtube/source-url');
    vi.resetModules();
  });

  it('surfaces runtime connect failures and non-Error exceptions', () => {
    chrome.runtime.connect = vi.fn(() => {
      throw new Error('No extension context.');
    });
    startPlaygroundClient(true);

    expect(getPlaygroundClientState()).toMatchObject({
      connectionError: 'No extension context.',
      status: 'disconnected'
    });

    chrome.runtime.connect = vi.fn(() => {
      throw 'port unavailable';
    });
    startPlaygroundClient(true);

    expect(getPlaygroundClientState()).toMatchObject({
      connectionError: 'Playground unavailable.',
      status: 'disconnected'
    });
  });

  it('opens, reuses, and stops the runtime port for the current stream', () => {
    startPlaygroundClient(true);
    startPlaygroundClient(false);
    const port = lastMockPort()!;

    expect(chrome.runtime.connect).toHaveBeenCalledTimes(1);
    expect(port.messages).toEqual([
      {
        availableGames: ['chess', 'bounty-hunting', 'stick-around'],
        languageCode: 'en',
        locale: 'en',
        streamKey: 'stream-a',
        type: 'ytcq:playground:init'
      }
    ]);
    expect(port.onMessage.addListener).toHaveBeenCalledOnce();
    expect(port.onDisconnect.addListener).toHaveBeenCalledOnce();

    stopPlaygroundClient();

    expect(port.messages.at(-1)).toEqual({ type: 'ytcq:playground:disconnect' });
    expect(port.disconnect).toHaveBeenCalledOnce();
    expect(port.onMessage.removeListener).toHaveBeenCalledOnce();
    expect(port.onDisconnect.removeListener).toHaveBeenCalledOnce();
    expect(getPlaygroundClientState().status).toBe('disconnected');
    expect(getPlaygroundClientState().incompatibleGames).toEqual([]);
  });

  it('preserves current-stream availability until the stream changes', () => {
    startPlaygroundClient(false);
    const port = lastMockPort()!;

    expect(getPlaygroundAvailability(true)).toBe(false);
    expect(getPlaygroundClientState().available).toBe(false);

    setPlaygroundAvailability(true);
    expect(getPlaygroundAvailability(false)).toBe(true);
    expect(getPlaygroundClientState().available).toBe(true);

    startPlaygroundClient(false);
    expect(port.messages.at(-1)).toEqual({
      availableGames: ['chess', 'bounty-hunting', 'stick-around'],
      type: 'ytcq:playground:set-availability'
    });

    window.history.replaceState({}, '', '/watch?v=stream-b');
    expect(getPlaygroundAvailability(false)).toBe(false);
    startPlaygroundClient(false);

    expect(getPlaygroundClientState().available).toBe(false);
    expect(port.messages.at(-1)).toEqual({
      availableGames: [],
      languageCode: 'en',
      locale: 'en',
      streamKey: 'stream-b',
      type: 'ytcq:playground:init'
    });
  });

  it('posts availability, invites, invite responses, and game actions when connected', () => {
    startPlaygroundClient(false);
    const port = lastMockPort()!;

    setPlaygroundAvailability(true);
    sendPlaygroundInvite('chess', 'luna-user');
    cancelPlaygroundInvite('chess', 'luna-user');
    respondToPlaygroundInvite('invite-1', false);
    sendPlaygroundGameAction('game-1', 'move', { from: 'e2', to: 'e4' });
    sendPlaygroundGameAction('game-1', 'leave');
    sendPlaygroundGameAction('game-2', 'shootBounty', { messageId: 'message-1' });
    sendPlaygroundGameAction('game-2', 'observeBountyMessage', {
      observations: []
    });

    expect(port.messages.slice(1)).toEqual([
      {
        availableGames: ['chess', 'bounty-hunting', 'stick-around'],
        type: 'ytcq:playground:set-availability'
      },
      {
        gameId: 'chess',
        toUserId: 'luna-user',
        type: 'ytcq:playground:invite'
      },
      {
        gameId: 'chess',
        toUserId: 'luna-user',
        type: 'ytcq:playground:cancel-invite'
      },
      {
        accept: false,
        inviteId: 'invite-1',
        type: 'ytcq:playground:respond-invite'
      },
      {
        action: 'move',
        gameId: 'game-1',
        payload: { from: 'e2', to: 'e4' },
        type: 'ytcq:playground:game-action'
      },
      {
        action: 'leave',
        gameId: 'game-1',
        payload: undefined,
        type: 'ytcq:playground:game-action'
      },
      {
        action: 'shootBounty',
        gameId: 'game-2',
        payload: { messageId: 'message-1' },
        type: 'ytcq:playground:game-action'
      },
      {
        action: 'observeBountyMessage',
        gameId: 'game-2',
        payload: { observations: [] },
        type: 'ytcq:playground:game-action'
      }
    ]);
  });

  it('waits for the server to confirm outgoing invite cancellations', () => {
    startPlaygroundClient(true);
    const port = lastMockPort()!;
    const outgoingInvite = {
      ...createInvite('invite-out-1', 'pending'),
      fromUser: createUser('me-user', 'Me'),
      toUser: createUser('luna-user', 'Luna Chat')
    };
    port.emit(createSnapshotMessage({
      games: [],
      invites: [outgoingInvite],
      users: [createUser('me-user', 'Me'), createUser('luna-user', 'Luna Chat')]
    }));

    cancelPlaygroundInvite('chess', 'luna-user');

    expect(getPlaygroundClientState().invites).toEqual([outgoingInvite]);
    expect(port.messages.at(-1)).toEqual({
      gameId: 'chess',
      toUserId: 'luna-user',
      type: 'ytcq:playground:cancel-invite'
    });

    port.emit({
      message: {
        invite: {
          ...outgoingInvite,
          status: 'cancelled'
        },
        type: 'inviteUpdated'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(getPlaygroundClientState().invites).toEqual([]);
  });

  it('updates local state from background status, snapshots, and server messages', () => {
    const listener = vi.fn();
    const unsubscribe = subscribePlaygroundClient(listener);
    startPlaygroundClient(true);
    const port = lastMockPort()!;
    const invite = createInvite('invite-1', 'pending');
    const updatedInvite = createInvite('invite-1', 'ignored');
    const game = createChessGame('game-1');

    port.emit({
      error: '',
      status: 'connecting',
      type: 'ytcq:playground:status'
    });
    expect(getPlaygroundClientState().status).toBe('connecting');

    port.emit(createSnapshotMessage({
      games: [],
      invites: [],
      users: [createUser('me-user')]
    }, ['bounty-hunting'], [{
      gameId: 'incompatible-bounty-game',
      gameType: 'bounty-hunting'
    }]));
    expect(getPlaygroundClientState().incompatibleGames).toEqual(['bounty-hunting']);
    expect(getPlaygroundClientState().incompatibleActiveGames).toEqual([{
      gameId: 'incompatible-bounty-game',
      gameType: 'bounty-hunting'
    }]);
    port.emit({
      message: {
        invite,
        type: 'inviteReceived'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(getPlaygroundClientState().invites).toEqual([invite]);

    port.emit({
      message: {
        invite: updatedInvite,
        type: 'inviteUpdated'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(getPlaygroundClientState().invites).toEqual([]);

    port.emit({
      message: {
        invite,
        type: 'inviteCreated'
      },
      type: 'ytcq:playground:server-message'
    });
    port.emit({
      message: {
        game,
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(getPlaygroundClientState()).toMatchObject({
      endedGame: null,
      games: [game],
      invites: [invite],
      status: 'connected',
      userId: 'me-user'
    });

    const updatedGame = {
      ...game,
      turn: 'black'
    } as PublicGame;
    port.emit({
      message: {
        game: updatedGame,
        type: 'gameUpdated'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(getPlaygroundClientState().games).toEqual([updatedGame]);

    port.emit({
      message: {
        expiresAt: 123_000,
        gameId: 'game-1',
        generationToken: 'rtg_1234567890abcdef',
        type: 'replayTriviaGenerationToken'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(takeReplayTriviaGenerationToken('game-1')).toEqual({
      expiresAt: 123_000,
      gameId: 'game-1',
      generationToken: 'rtg_1234567890abcdef'
    });
    port.emit({
      message: {
        expiresAt: 123_000,
        gameId: 'game-1',
        generationToken: 'rtg_1234567890abcdef',
        type: 'replayTriviaGenerationToken'
      },
      type: 'ytcq:playground:server-message'
    });

    port.emit({
      message: {
        gameId: 'game-1',
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'luna-user'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(getPlaygroundClientState()).toMatchObject({
      endedGame: {
        gameId: 'game-1',
        reason: 'playerLeft',
        userId: 'luna-user'
      },
      games: []
    });
    expect(takeReplayTriviaGenerationToken('game-1')).toBeUndefined();

    port.emit({
      code: 'game_version',
      message: 'Update required.',
      type: 'ytcq:playground:error'
    });
    expect(document.querySelector('.ytcq-toast')).toBeNull();

    const listenerCallCount = listener.mock.calls.length;
    port.emit({
      code: 'bad_action',
      message: 'Move rejected.',
      type: 'ytcq:playground:error'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected.');
    expect(document.querySelector('.ytcq-toast')?.getAttribute('role')).toBe('alert');
    expect(getPlaygroundClientState().connectionError).toBe('');
    expect(listener).toHaveBeenCalledTimes(listenerCallCount);
    unsubscribe();
  });

  it('shows connected action errors in a five-second toast and restarts its timer', () => {
    startPlaygroundClient(true);
    const port = lastMockPort()!;
    const game = createChessGame('game-1');
    port.emit(createSnapshotMessage({
      games: [game],
      invites: [],
      users: [createUser('me-user')]
    }));

    port.emit({
      code: 'bad_action',
      message: 'Move rejected.',
      type: 'ytcq:playground:error'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected.');

    sendPlaygroundGameAction('game-2', 'observeBountyMessage');
    sendPlaygroundGameAction('game-1', 'move', { from: 'e2', to: 'e4' });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected.');

    vi.advanceTimersByTime(4_000);

    port.emit({
      code: 'bad_action',
      message: 'Move rejected again.',
      type: 'ytcq:playground:error'
    });

    port.emit({
      message: {
        invite: createInvite('invite-2', 'pending'),
        type: 'inviteCreated'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected again.');

    const unrelatedGame = createChessGame('game-2');
    port.emit({
      message: {
        game: { ...unrelatedGame, turn: 'black' } as PublicGame,
        type: 'gameUpdated'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected again.');

    port.emit({
      message: {
        expiresAt: 123_000,
        gameId: 'game-2',
        generationToken: 'rtg_1234567890abcdef',
        type: 'replayTriviaGenerationToken'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected again.');

    port.emit({
      message: {
        gameId: 'game-2',
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'other-user'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected again.');

    port.emit(createSnapshotMessage({
      games: [unrelatedGame],
      invites: [],
      users: [createUser('me-user')]
    }));
    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected again.');

    vi.advanceTimersByTime(3_999);
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe('Move rejected again.');

    vi.advanceTimersByTime(1);
    expect(document.querySelector('.ytcq-toast')).toBeNull();
  });

  it('routes correlated Replay Trivia preparation errors without showing a toast', () => {
    startPlaygroundClient(true);
    const port = lastMockPort()!;
    port.emit(createSnapshotMessage({
      games: [],
      invites: [],
      users: [createUser('me-user')]
    }));

    port.emit({
      code: 'invalid_question',
      message: 'Replay Trivia questions must include friendIntro.',
      request: {
        action: 'submitQuestions',
        gameId: 'game-1',
        type: 'gameAction'
      },
      type: 'ytcq:playground:error'
    } as PlaygroundBackgroundMessage);

    expect(takeReplayTriviaPreparationError('game-1')).toBe(
      'Replay Trivia questions must include friendIntro.'
    );
    expect(document.querySelector('.ytcq-toast')).toBeNull();
  });

  it('resets game client data on first snapshot and stream changes', () => {
    startPlaygroundClient(true);
    const firstPort = lastMockPort()!;
    firstPort.emit({
      message: {
        expiresAt: 123_000,
        gameId: 'game-1',
        generationToken: 'rtg_1234567890abcdef',
        type: 'replayTriviaGenerationToken'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(takeReplayTriviaGenerationToken('game-1')).toBeDefined();
    firstPort.emit({
      message: {
        expiresAt: 123_000,
        gameId: 'game-1',
        generationToken: 'rtg_1234567890abcdef',
        type: 'replayTriviaGenerationToken'
      },
      type: 'ytcq:playground:server-message'
    });

    firstPort.emit({
      incompatibleActiveGames: [],
      incompatibleGames: ['bounty-hunting'],
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'ytcq:playground:snapshot',
      userId: 'me-user'
    });
    expect(takeReplayTriviaGenerationToken('game-1')).toBeUndefined();
    expect(getPlaygroundClientState().incompatibleActiveGames).toEqual([]);
    expect(getPlaygroundClientState().incompatibleGames).toEqual(['bounty-hunting']);

    firstPort.emit({
      message: {
        expiresAt: 123_000,
        gameId: 'game-1',
        generationToken: 'rtg_1234567890abcdef',
        type: 'replayTriviaGenerationToken'
      },
      type: 'ytcq:playground:server-message'
    });
    window.history.replaceState({}, '', '/watch?v=stream-b');
    startPlaygroundClient(true);

    expect(lastMockPort()).toBe(firstPort);
    expect(firstPort.messages.at(-1)).toMatchObject({
      streamKey: 'stream-b',
      type: 'ytcq:playground:init'
    });
    expect(takeReplayTriviaGenerationToken('game-1')).toBeUndefined();
    expect(getPlaygroundClientState().incompatibleGames).toEqual([]);
  });

  it('handles port disconnects and postMessage failures defensively', () => {
    startPlaygroundClient(true);
    const firstPort = lastMockPort()!;
    firstPort.emit(createSnapshotMessage({
      games: [],
      invites: [],
      users: [createUser('me-user')]
    }));
    firstPort.emit({
      code: 'bad_action',
      message: 'That action is no longer available.',
      type: 'ytcq:playground:error'
    });
    const toast = document.querySelector('.ytcq-toast');
    expect(toast?.textContent).toBe('That action is no longer available.');

    (firstPort.disconnect as () => void)();

    const disconnectedState = getPlaygroundClientState();
    expect(disconnectedState.status).toBe('disconnected');
    expect(disconnectedState.connectionError).toBe('');
    expect(disconnectedState.incompatibleGames).toEqual([]);
    expect(document.querySelector('.ytcq-toast')).toBe(toast);
    vi.advanceTimersByTime(5_000);
    expect(getPlaygroundClientState()).toBe(disconnectedState);
    expect(document.querySelector('.ytcq-toast')).toBeNull();

    startPlaygroundClient(true);
    const secondPort = lastMockPort()!;
    secondPort.throwOnPost = true;
    setPlaygroundAvailability(false);
    sendPlaygroundInvite('chess', 'luna-user');

    expect(secondPort.postMessage).toHaveBeenCalled();
    expect(() => sendPlaygroundGameAction('game-1', 'leave')).not.toThrow();
  });
});

interface MockPort {
  disconnect: ReturnType<typeof vi.fn>;
  emit: (message: PlaygroundBackgroundMessage) => void;
  messages: PlaygroundContentMessage[];
  name: string;
  onDisconnect: {
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  onMessage: {
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  postMessage: ReturnType<typeof vi.fn>;
  throwOnPost: boolean;
}

const mockPorts: MockPort[] = [];

function createMockPort(): MockPort {
  const disconnectListeners = new Set<() => void>();
  const messageListeners = new Set<(message: PlaygroundBackgroundMessage) => void>();
  const port: MockPort = {
    disconnect: vi.fn(() => {
      disconnectListeners.forEach((listener) => listener());
    }),
    emit: (message) => {
      messageListeners.forEach((listener) => listener(message));
    },
    messages: [],
    name: 'ytcq:playground',
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => disconnectListeners.add(listener)),
      removeListener: vi.fn((listener: () => void) => disconnectListeners.delete(listener))
    },
    onMessage: {
      addListener: vi.fn((listener: (message: PlaygroundBackgroundMessage) => void) => messageListeners.add(listener)),
      removeListener: vi.fn((listener: (message: PlaygroundBackgroundMessage) => void) => messageListeners.delete(listener))
    },
    postMessage: vi.fn((message: PlaygroundContentMessage) => {
      if (port.throwOnPost) throw new Error('port closed');
      port.messages.push(message);
    }),
    throwOnPost: false
  };
  mockPorts.push(port);
  return port;
}

function lastMockPort(): MockPort | undefined {
  return mockPorts.at(-1);
}

function createSnapshotMessage(
  snapshot: LobbySnapshot,
  incompatibleGames: GameId[] = [],
  incompatibleActiveGames: Extract<
    PlaygroundBackgroundMessage,
    { type: 'ytcq:playground:snapshot' }
  >['incompatibleActiveGames'] = []
): PlaygroundBackgroundMessage {
  return {
    incompatibleActiveGames,
    incompatibleGames,
    snapshot,
    type: 'ytcq:playground:snapshot',
    userId: 'me-user'
  };
}

function createInvite(inviteId: string, status: PublicInvite['status']): PublicInvite {
  return {
    createdAt: 100,
    expiresAt: 200,
    fromUser: createUser('luna-user', 'Luna Chat'),
    gameId: 'chess',
    inviteId,
    status,
    toUser: createUser('me-user', 'Me')
  };
}

function createChessGame(gameId: string): PublicGame {
  return {
    fen: 'startpos',
    gameId,
    gameType: 'chess',
    pgn: '',
    players: {
      black: createUser('luna-user', 'Luna Chat'),
      white: createUser('me-user', 'Me')
    },
    status: 'active',
    turn: 'white'
  } as PublicGame;
}

function createUser(userId: string, displayName = userId): LobbySnapshot['users'][number] {
  return {
    availableGames: ['chess'],
    displayName,
    joinedAt: 100,
    userId
  };
}
