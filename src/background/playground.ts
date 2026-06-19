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
  type ClientMessage,
  type GameId,
  type PlaygroundBackgroundMessage,
  type PlaygroundContentMessage,
  type ServerMessage,
  type SignedClientIdentity
} from '../shared/playground/protocol';
import {
  PLAYGROUND_IDENTITY_STORAGE_KEY,
  PLAYGROUND_PROFILE_STATS_ROUTE,
  encodeBase64Url,
  getPlaygroundDisplayName,
  getPlaygroundUserId,
  isPlaygroundProfileMessage,
  isStoredPlaygroundIdentity,
  type PlaygroundProfile,
  type PlaygroundProfileResponse,
  type StoredPlaygroundIdentity
} from '../shared/playground/identity';
import {
  REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE,
  REPLAY_TRIVIA_QUESTIONS_ROUTE,
  type ReplayTriviaQuestionsBackgroundMessage,
  type ReplayTriviaQuestionsBackgroundResponse,
  type ReplayTriviaQuestionsResponse
} from '../shared/playground/trivia';

const SIGNATURE_PREFIX = 'chat-enhancer-playground:';
const MAX_QUEUED_CLIENT_MESSAGES = 20;
const PLAYGROUND_HEARTBEAT_INTERVAL_MS = 20_000;
const PLAYGROUND_RECONNECT_DELAYS_MS = [750, 2_000, 5_000, 10_000] as const;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PLAYGROUND_PORT_NAME) return;

  const session = new PlaygroundBackgroundSession(port);
  session.attach();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isPlaygroundProfileMessage(message)) {
    void getStoredPlaygroundProfile()
      .then((profile) => sendResponse({
        ok: true,
        profile
      } satisfies PlaygroundProfileResponse))
      .catch((error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : 'Playground profile unavailable.',
          ok: false
        } satisfies PlaygroundProfileResponse);
      });
    return true;
  }

  if (!isReplayTriviaQuestionsBackgroundMessage(message)) return false;

  void requestReplayTriviaQuestions(message).then(sendResponse);
  return true;
});

class PlaygroundBackgroundSession {
  private availableGames: GameId[] = [];
  private identityPromise: Promise<StoredPlaygroundIdentity> | null = null;
  private pendingClientMessages: ClientMessage[] = [];
  private port: chrome.runtime.Port | null;
  private readonly senderStreamKey: string;
  private streamKey = '';
  private languageCode = getDefaultPlaygroundLanguageCode();
  private locale = '';
  private userId = '';
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
        this.languageCode = normalizeLanguageCode(message.languageCode) || getDefaultPlaygroundLanguageCode();
        this.locale = normalizeLanguageCode(message.locale) || this.languageCode;
        void this.connectSocket({ resetPendingMessages: true, resetReconnectAttempts: true });
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
        this.closeSocket({ allowReconnect: false });
        return;
    }
  };

  private handlePortDisconnect = (): void => {
    this.port?.onMessage.removeListener(this.handlePortMessage);
    this.port?.onDisconnect.removeListener(this.handlePortDisconnect);
    this.port = null;
    this.closeSocket({ allowReconnect: false });
  };

  private async connectSocket(options: {
    resetPendingMessages?: boolean;
    resetReconnectAttempts?: boolean;
  } = {}): Promise<void> {
    if (!this.streamKey || !this.port) return;
    this.clearReconnectTimer();
    this.closeSocket({ allowReconnect: false });
    if (options.resetPendingMessages) this.pendingClientMessages = [];
    if (options.resetReconnectAttempts) this.reconnectAttempt = 0;
    this.userId = '';
    this.postPortMessage({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });

    let socket: WebSocket;
    try {
      socket = new WebSocket(getPlaygroundSocketUrl(this.streamKey));
    } catch (error) {
      this.scheduleReconnect(error);
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
        this.stopHeartbeat();
        this.scheduleReconnect();
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
      this.reconnectAttempt = 0;
      this.startHeartbeat(socket);
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

    if (message.type === 'pong') return;

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
        languageCode: this.languageCode,
        locale: this.locale,
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

  private closeSocket({ allowReconnect }: { allowReconnect: boolean }): void {
    const socket = this.socket;
    this.socket = null;
    this.stopHeartbeat();
    if (!allowReconnect) {
      this.clearReconnectTimer();
    }
    if (!socket) return;
    socket.close();
  }

  private handleSocketFailure(socket: WebSocket, error?: unknown): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.userId = '';
    this.stopHeartbeat();
    try {
      socket.close();
    } catch {
      // The connection is already unusable.
    }
    this.scheduleReconnect(error);
  }

  private postDisconnected(error?: unknown): void {
    this.postPortMessage({
      error: error instanceof Error ? error.message : undefined,
      status: 'disconnected',
      type: 'ytcq:playground:status'
    });
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN || !this.userId) return;
      this.sendSocketMessage(socket, {
        id: `heartbeat-${Date.now().toString(36)}`,
        type: 'ping'
      });
    }, PLAYGROUND_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === null) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private scheduleReconnect(error?: unknown): void {
    if (!this.port || !this.streamKey) {
      this.postDisconnected(error);
      return;
    }

    const delay = PLAYGROUND_RECONNECT_DELAYS_MS[this.reconnectAttempt];
    if (delay === undefined) {
      this.reconnectAttempt = 0;
      this.postDisconnected(error);
      return;
    }

    this.reconnectAttempt += 1;
    this.postPortMessage({
      status: 'connecting',
      type: 'ytcq:playground:status'
    });
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private postPortMessage(message: PlaygroundBackgroundMessage): void {
    try {
      this.port?.postMessage(message);
    } catch {
      this.port = null;
      this.closeSocket({ allowReconnect: false });
    }
  }

  private getIdentity(): Promise<StoredPlaygroundIdentity> {
    this.identityPromise ||= getStoredPlaygroundIdentity();
    return this.identityPromise;
  }
}

