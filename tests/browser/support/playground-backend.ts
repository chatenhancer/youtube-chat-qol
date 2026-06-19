/**
 * Deterministic Playground backend mock for browser scenarios.
 *
 * The extension talks to Playground from the background service worker through
 * WebSocket, so browser scenarios mock that socket instead of reaching into
 * content-script internals.
 */
import { expect, type BrowserContext, type Worker } from '@playwright/test';
import type {
  ClientMessage,
  GameId,
  LobbySnapshot,
  PresenceUser,
  ServerMessage
} from '../../../src/shared/playground/protocol';
import { getExtensionServiceWorker } from './extension';

export interface MockPlaygroundBackend {
  getClientMessages: () => Promise<ClientMessage[]>;
  sendServerMessage: (message: ServerMessage) => Promise<void>;
  waitForClientMessage: <Type extends ClientMessage['type']>(
    type: Type
  ) => Promise<Extract<ClientMessage, { type: Type }>>;
}

interface MockPlaygroundBackendOptions {
  snapshot?: LobbySnapshot;
  userId?: string;
}

export async function installMockPlaygroundBackend(
  context: BrowserContext,
  {
    snapshot = createMockPlaygroundSnapshot(),
    userId = 'browser-user'
  }: MockPlaygroundBackendOptions = {}
): Promise<MockPlaygroundBackend> {
  const serviceWorker = await getExtensionServiceWorker(context);
  await installServiceWorkerWebSocketMock(serviceWorker, { snapshot, userId });

  return {
    getClientMessages: () => readServiceWorkerClientMessages(serviceWorker),
    sendServerMessage: (message) => {
      return serviceWorker.evaluate((serverMessage) => {
        const mock = (globalThis as typeof globalThis & {
          __ytcqMockPlaygroundBackend?: {
            sendServerMessage: (message: ServerMessage) => void;
          };
        }).__ytcqMockPlaygroundBackend;
        mock?.sendServerMessage(serverMessage);
      }, message);
    },
    waitForClientMessage: async (type) => {
      await expect.poll(async () => {
        const messages = await readServiceWorkerClientMessages(serviceWorker);
        return messages.some((message) => message.type === type);
      }, {
        message: `Expected Playground client message ${type}.`,
        timeout: 10_000
      }).toBe(true);

      const messages = await readServiceWorkerClientMessages(serviceWorker);
      return messages.find((message) => message.type === type) as Extract<ClientMessage, { type: typeof type }>;
    }
  };
}

export function createMockPlaygroundSnapshot({
  games = [],
  invites = [],
  users = createMockPlaygroundUsers()
}: Partial<LobbySnapshot> = {}): LobbySnapshot {
  return {
    games,
    invites,
    users
  };
}

export function createMockPlaygroundUsers(): PresenceUser[] {
  return [
    createMockPresenceUser('browser-user', 'Browser Viewer', ['chess', 'bounty-hunting', 'replay-trivia']),
    createMockPresenceUser('luna-user', 'Luna Chat', ['chess', 'bounty-hunting', 'replay-trivia']),
    createMockPresenceUser('marco-user', 'Marco Vibes', ['chess', 'bounty-hunting', 'replay-trivia']),
    createMockPresenceUser('server:computer:chess:beginner', 'Computer (Beginner)', ['chess']),
    createMockPresenceUser('server:computer:bounty-hunting', 'Computer (Bounty Hunter)', ['bounty-hunting'])
  ];
}

function createMockPresenceUser(userId: string, displayName: string, availableGames: GameId[]): PresenceUser {
  return {
    availableGames,
    displayName,
    joinedAt: Date.now(),
    userId
  };
}

async function installServiceWorkerWebSocketMock(
  serviceWorker: Worker,
  options: Required<MockPlaygroundBackendOptions>
): Promise<void> {
  await serviceWorker.evaluate(({ snapshot, userId }) => {
    const mock = {
      clientMessages: [] as ClientMessage[],
      sendServerMessage: (_message: ServerMessage) => undefined as void,
      sockets: [] as EventTarget[]
    };

    class MockPlaygroundWebSocket extends EventTarget {
      static readonly CLOSED = 3;
      static readonly CLOSING = 2;
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;

      readonly url: string;
      readyState = MockPlaygroundWebSocket.OPEN;

      constructor(url: string) {
        super();
        this.url = url;
        mock.sockets.push(this);
        mock.sendServerMessage = (message: ServerMessage): void => {
          this.dispatchMessage(message);
        };
        setTimeout(() => {
          this.dispatchMessage({
            challenge: 'browser-test-challenge',
            issuedAt: Date.now(),
            protocolVersion: 1,
            type: 'challenge'
          });
        }, 0);
      }

      close(): void {
        if (this.readyState === MockPlaygroundWebSocket.CLOSED) return;
        this.readyState = MockPlaygroundWebSocket.CLOSED;
        this.dispatchEvent(new Event('close'));
      }

      send(data: string): void {
        const parsed = parseClientMessage(data);
        if (!parsed) return;

        mock.clientMessages.push(parsed);
        if (parsed.type === 'hello') {
          setTimeout(() => {
            this.dispatchMessage({
              snapshot,
              type: 'helloAccepted',
              userId
            });
          }, 0);
        }
        if (parsed.type === 'ping') {
          setTimeout(() => {
            this.dispatchMessage({
              id: parsed.id,
              type: 'pong'
            });
          }, 0);
        }
      }

      private dispatchMessage(message: ServerMessage): void {
        if (this.readyState !== MockPlaygroundWebSocket.OPEN) return;
        this.dispatchEvent(new MessageEvent('message', {
          data: JSON.stringify(message)
        }));
      }
    }

    function parseClientMessage(data: string): ClientMessage | null {
      try {
        const parsed = JSON.parse(data) as ClientMessage;
        return parsed && typeof parsed.type === 'string' ? parsed : null;
      } catch {
        return null;
      }
    }

    (globalThis as typeof globalThis & {
      WebSocket: typeof WebSocket;
      __ytcqMockPlaygroundBackend?: typeof mock;
    }).__ytcqMockPlaygroundBackend = mock;
    (globalThis as typeof globalThis & {
      WebSocket: typeof WebSocket;
    }).WebSocket = MockPlaygroundWebSocket as unknown as typeof WebSocket;
  }, options);
}

async function readServiceWorkerClientMessages(serviceWorker: Worker): Promise<ClientMessage[]> {
  return serviceWorker.evaluate(() => {
    return (globalThis as typeof globalThis & {
      __ytcqMockPlaygroundBackend?: {
        clientMessages: ClientMessage[];
      };
    }).__ytcqMockPlaygroundBackend?.clientMessages || [];
  });
}
