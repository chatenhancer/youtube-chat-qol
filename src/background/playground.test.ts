import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYGROUND_GAME_VERSIONS,
  PLAYGROUND_PORT_NAME,
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type PlaygroundBackgroundMessage,
  type PlaygroundContentMessage,
  type ServerMessage
} from '../shared/playground/protocol';
import {
  PLAYGROUND_DISPLAY_NAME_STORAGE_KEY,
  PLAYGROUND_PROFILE_MESSAGE_TYPE,
  PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE,
  PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE
} from '../shared/playground/identity';
import { REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE } from '../shared/playground/trivia';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static constructorError: Error | null = null;

  failNextSend = false;
  listeners = new Map<string, Set<(event: { data?: string }) => void>>();
  readyState = FakeWebSocket.OPEN;
  sent: ClientMessage[] = [];
  url: string;

  constructor(url: string) {
    if (FakeWebSocket.constructorError) throw FakeWebSocket.constructorError;
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const listeners = this.listeners.get(type) || new Set<(event: { data?: string }) => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {
    this.readyState = 3;
  }

  emit(type: string, message?: ServerMessage): void {
    const data = message ? JSON.stringify(message) : undefined;
    this.listeners.get(type)?.forEach((listener) => listener({ data }));
  }

  send(data: string): void {
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new Error('send failed');
    }
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
}

interface FakePort {
  emit: (message: PlaygroundContentMessage) => void;
  messages: PlaygroundBackgroundMessage[];
  name: string;
  onDisconnect: {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
  };
  onMessage: {
    addListener: (listener: (message: PlaygroundContentMessage) => void) => void;
    removeListener: (listener: (message: PlaygroundContentMessage) => void) => void;
  };
  postMessage: (message: PlaygroundBackgroundMessage) => void;
  sender?: {
    tab?: {
      url?: string;
    };
    url?: string;
  };
}