function getPlaygroundSocketUrl(streamKey: string): string {
  const url = new URL(`/v1/streams/${encodeURIComponent(streamKey)}/socket`, PLAYGROUND_BACKEND_ORIGIN);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  return url.toString();
}

async function requestReplayTriviaQuestions(
  message: ReplayTriviaQuestionsBackgroundMessage
): Promise<ReplayTriviaQuestionsBackgroundResponse> {
  const streamKey = normalizeStreamKey(message.streamKey);
  if (!streamKey) {
    return {
      error: 'A YouTube stream key is required for Replay Trivia.',
      ok: false
    };
  }

  const url = new URL(
    `/v1/streams/${encodeURIComponent(streamKey)}/${REPLAY_TRIVIA_QUESTIONS_ROUTE}`,
    PLAYGROUND_BACKEND_ORIGIN
  );

  try {
    const response = await fetch(url.toString(), {
      body: JSON.stringify(message.request),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });

    if (!response.ok) {
      return {
        ...await getReplayTriviaError(response),
        ok: false,
        status: response.status
      };
    }

    return {
      ok: true,
      response: await response.json() as ReplayTriviaQuestionsResponse
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Replay Trivia request failed.',
      ok: false
    };
  }
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

function normalizeStreamKey(value: string): string {
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{4,80}$/.test(trimmed) ? trimmed : '';
}

function normalizeLanguageCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  const code = value.trim();
  return /^[a-zA-Z]{2,3}(?:[-_][a-zA-Z0-9]{2,8})?$/.test(code) ? code.replace('_', '-') : '';
}

function getDefaultPlaygroundLanguageCode(): string {
  return normalizeLanguageCode(chrome.i18n?.getUILanguage?.()) ||
    normalizeLanguageCode(navigator.language) ||
    'en';
}

async function getReplayTriviaError(response: Response): Promise<{ code?: string; error: string }> {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    return {
      code: body.error?.code,
      error: body.error?.message || `Replay Trivia request failed with ${response.status}.`
    };
  } catch {
    return {
      error: `Replay Trivia request failed with ${response.status}.`
    };
  }
}

async function createSignedPlaygroundIdentity(
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

async function getStoredPlaygroundProfile(): Promise<PlaygroundProfile> {
  const identity = await getStoredPlaygroundIdentity();
  const userId = await getPlaygroundUserId(identity.publicKeyJwk);
  return {
    displayName: getPlaygroundDisplayName(userId),
    userId,
    wins: await getRemotePlaygroundProfileWins(userId).catch(() => 0)
  };
}

async function getRemotePlaygroundProfileWins(userId: string): Promise<number> {
  const url = new URL(PLAYGROUND_PROFILE_STATS_ROUTE, PLAYGROUND_BACKEND_ORIGIN);
  url.searchParams.set('userId', userId);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  });
  if (!response.ok) return 0;

  const payload = await response.json();
  const stats = isRecord(payload) ? payload.stats : undefined;
  return isRecord(stats) ? getWinCount(stats) : 0;
}

function createSignaturePayload(challenge: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(`${SIGNATURE_PREFIX}${challenge}`));
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

function isReplayTriviaQuestionsBackgroundMessage(value: unknown): value is ReplayTriviaQuestionsBackgroundMessage {
  if (!isRecord(value)) return false;
  return value.type === REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE &&
    typeof value.streamKey === 'string' &&
    isRecord(value.request);
}

function getWinCount(value: unknown): number {
  if (!isRecord(value) || typeof value.wins !== 'number' || !Number.isFinite(value.wins) || value.wins <= 0) {
    return 0;
  }
  return Math.floor(value.wins);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
