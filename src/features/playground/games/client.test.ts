import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  LobbySnapshot,
  PlaygroundBackgroundMessage,
  PlaygroundContentMessage,
  PublicGame,
  PublicInvite
} from '../../../shared/playground-protocol';
import {
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

describe('Playground games client', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    mockPorts.length = 0;
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
  });

  afterEach(() => {
    stopPlaygroundClient();
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
      error: 'Stream unavailable.',
      status: 'disconnected'
    });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      error: 'Stream unavailable.'
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
      error: 'No extension context.',
      status: 'disconnected'
    });

    chrome.runtime.connect = vi.fn(() => {
      throw 'port unavailable';
    });
    startPlaygroundClient(true);

    expect(getPlaygroundClientState()).toMatchObject({
      error: 'Playground unavailable.',
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
        availableGames: ['chess'],
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
      availableGames: ['chess'],
      type: 'ytcq:playground:set-availability'
    });

    window.history.replaceState({}, '', '/watch?v=stream-b');
    expect(getPlaygroundAvailability(false)).toBe(false);
    startPlaygroundClient(false);

    expect(getPlaygroundClientState().available).toBe(false);
    expect(port.messages.at(-1)).toEqual({
      availableGames: [],
      streamKey: 'stream-b',
      type: 'ytcq:playground:init'
    });
  });

  it('posts availability, invites, invite responses, and game actions when connected', () => {
    startPlaygroundClient(false);
    const port = lastMockPort()!;

    setPlaygroundAvailability(true);
    sendPlaygroundInvite('chess', 'luna-user');
    respondToPlaygroundInvite('invite-1', false);
    sendPlaygroundGameAction('game-1', 'move', { from: 'e2', to: 'e4' });
    sendPlaygroundGameAction('game-1', 'leave');

    expect(port.messages.slice(1)).toEqual([
      {
        availableGames: ['chess'],
        type: 'ytcq:playground:set-availability'
      },
      {
        gameId: 'chess',
        toUserId: 'luna-user',
        type: 'ytcq:playground:invite'
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
      }
    ]);
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
    }));
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
    expect(getPlaygroundClientState().replayTriviaGenerationTokens['game-1']).toEqual({
      expiresAt: 123_000,
      gameId: 'game-1',
      generationToken: 'rtg_1234567890abcdef'
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
      games: [],
      replayTriviaGenerationTokens: {}
    });

    port.emit({
      message: {
        code: 'bad_action',
        message: 'Move rejected.',
        type: 'error'
      },
      type: 'ytcq:playground:server-message'
    });
    port.emit({
      code: 'bridge_failed',
      message: 'Background bridge failed.',
      type: 'ytcq:playground:error'
    });
    expect(getPlaygroundClientState().error).toBe('Background bridge failed.');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('resets token state on first snapshot and stream changes', () => {
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

    expect(getPlaygroundClientState().replayTriviaGenerationTokens['game-1']).toBeDefined();

    firstPort.emit(createSnapshotMessage({
      games: [],
      invites: [],
      users: []
    }));
    expect(getPlaygroundClientState().replayTriviaGenerationTokens).toEqual({});

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
    expect(getPlaygroundClientState().replayTriviaGenerationTokens).toEqual({});
  });

  it('handles port disconnects and postMessage failures defensively', () => {
    startPlaygroundClient(true);
    const firstPort = lastMockPort()!;
    (firstPort.disconnect as () => void)();

    expect(getPlaygroundClientState().status).toBe('disconnected');

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

function createSnapshotMessage(snapshot: LobbySnapshot): PlaygroundBackgroundMessage {
  return {
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