describe('background playground bridge', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.resetModules();
    vi.clearAllMocks();
    await chrome.storage.local.clear();
    FakeWebSocket.instances = [];
    FakeWebSocket.constructorError = null;
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('opens the playground socket, signs the challenge, and forwards the accepted snapshot', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess', 'bounty-hunting'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    expect(FakeWebSocket.instances[0].url).toBe('wss://playground.chatenhancer.com/v1/streams/stream-a/socket');
    expect(port.messages.at(-1)).toEqual({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });

    FakeWebSocket.instances[0].emit('message', {
      challenge: 'challenge-1',
      gameVersions: { ...PLAYGROUND_GAME_VERSIONS },
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances[0].sent).toHaveLength(1);
    });
    expect(FakeWebSocket.instances[0].sent[0]).toMatchObject({
      availableGames: ['chess', 'bounty-hunting'],
      gameVersions: PLAYGROUND_GAME_VERSIONS,
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    });
    expect((FakeWebSocket.instances[0].sent[0] as Extract<ClientMessage, { type: 'hello' }>).identity.signature).toEqual(expect.any(String));

    FakeWebSocket.instances[0].emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: [
          {
            availableGames: ['chess', 'bounty-hunting'],
            displayName: 'Player One',
            joinedAt: 1,
            userId: 'user-1'
          }
        ]
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    expect(port.messages.at(-1)).toEqual({
      incompatibleActiveGames: [],
      incompatibleGames: [],
      snapshot: {
        games: [],
        invites: [],
        users: [
          {
            availableGames: ['chess', 'bounty-hunting'],
            displayName: 'Player One',
            joinedAt: 1,
            userId: 'user-1'
          }
        ]
      },
      type: 'ytcq:playground:snapshot',
      userId: 'user-1'
    });
    expect(port.messages).not.toContainEqual({
      status: 'connected',
      type: 'ytcq:playground:status'
    });
    const stored = await chrome.storage.local.get('ytcqPlaygroundIdentity:v1');
    expect(stored['ytcqPlaygroundIdentity:v1']).toMatchObject({
      privateKeyJwk: expect.any(Object),
      publicKeyJwk: expect.any(Object)
    });
  });

  it('hides incompatible games locally while letting the backend validate outbound commands', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess', 'bounty-hunting'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    port.emit({
      availableGames: ['bounty-hunting', 'chess'],
      type: 'ytcq:playground:set-availability'
    });
    port.emit({
      gameId: 'bounty-hunting',
      toUserId: 'user-2',
      type: 'ytcq:playground:invite'
    });
    port.emit({
      gameId: 'chess',
      toUserId: 'user-2',
      type: 'ytcq:playground:invite'
    });

    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      challenge: 'challenge-old-server',
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });

    await vi.waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });
    expect(socket.sent[0]).toMatchObject({
      availableGames: ['bounty-hunting', 'chess'],
      gameVersions: PLAYGROUND_GAME_VERSIONS,
      type: 'hello'
    });

    const bountyGame = {
      gameId: 'game-bounty',
      gameType: 'bounty-hunting' as const,
      status: 'active'
    };
    const chessGame = {
      gameId: 'game-chess',
      gameType: 'chess' as const,
      status: 'active'
    };
    const playerOne = {
      displayName: 'Player One',
      userId: 'user-1'
    };
    const playerTwo = {
      displayName: 'Player Two',
      userId: 'user-2'
    };
    const bountyInvite = {
      createdAt: 1,
      expiresAt: 10,
      fromUser: playerOne,
      gameId: 'bounty-hunting' as const,
      inviteId: 'invite-bounty',
      status: 'pending' as const,
      toUser: playerTwo
    };
    const chessInvite = {
      ...bountyInvite,
      gameId: 'chess' as const,
      inviteId: 'invite-chess'
    };
    socket.emit('message', {
      snapshot: {
        games: [bountyGame, chessGame],
        invites: [bountyInvite, chessInvite],
        users: [
          {
            availableGames: ['bounty-hunting', 'chess'],
            ...playerOne,
            joinedAt: 1
          }
        ]
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    expect(socket.sent).toEqual([
      expect.objectContaining({
        availableGames: ['bounty-hunting', 'chess'],
        type: 'hello'
      }),
      {
        availableGames: ['bounty-hunting', 'chess'],
        type: 'setAvailability'
      },
      {
        gameId: 'bounty-hunting',
        toUserId: 'user-2',
        type: 'invite'
      },
      {
        gameId: 'chess',
        toUserId: 'user-2',
        type: 'invite'
      }
    ]);
    expect(port.messages).toContainEqual({
      incompatibleActiveGames: [{
        gameId: 'game-bounty',
        gameType: 'bounty-hunting'
      }],
      incompatibleGames: ['bounty-hunting', 'replay-trivia'],
      snapshot: {
        games: [chessGame],
        invites: [chessInvite],
        users: [
          {
            availableGames: ['chess'],
            ...playerOne,
            joinedAt: 1
          }
        ]
      },
      type: 'ytcq:playground:snapshot',
      userId: 'user-1'
    });
    socket.emit('message', {
      snapshot: {
        games: [bountyGame, chessGame],
        invites: [bountyInvite, chessInvite],
        users: [
          {
            availableGames: ['bounty-hunting', 'chess'],
            ...playerOne,
            joinedAt: 1
          }
        ]
      },
      type: 'presenceSnapshot'
    });
    expect(port.messages.at(-1)).toEqual({
      incompatibleActiveGames: [{
        gameId: 'game-bounty',
        gameType: 'bounty-hunting'
      }],
      incompatibleGames: ['bounty-hunting', 'replay-trivia'],
      snapshot: {
        games: [chessGame],
        invites: [chessInvite],
        users: [
          {
            availableGames: ['chess'],
            ...playerOne,
            joinedAt: 1
          }
        ]
      },
      type: 'ytcq:playground:snapshot',
      userId: 'user-1'
    });
    const forwardedEventCount = port.messages.filter((message) =>
      message.type === 'ytcq:playground:server-message'
    ).length;
    socket.emit('message', {
      invite: bountyInvite,
      type: 'inviteReceived'
    });
    socket.emit('message', {
      game: bountyGame,
      type: 'gameUpdated'
    });
    expect(port.messages.filter((message) =>
      message.type === 'ytcq:playground:server-message'
    )).toHaveLength(forwardedEventCount);

    socket.emit('message', {
      game: chessGame,
      type: 'gameUpdated'
    });
    expect(port.messages.at(-1)).toEqual({
      message: {
        game: chessGame,
        type: 'gameUpdated'
      },
      type: 'ytcq:playground:server-message'
    });

    port.emit({
      gameId: 'bounty-hunting',
      toUserId: 'user-2',
      type: 'ytcq:playground:cancel-invite'
    });
    port.emit({
      accept: false,
      inviteId: 'invite-bounty',
      type: 'ytcq:playground:respond-invite'
    });
    expect(socket.sent.slice(-2)).toEqual([
      {
        gameId: 'bounty-hunting',
        toUserId: 'user-2',
        type: 'cancelInvite'
      },
      {
        accept: false,
        inviteId: 'invite-bounty',
        type: 'respondInvite'
      }
    ]);

    const sentCount = socket.sent.length;
    const portMessageCount = port.messages.length;
    port.emit({
      gameId: 'bounty-hunting',
      toUserId: 'user-2',
      type: 'ytcq:playground:invite'
    });
    port.emit({
      action: 'shootBounty',
      gameId: 'game-bounty',
      payload: { messageId: 'message-1' },
      type: 'ytcq:playground:game-action'
    });
    expect(socket.sent).toHaveLength(sentCount + 2);
    expect(socket.sent.slice(-2)).toEqual([
      {
        gameId: 'bounty-hunting',
        toUserId: 'user-2',
        type: 'invite'
      },
      {
        action: 'shootBounty',
        gameId: 'game-bounty',
        payload: { messageId: 'message-1' },
        type: 'gameAction'
      }
    ]);
    expect(port.messages).toHaveLength(portMessageCount);

    port.emit({
      action: 'leave',
      gameId: 'game-bounty',
      type: 'ytcq:playground:game-action'
    });
    expect(socket.sent).toHaveLength(sentCount + 3);
    expect(socket.sent.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game-bounty',
      type: 'gameAction'
    });

    socket.emit('message', {
      gameId: 'game-bounty',
      reason: 'playerLeft',
      type: 'gameEnded',
      userId: 'user-1'
    });
    expect(port.messages.at(-1)).toEqual({
      message: {
        gameId: 'game-bounty',
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'user-1'
      },
      type: 'ytcq:playground:server-message'
    });

    port.emit({
      action: 'move',
      gameId: 'game-chess',
      payload: { from: 'e2', to: 'e4' },
      type: 'ytcq:playground:game-action'
    });
    expect(socket.sent.at(-1)).toEqual({
      action: 'move',
      gameId: 'game-chess',
      payload: { from: 'e2', to: 'e4' },
      type: 'gameAction'
    });
  });

  it('ignores unrelated runtime ports and malformed socket messages', async () => {
    await import('./playground');
    const port = createFakePort();
    port.name = 'other-port';
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    expect(FakeWebSocket.instances).toHaveLength(0);

    port.name = PLAYGROUND_PORT_NAME;
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['chess'],
      streamKey: '',
      type: 'ytcq:playground:init'
    });

    expect(FakeWebSocket.instances).toHaveLength(0);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    const socket = FakeWebSocket.instances[0];
    const messageCount = port.messages.length;
    socket.listeners.get('message')?.forEach((listener) => listener({ data: undefined }));
    socket.listeners.get('message')?.forEach((listener) => listener({ data: '{' }));
    socket.listeners.get('message')?.forEach((listener) => listener({ data: JSON.stringify({}) }));

    expect(port.messages).toHaveLength(messageCount);
  });

  it('returns the stable local playground profile without opening a socket', async () => {
    await import('./playground');

    const sendResponse = vi.fn();
    const keepAlive = getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    expect(keepAlive).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        profile: {
          customDisplayName: '',
          displayName: expect.stringMatching(/^Player [A-Z0-9]{4}$/),
          generatedDisplayName: expect.stringMatching(/^Player [A-Z0-9]{4}$/),
          userId: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
          wins: null
        }
      });
    });
    expect(FakeWebSocket.instances).toHaveLength(0);

    const firstResponse = sendResponse.mock.calls[0]?.[0];
    sendResponse.mockClear();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith(firstResponse);
    });
  });

  it('stores custom playground display names and pushes them to active sockets', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      stats: {
        games: {},
        userId: 'ignored',
        wins: 0
      }
    }))));
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      challenge: 'challenge-1',
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });
    await vi.waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });
    expect(socket.sent[0]).toMatchObject({
      displayName: expect.stringMatching(/^Player [A-Z0-9]{4}$/),
      type: 'hello'
    });
    socket.emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    const sendResponse = vi.fn();
    getMessageListener()({
      displayName: '  Luna Chat  ',
      type: PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        profile: expect.objectContaining({
          customDisplayName: 'Luna Chat',
          displayName: 'Luna Chat'
        })
      });
    });
    await expect(chrome.storage.local.get(PLAYGROUND_DISPLAY_NAME_STORAGE_KEY)).resolves.toEqual({
      [PLAYGROUND_DISPLAY_NAME_STORAGE_KEY]: 'Luna Chat'
    });
    expect(socket.sent.at(-1)).toEqual({
      displayName: 'Luna Chat',
      type: 'setDisplayName'
    });

    const profileResponse = vi.fn();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, profileResponse);
    await vi.waitFor(() => {
      expect(profileResponse).toHaveBeenCalledWith({
        ok: true,
        profile: expect.objectContaining({
          customDisplayName: 'Luna Chat',
          displayName: 'Luna Chat',
          generatedDisplayName: expect.stringMatching(/^Player [A-Z0-9]{4}$/)
        })
      });
    });
  });

  it('rejects invalid custom playground display names', async () => {
    await import('./playground');

    const sendResponse = vi.fn();
    getMessageListener()({
      displayName: 'https://example.com',
      type: PLAYGROUND_PROFILE_UPDATE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Choose a shorter display name without URLs or reserved Playground names.',
        ok: false
      });
    });
    await expect(chrome.storage.local.get(PLAYGROUND_DISPLAY_NAME_STORAGE_KEY)).resolves.toEqual({});
  });

  it('returns a profile error when local identity creation fails', async () => {
    vi.stubGlobal('crypto', {
      subtle: {
        generateKey: vi.fn(async () => {
          throw new Error('key store unavailable');
        })
      }
    });
    await import('./playground');

    const sendResponse = vi.fn();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'key store unavailable',
        ok: false
      });
    });
  });

  it('uses fallback profile errors for non-Error identity failures', async () => {
    vi.stubGlobal('crypto', {
      subtle: {
        generateKey: vi.fn(async () => {
          throw 'key store unavailable';
        })
      }
    });
    await import('./playground');

    const sendResponse = vi.fn();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Playground profile unavailable.',
        ok: false
      });
    });
  });

  it('returns total wins from the global player stats route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      stats: {
        games: {
          chess: {
            wins: 2
          },
          'replay-trivia': {
            wins: 3
          }
        },
        userId: 'ignored',
        wins: 5
      }
    })));
    vi.stubGlobal('fetch', fetchMock);
    await import('./playground');

    const profileResponse = vi.fn();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, profileResponse);
    await vi.waitFor(() => {
      expect(profileResponse).toHaveBeenCalledWith({
        ok: true,
        profile: expect.objectContaining({
          userId: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/)
        })
      });
    });
    const userId = profileResponse.mock.calls[0]?.[0]?.profile.userId as string;

    const sendResponse = vi.fn();
    const keepAlive = getMessageListener()({
      type: PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE,
      userId
    }, {} as chrome.runtime.MessageSender, sendResponse);

    expect(keepAlive).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        userId,
        wins: 5
      });
    });
    const fetchCalls = fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>;
    const calledUrl = new URL(fetchCalls[0]?.[0] || '');
    expect(calledUrl.origin).toBe('https://playground.chatenhancer.com');
    expect(calledUrl.pathname).toBe('/v1/player-stats');
    expect(calledUrl.searchParams.get('userId')).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('falls back to zero wins when profile stats are unavailable or malformed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('down', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    await import('./playground');

    const profileResponse = vi.fn();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, profileResponse);
    await vi.waitFor(() => {
      expect(profileResponse).toHaveBeenCalledWith({
        ok: true,
        profile: expect.objectContaining({
          userId: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/)
        })
      });
    });
    const firstUserId = profileResponse.mock.calls[0]?.[0]?.profile.userId as string;

    const sendResponse = vi.fn();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE,
      userId: firstUserId
    }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        userId: firstUserId,
        wins: 0
      });
    });

    await chrome.storage.local.clear();
    const nextProfileResponse = vi.fn();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_MESSAGE_TYPE
    }, {} as chrome.runtime.MessageSender, nextProfileResponse);
    await vi.waitFor(() => {
      expect(nextProfileResponse).toHaveBeenCalledWith({
        ok: true,
        profile: expect.objectContaining({
          userId: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/)
        })
      });
    });
    const secondUserId = nextProfileResponse.mock.calls[0]?.[0]?.profile.userId as string;

    sendResponse.mockClear();
    getMessageListener()({
      type: PLAYGROUND_PROFILE_STATS_MESSAGE_TYPE,
      userId: secondUserId
    }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        userId: secondUserId,
        wins: 0
      });
    });
  });

  it('keeps authenticated playground sockets alive with heartbeat pings', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      challenge: 'challenge-1',
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });

    await vi.waitFor(() => {
      expect(socket.sent).toHaveLength(1);
    });
    socket.emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    await vi.advanceTimersByTimeAsync(19_999);
    expect(socket.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.sent.at(-1)).toMatchObject({
      id: expect.stringMatching(/^heartbeat-/),
      type: 'ping'
    });

    const messageCount = port.messages.length;
    socket.emit('message', {
      id: 'heartbeat-reply',
      type: 'pong'
    });
    expect(port.messages).toHaveLength(messageCount);

    socket.emit('close');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(socket.sent.filter((message) => message.type === 'ping')).toHaveLength(1);
  });

  it('skips heartbeat sends when the tracked socket is no longer open', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });
    socket.readyState = 3;

    await vi.advanceTimersByTimeAsync(20_000);

    expect(socket.sent).toEqual([]);
  });

  it('forwards socket presence and error events to the content port', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    socket.emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: [
          {
            availableGames: ['chess'],
            displayName: 'Player One',
            joinedAt: 1,
            userId: 'user-1'
          }
        ]
      },
      type: 'presenceSnapshot'
    });
    socket.emit('message', {
      code: 'bad_action',
      message: 'Bad action.',
      request: {
        action: 'move',
        gameId: 'game-1',
        type: 'gameAction'
      },
      type: 'error'
    });

    expect(port.messages.at(-2)).toEqual({
      incompatibleActiveGames: [],
      incompatibleGames: [],
      snapshot: {
        games: [],
        invites: [],
        users: [
          {
            availableGames: ['chess'],
            displayName: 'Player One',
            joinedAt: 1,
            userId: 'user-1'
          }
        ]
      },
      type: 'ytcq:playground:snapshot',
      userId: 'user-1'
    });
    expect(port.messages.at(-1)).toEqual({
      code: 'bad_action',
      message: 'Bad action.',
      request: {
        action: 'move',
        gameId: 'game-1',
        type: 'gameAction'
      },
      type: 'ytcq:playground:error'
    });
  });

  it('forwards content commands to the authenticated socket', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: [],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    port.emit({
      availableGames: ['chess'],
      type: 'ytcq:playground:set-availability'
    });
    port.emit({
      gameId: 'chess',
      toUserId: 'user-2',
      type: 'ytcq:playground:invite'
    });
    port.emit({
      action: 'shootBounty',
      gameId: 'game-bounty',
      payload: { messageId: 'message-1' },
      type: 'ytcq:playground:game-action'
    });
    port.emit({
      gameId: 'chess',
      toUserId: 'user-2',
      type: 'ytcq:playground:cancel-invite'
    });
    port.emit({
      action: 'move',
      gameId: 'game-1',
      payload: {
        from: 'e2',
        to: 'e4'
      },
      type: 'ytcq:playground:game-action'
    });
    port.emit({
      accept: true,
      inviteId: 'invite-1',
      type: 'ytcq:playground:respond-invite'
    });

    expect(FakeWebSocket.instances[0].sent).toEqual([]);
    FakeWebSocket.instances[0].emit('message', {
      challenge: 'challenge-1',
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });
    await vi.waitFor(() => {
      expect(FakeWebSocket.instances[0].sent).toHaveLength(1);
    });
    FakeWebSocket.instances[0].emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    expect(FakeWebSocket.instances[0].sent).toEqual([
      expect.objectContaining({
        type: 'hello'
      }),
      {
        availableGames: ['chess'],
        type: 'setAvailability'
      },
      {
        gameId: 'chess',
        toUserId: 'user-2',
        type: 'invite'
      },
      {
        action: 'shootBounty',
        gameId: 'game-bounty',
        payload: { messageId: 'message-1' },
        type: 'gameAction'
      },
      {
        gameId: 'chess',
        toUserId: 'user-2',
        type: 'cancelInvite'
      },
      {
        action: 'move',
        gameId: 'game-1',
        payload: {
          from: 'e2',
          to: 'e4'
        },
        type: 'gameAction'
      },
      {
        accept: true,
        inviteId: 'invite-1',
        type: 'respondInvite'
      }
    ]);
  });

  it('requeues a connected command when socket send fails', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });
    socket.failNextSend = true;

    port.emit({
      gameId: 'chess',
      toUserId: 'user-2',
      type: 'ytcq:playground:invite'
    });

    expect(socket.readyState).toBe(3);
    expect(port.messages.at(-1)).toMatchObject({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });
  });

  it('handles socket error events by scheduling reconnect', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    const socket = FakeWebSocket.instances[0];
    socket.emit('error');

    expect(socket.readyState).toBe(3);
    expect(port.messages.at(-1)).toEqual({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });
    await vi.advanceTimersByTimeAsync(750);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('posts Replay Trivia question requests from the background context', async () => {
    const responseBody = {
      generatedAt: '2026-06-12T00:00:00.000Z',
      languageCode: 'en',
      model: 'gpt-test',
      questions: [],
      transcriptWindow: {
        endSeconds: 10,
        segmentCount: 1,
        startSeconds: 0,
        videoId: 'SHt3FyE-VIQ'
      }
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(responseBody), {
      headers: {
        'Content-Type': 'application/json'
      }
    }));
    vi.stubGlobal('fetch', fetchMock);

    await import('./playground');

    const request = {
      captchaPass: 'cap_1234567890abcdef',
      endSeconds: 10,
      gameId: 'game-replay-trivia',
      generationToken: 'rtg_1234567890abcdef',
      languageCode: 'en',
      segments: [{ durationSeconds: 2, startSeconds: 1, text: 'The winner is announced.' }],
      startSeconds: 0,
      videoId: 'SHt3FyE-VIQ'
    };
    const sendResponse = vi.fn();
    const keepAlive = getMessageListener()({
      request,
      streamKey: 'SHt3FyE-VIQ',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    expect(keepAlive).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        ok: true,
        response: responseBody
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://playground.chatenhancer.com/v1/streams/SHt3FyE-VIQ/replay-trivia/questions',
      {
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST'
      }
    );
  });

  it('returns Replay Trivia question request errors to the content script', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'openai_not_configured',
        message: 'Replay Trivia question generation is not configured.'
      }
    }), {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 503
    }));
    vi.stubGlobal('fetch', fetchMock);

    await import('./playground');

    const sendResponse = vi.fn();
    getMessageListener()({
      request: {
        captchaPass: 'cap_1234567890abcdef',
        endSeconds: 10,
        gameId: 'game-replay-trivia',
        generationToken: 'rtg_1234567890abcdef',
        segments: [{ startSeconds: 1, text: 'The winner is announced.' }],
        startSeconds: 0,
        videoId: 'SHt3FyE-VIQ'
      },
      streamKey: 'SHt3FyE-VIQ',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, {} as chrome.runtime.MessageSender, sendResponse);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        code: 'openai_not_configured',
        error: 'Replay Trivia question generation is not configured.',
        ok: false,
        status: 503
      });
    });
  });

  it('returns Replay Trivia validation, non-json, and network request errors', async () => {
    await import('./playground');
    const sendResponse = vi.fn();

    expect(getMessageListener()({
      request: {},
      streamKey: 'bad key',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'A YouTube stream key is required for Replay Trivia.',
        ok: false
      });
    });

    sendResponse.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json', { status: 500 })));
    getMessageListener()({
      request: {},
      streamKey: 'stream-a',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Replay Trivia request failed with 500.',
        ok: false,
        status: 500
      });
    });

    sendResponse.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));
    getMessageListener()({
      request: {},
      streamKey: 'stream-a',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'network down',
        ok: false
      });
    });

    sendResponse.mockClear();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw 'network down';
    }));
    getMessageListener()({
      request: {},
      streamKey: 'stream-a',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, {} as chrome.runtime.MessageSender, sendResponse);
    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        error: 'Replay Trivia request failed.',
        ok: false
      });
    });

    expect(getMessageListener()({
      type: 'unknown'
    }, {} as chrome.runtime.MessageSender, vi.fn())).toBe(false);
  });

  it('prefers the outer sender tab video id over an iframe fallback key', async () => {
    await import('./playground');
    const port = createFakePort('https://www.youtube.com/watch?v=outer-stream&feature=live');
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: [],
      streamKey: 'source-fallback',
      type: 'ytcq:playground:init'
    });

    expect(FakeWebSocket.instances[0].url).toBe('wss://playground.chatenhancer.com/v1/streams/outer-stream/socket');
  });

  it('uses the sender frame video_id parameter when no tab URL is available', async () => {
    await import('./playground');
    const port = createFakePort();
    port.sender = {
      url: 'https://www.youtube.com/live_chat?video_id=frame-stream'
    };
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: [],
      streamKey: 'source-fallback',
      type: 'ytcq:playground:init'
    });

    expect(FakeWebSocket.instances[0].url).toBe('wss://playground.chatenhancer.com/v1/streams/frame-stream/socket');
  });

  it('falls back to the provided stream key when sender URLs are malformed or missing video ids', async () => {
    await import('./playground');
    const malformedPort = createFakePort('not a url');
    getConnectListener()(malformedPort as unknown as chrome.runtime.Port);
    malformedPort.emit({
      availableGames: [],
      streamKey: 'source-fallback',
      type: 'ytcq:playground:init'
    });
    expect(FakeWebSocket.instances[0].url).toBe('wss://playground.chatenhancer.com/v1/streams/source-fallback/socket');

    const noVideoIdPort = createFakePort('https://www.youtube.com/watch?feature=live');
    getConnectListener()(noVideoIdPort as unknown as chrome.runtime.Port);
    noVideoIdPort.emit({
      availableGames: [],
      streamKey: 'source-fallback-2',
      type: 'ytcq:playground:init'
    });
    expect(FakeWebSocket.instances[1].url).toBe('wss://playground.chatenhancer.com/v1/streams/source-fallback-2/socket');
  });

  it('reconnects an unexpectedly dropped socket and keeps queued commands', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket.emit('close');
    port.emit({
      gameId: 'chess',
      toUserId: 'user-2',
      type: 'ytcq:playground:invite'
    });
    port.emit({
      action: 'shootBounty',
      gameId: 'game-bounty',
      payload: { messageId: 'message-1' },
      type: 'ytcq:playground:game-action'
    });

    expect(port.messages.at(-1)).toEqual({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(749);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(port.messages.at(-1)).toEqual({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });

    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.emit('message', {
      challenge: 'challenge-2',
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });

    await vi.waitFor(() => {
      expect(secondSocket.sent).toHaveLength(1);
    });
    secondSocket.emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    expect(secondSocket.sent).toEqual([
      expect.objectContaining({
        availableGames: ['chess'],
        type: 'hello'
      }),
      {
        gameId: 'chess',
        toUserId: 'user-2',
        type: 'invite'
      },
      {
        action: 'shootBounty',
        gameId: 'game-bounty',
        payload: { messageId: 'message-1' },
        type: 'gameAction'
      }
    ]);
  });

  it('keeps only the newest 20 commands while disconnected', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['bounty-hunting'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    FakeWebSocket.instances[0].emit('close');

    for (let index = 0; index < 25; index += 1) {
      port.emit({
        action: 'observeBountyMessage',
        gameId: 'game-bounty',
        payload: {
          observations: [{
            bountyIds: [],
            messageId: `later-message-${index}`
          }]
        },
        type: 'ytcq:playground:game-action'
      });
    }

    await vi.advanceTimersByTimeAsync(750);
    const socket = FakeWebSocket.instances[1];
    await authenticateSocket(socket);

    const queuedMessages = socket.sent.slice(1);
    expect(queuedMessages).toHaveLength(20);
    expect(queuedMessages[0]).toEqual({
      action: 'observeBountyMessage',
      gameId: 'game-bounty',
      payload: {
        observations: [{
          bountyIds: [],
          messageId: 'later-message-5'
        }]
      },
      type: 'gameAction'
    });
    expect(queuedMessages.at(-1)).toEqual({
      action: 'observeBountyMessage',
      gameId: 'game-bounty',
      payload: {
        observations: [{
          bountyIds: [],
          messageId: 'later-message-24'
        }]
      },
      type: 'gameAction'
    });
  });

  it('clears a scheduled reconnect without dropping same-stream queued commands', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    FakeWebSocket.instances[0].emit('close');
    port.emit({
      action: 'shootBounty',
      gameId: 'game-bounty',
      payload: { messageId: 'message-1' },
      type: 'ytcq:playground:game-action'
    });

    port.emit({
      availableGames: ['chess', 'bounty-hunting'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    await vi.advanceTimersByTimeAsync(750);

    expect(FakeWebSocket.instances).toHaveLength(2);
    const socket = FakeWebSocket.instances[1];
    await authenticateSocket(socket);
    expect(socket.sent.at(-1)).toEqual({
      action: 'shootBounty',
      gameId: 'game-bounty',
      payload: { messageId: 'message-1' },
      type: 'gameAction'
    });
  });

  it('drops queued commands when a fresh init switches streams', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['bounty-hunting'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    FakeWebSocket.instances[0].emit('close');
    port.emit({
      action: 'shootBounty',
      gameId: 'game-bounty',
      payload: { messageId: 'message-1' },
      type: 'ytcq:playground:game-action'
    });

    port.emit({
      availableGames: ['bounty-hunting'],
      streamKey: 'stream-b',
      type: 'ytcq:playground:init'
    });
    const socket = FakeWebSocket.instances[1];
    expect(socket.url).toBe('wss://playground.chatenhancer.com/v1/streams/stream-b/socket');
    await authenticateSocket(socket);
    expect(socket.sent).toHaveLength(1);
  });

  it('does not reconnect after an explicit playground disconnect', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    const socket = FakeWebSocket.instances[0];
    port.emit({
      type: 'ytcq:playground:disconnect'
    });
    socket.emit('close');
    await vi.advanceTimersByTimeAsync(20_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(socket.readyState).toBe(3);
  });

  it('clears a pending reconnect when disconnect arrives after the socket closed', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    FakeWebSocket.instances[0].emit('close');
    port.emit({
      type: 'ytcq:playground:disconnect'
    });
    await vi.advanceTimersByTimeAsync(750);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('stops reconnecting after all retry delays fail', async () => {
    vi.useFakeTimers();
    FakeWebSocket.constructorError = new Error('constructor failed');
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    await vi.advanceTimersByTimeAsync(750 + 2_000 + 5_000 + 10_000);

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(port.messages.at(-1)).toEqual({
      error: 'constructor failed',
      status: 'disconnected',
      type: 'ytcq:playground:status'
    });
  });

  it('removes listeners and closes the socket when the port disconnects', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);
    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    const disconnect = vi.mocked(port.onDisconnect.addListener).mock.calls[0]?.[0];
    disconnect?.();

    expect(port.onMessage.removeListener).toHaveBeenCalled();
    expect(port.onDisconnect.removeListener).toHaveBeenCalled();
    expect(FakeWebSocket.instances[0].readyState).toBe(3);
  });

  it('drops the content port when posting back fails', async () => {
    await import('./playground');
    const port = createFakePort();
    port.postMessage = vi.fn(() => {
      throw new Error('port closed');
    });
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    expect(FakeWebSocket.instances[0]?.readyState).toBe(FakeWebSocket.OPEN);
    FakeWebSocket.instances[0].emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });
    expect(port.postMessage).toHaveBeenCalledOnce();
  });
});

