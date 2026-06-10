import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAYGROUND_PORT_NAME,
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type PlaygroundBackgroundMessage,
  type PlaygroundContentMessage,
  type ServerMessage
} from '../shared/playground-protocol';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;

  listeners = new Map<string, Set<(event: { data?: string }) => void>>();
  readyState = FakeWebSocket.OPEN;
  sent: ClientMessage[] = [];
  url: string;

  constructor(url: string) {
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
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the playground socket, signs the challenge, and forwards the accepted snapshot', async () => {
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      profile: {
        displayName: 'Local Player'
      },
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
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });

    await vi.waitFor(() => {
      expect(FakeWebSocket.instances[0].sent).toHaveLength(1);
    });
    expect(FakeWebSocket.instances[0].sent[0]).toMatchObject({
      availableGames: ['chess'],
      profile: {
        displayName: 'Local Player'
      },
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    });
    expect((FakeWebSocket.instances[0].sent[0] as Extract<ClientMessage, { type: 'hello' }>).identity.signature).toEqual(expect.any(String));

    FakeWebSocket.instances[0].emit('message', {
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'helloAccepted',
      userId: 'user-1'
    });

    expect(port.messages.at(-2)).toEqual({
      status: 'connected',
      type: 'ytcq:playground:status'
    });
    expect(port.messages.at(-1)).toEqual({
      snapshot: {
        games: [],
        invites: [],
        users: []
      },
      type: 'ytcq:playground:snapshot',
      userId: 'user-1'
    });
    const stored = await chrome.storage.local.get('ytcqPlaygroundIdentity:v1');
    expect(stored['ytcqPlaygroundIdentity:v1']).toMatchObject({
      privateKeyJwk: expect.any(Object),
      publicKeyJwk: expect.any(Object)
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
      action: 'move',
      gameId: 'game-1',
      payload: {
        from: 'e2',
        to: 'e4'
      },
      type: 'ytcq:playground:game-action'
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
        action: 'move',
        gameId: 'game-1',
        payload: {
          from: 'e2',
          to: 'e4'
        },
        type: 'gameAction'
      }
    ]);
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

  it('reconnects an unexpectedly dropped socket and keeps queued commands', async () => {
    vi.useFakeTimers();
    await import('./playground');
    const port = createFakePort();
    getConnectListener()(port as unknown as chrome.runtime.Port);

    port.emit({
      availableGames: ['chess'],
      profile: {
        displayName: 'Local Player'
      },
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
        profile: {
          displayName: 'Local Player'
        },
        type: 'hello'
      }),
      {
        gameId: 'chess',
        toUserId: 'user-2',
        type: 'invite'
      }
    ]);
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
});

function getConnectListener(): (port: chrome.runtime.Port) => void {
  const listener = vi.mocked(chrome.runtime.onConnect.addListener).mock.calls.at(-1)?.[0];
  if (!listener) throw new Error('No runtime connect listener registered.');
  return listener as (port: chrome.runtime.Port) => void;
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
