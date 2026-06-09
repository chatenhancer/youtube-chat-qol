/**
 * Playground backend bridge.
 *
 * Content scripts render the YouTube UI, while this background module owns the
 * remote socket and signed per-install identity. Keeping the network transport
 * here avoids granting the backend direct YouTube-page origins.
 */
import {
  PLAYGROUND_BACKEND_ORIGIN,
  PLAYGROUND_PORT_NAME,
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientProfile,
  type ClientMessage,
  type GameId,
  type PlaygroundBackgroundMessage,
  type PlaygroundContentMessage,
  type ServerMessage,
  type SignedClientIdentity
} from '../shared/playground-protocol';

const PLAYGROUND_IDENTITY_STORAGE_KEY = 'ytcqPlaygroundIdentity:v1';
const SIGNATURE_PREFIX = 'chat-enhancer-playground:';
const MAX_QUEUED_CLIENT_MESSAGES = 20;

interface StoredPlaygroundIdentity {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PLAYGROUND_PORT_NAME) return;

  const session = new PlaygroundBackgroundSession(port);
  session.attach();
});

export class PlaygroundBackgroundSession {
  private availableGames: GameId[] = [];
  private identityPromise: Promise<StoredPlaygroundIdentity> | null = null;
  private pendingClientMessages: ClientMessage[] = [];
  private port: chrome.runtime.Port | null;
  private profile: ClientProfile | undefined;
  private readonly senderStreamKey: string;
  private streamKey = '';
  private userId = '';
  private socket: WebSocket | null = null;

  constructor(port: chrome.runtime.Port) {
    this.port = port;
    this.senderStreamKey = getVideoIdFromUrl(port.sender?.tab?.url || port.sender?.url || '');
  }

  attach(): void {
    const port = this.port;
    if (!port) return;

    port.onMessage.addListener(this.handlePortMessage);
    port.onDisconnect.addListener(this.handlePortDisconnect);
  }

  private handlePortMessage = (message: PlaygroundContentMessage): void => {
    switch (message?.type) {
      case 'ytcq:playground:init':
        this.streamKey = this.senderStreamKey || message.streamKey;
        this.availableGames = message.availableGames;
        this.profile = message.profile;
        void this.connectSocket({ resetPendingMessages: true });
        return;
      case 'ytcq:playground:set-availability':
        this.availableGames = message.availableGames;
        this.sendClientMessage({
          availableGames: message.availableGames,
          type: 'setAvailability'
        });
        return;
      case 'ytcq:playground:invite':
        this.sendClientMessage({
          gameId: message.gameId,
          toUserId: message.toUserId,
          type: 'invite'
        });
        return;
      case 'ytcq:playground:respond-invite':
        this.sendClientMessage({
          accept: message.accept,
          inviteId: message.inviteId,
          type: 'respondInvite'
        });
        return;
      case 'ytcq:playground:game-action':
        this.sendClientMessage({
          action: message.action,
          gameId: message.gameId,
          payload: message.payload,
          type: 'gameAction'
        });
        return;
      case 'ytcq:playground:disconnect':
        this.closeSocket();
        return;
    }
  };

  private handlePortDisconnect = (): void => {
    this.port?.onMessage.removeListener(this.handlePortMessage);
    this.port?.onDisconnect.removeListener(this.handlePortDisconnect);
    this.port = null;
    this.closeSocket();
  };