function getConnectListener(): (port: chrome.runtime.Port) => void {
  const listener = vi.mocked(chrome.runtime.onConnect.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No runtime connect listener registered.');
  return listener as (port: chrome.runtime.Port) => void;
}

async function authenticateSocket(socket: FakeWebSocket): Promise<void> {
  socket.emit('message', {
    challenge: 'challenge-current',
    gameVersions: { ...PLAYGROUND_GAME_VERSIONS },
    issuedAt: Date.now(),
    protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
    type: 'challenge'
  });
  await vi.waitFor(() => {
    expect(socket.sent).toHaveLength(1);
  });
  socket.emit('message', {
    snapshot: {
      games: [],
      invites: [],
      users: []
    },
    type: 'helloAccepted',
    userId: 'user-1'
  });
}

function getMessageListener(): (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | undefined {
  const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No runtime message listener registered.');
  return listener as (
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => boolean | undefined;
}

function createFakePort(senderTabUrl?: string): FakePort {
  const messageListeners = new Set<(message: PlaygroundContentMessage) => void>();
  return {
    emit: (message) => {
      messageListeners.forEach((listener) => listener(message));
    },
    messages: [],
    name: PLAYGROUND_PORT_NAME,
    onDisconnect: {
      addListener: vi.fn(),
      removeListener: vi.fn()
    },
    onMessage: {
      addListener: vi.fn((listener: (message: PlaygroundContentMessage) => void) => {
        messageListeners.add(listener);
      }),
      removeListener: vi.fn((listener: (message: PlaygroundContentMessage) => void) => {
        messageListeners.delete(listener);
      })
    },
    postMessage: vi.fn(function postMessage(this: FakePort, message: PlaygroundBackgroundMessage) {
      this.messages.push(message);
    }),
    sender: senderTabUrl ? { tab: { url: senderTabUrl } } : undefined
  };
}