  private async connectSocket(options: { resetPendingMessages?: boolean } = {}): Promise<void> {
    if (!this.streamKey || !this.port) return;
    this.closeSocket();
    if (options.resetPendingMessages) this.pendingClientMessages = [];
    this.userId = '';
    this.postPortMessage({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });

    let socket: WebSocket;
    try {
      socket = new WebSocket(getPlaygroundSocketUrl(this.streamKey));
    } catch (error) {
      this.postDisconnected(error);
      return;
    }

    this.socket = socket;
    socket.addEventListener('message', (event) => {
      void this.handleSocketMessage(socket, event.data);
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.userId = '';
        this.postDisconnected();
      }
    });
    socket.addEventListener('error', () => {
      if (this.socket === socket) {
        this.handleSocketFailure(socket, new Error('Playground connection failed.'));
      }
    });
  }

  private async handleSocketMessage(socket: WebSocket, data: unknown): Promise<void> {
    const message = parseServerMessage(data);
    if (!message) return;

    if (message.type === 'challenge') {
      await this.respondToChallenge(socket, message.challenge);
      return;
    }

    if (message.type === 'helloAccepted') {
      this.userId = message.userId;
      this.postPortMessage({
        status: 'connected',
        type: 'ytcq:playground:status'
      });
      this.postPortMessage({
        snapshot: message.snapshot,
        type: 'ytcq:playground:snapshot',
        userId: message.userId
      });
      this.flushPendingClientMessages();
      return;
    }

    if (message.type === 'presenceSnapshot') {
      this.postPortMessage({
        snapshot: message.snapshot,
        type: 'ytcq:playground:snapshot',
        userId: this.userId
      });
      return;
    }

    if (message.type === 'error') {
      this.postPortMessage({
        code: message.code,
        message: message.message,
        type: 'ytcq:playground:error'
      });
    }

    this.postPortMessage({
      message,
      type: 'ytcq:playground:server-message'
    });
  }

  private async respondToChallenge(socket: WebSocket, challenge: string): Promise<void> {
    try {
      const identity = await this.getIdentity();
      this.sendSocketMessage(socket, {
        availableGames: this.availableGames,
        identity: await createSignedPlaygroundIdentity(challenge, identity),
        profile: this.profile,
        protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
        type: 'hello'
      });
    } catch (error) {
      this.handleSocketFailure(socket, error);
    }
  }

  private sendClientMessage(message: ClientMessage): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN || !this.userId) {
      this.pendingClientMessages = [...this.pendingClientMessages, message].slice(-MAX_QUEUED_CLIENT_MESSAGES);
      return;
    }
    if (!this.sendSocketMessage(socket, message)) {
      this.pendingClientMessages = [...this.pendingClientMessages, message].slice(-MAX_QUEUED_CLIENT_MESSAGES);
    }
  }

  private flushPendingClientMessages(): void {
    const messages = this.pendingClientMessages;
    this.pendingClientMessages = [];
    messages.forEach((message) => this.sendClientMessage(message));
  }

  private sendSocketMessage(socket: WebSocket, message: ClientMessage): boolean {
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.handleSocketFailure(socket, error);
      return false;
    }
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.close();
  }

  private handleSocketFailure(socket: WebSocket, error?: unknown): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.userId = '';
    try {
      socket.close();
    } catch {
      // The connection is already unusable.
    }
    this.postDisconnected(error);
  }

  private postDisconnected(error?: unknown): void {
    this.postPortMessage({
      error: error instanceof Error ? error.message : undefined,
      status: 'disconnected',
      type: 'ytcq:playground:status'
    });
  }

  private postPortMessage(message: PlaygroundBackgroundMessage): void {
    try {
      this.port?.postMessage(message);
    } catch {
      this.port = null;
      this.closeSocket();
    }
  }

  private getIdentity(): Promise<StoredPlaygroundIdentity> {
    this.identityPromise ||= getStoredPlaygroundIdentity();
    return this.identityPromise;
  }
}

export function getPlaygroundSocketUrl(streamKey: string): string {
  const url = new URL(`/v1/streams/${encodeURIComponent(streamKey)}/socket`, PLAYGROUND_BACKEND_ORIGIN);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  return url.toString();
}

function getVideoIdFromUrl(value: string): string {
  if (!value) return '';

  try {
    const url = new URL(value);
    return String(url.searchParams.get('v') || url.searchParams.get('video_id') || '').trim();
  } catch {
    return '';
  }
}

export async function createSignedPlaygroundIdentity(
  challenge: string,
  identity: StoredPlaygroundIdentity
): Promise<SignedClientIdentity> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    identity.privateKeyJwk,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['sign']
  );
  const signature = new Uint8Array(await crypto.subtle.sign(
    {
      hash: 'SHA-256',
      name: 'ECDSA'
    },
    privateKey,
    createSignaturePayload(challenge)
  ));

  return {
    publicKeyJwk: identity.publicKeyJwk,
    signature: encodeBase64Url(signature)
  };
}

async function getStoredPlaygroundIdentity(): Promise<StoredPlaygroundIdentity> {
  const stored = await chrome.storage.local.get(PLAYGROUND_IDENTITY_STORAGE_KEY);
  const candidate = stored[PLAYGROUND_IDENTITY_STORAGE_KEY];
  if (isStoredPlaygroundIdentity(candidate)) return candidate;

  const identity = await createStoredPlaygroundIdentity();
  await chrome.storage.local.set({
    [PLAYGROUND_IDENTITY_STORAGE_KEY]: identity
  });
  return identity;
}

async function createStoredPlaygroundIdentity(): Promise<StoredPlaygroundIdentity> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );
  return {
    privateKeyJwk: await crypto.subtle.exportKey('jwk', keyPair.privateKey),
    publicKeyJwk: await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  };
}

function isStoredPlaygroundIdentity(value: unknown): value is StoredPlaygroundIdentity {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredPlaygroundIdentity>;
  return isP256PrivateKey(candidate.privateKeyJwk) && isP256PublicKey(candidate.publicKeyJwk);
}

function isP256PrivateKey(value: unknown): value is JsonWebKey {
  return isRecord(value) &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    typeof value.x === 'string' &&
    typeof value.y === 'string' &&
    typeof value.d === 'string';
}

function isP256PublicKey(value: unknown): value is JsonWebKey {
  return isRecord(value) &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    typeof value.x === 'string' &&
    typeof value.y === 'string';
}

function createSignaturePayload(challenge: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(`${SIGNATURE_PREFIX}${challenge}`));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function parseServerMessage(data: unknown): ServerMessage | null {
  if (typeof data !== 'string') return null;

  try {
    const parsed = JSON.parse(data) as ServerMessage;
    return parsed && typeof parsed.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
