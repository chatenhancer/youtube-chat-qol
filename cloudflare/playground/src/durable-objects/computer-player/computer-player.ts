/**
 * Server-owned computer player.
 *
 * This Durable Object joins a stream room through the same WebSocket protocol
 * as extension clients. `StreamRoom` does not know that this participant is a
 * bot; it only sees an authenticated socket with a display name and available
 * games.
 */
import {
  COMPUTER_PLAYER_AVAILABLE_GAMES,
  COMPUTER_PLAYER_DISPLAY_NAME,
  createComputerPlayerActionFromPublicGame,
  getComputerPlayerActionDelayMs,
  shouldComputerPlayerActFromPublicGame,
  type ChessBotStockfishFailure
} from './actions';
import {
  createStockfishBestMoveProvider,
  type StockfishResult
} from '../stockfish-container/client';
import { connectStreamRoomSocket } from '../stream-room/client';
import { COMPUTER_PLAYER_STREAM_KEY_HEADER } from './client';
import { createJsonResponse } from '../../http';
import { createSignaturePayload, encodeBase64Url } from '../../protocol/identity';
import {
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type LobbySnapshot,
  type PublicGame,
  type ServerMessage
} from '../../protocol/messages';
import { sanitizeStreamKey } from '../../protocol/validation';
import { getLogErrorType, hashLogValue, logPlaygroundEvent, shortLogId } from '../../logging';
import type { DurableObjectState, Env } from '../../types';

const IDENTITY_STORAGE_KEY = 'computerPlayerIdentity:v1';
const IDLE_CLOSE_MS = 30_000;
const RECONNECT_DELAYS_MS = [750, 2_000, 5_000, 10_000] as const;
const STOCKFISH_RETRY_DELAYS_MS = [2_000, 5_000, 10_000] as const;
const MAX_LOG_MESSAGE_LENGTH = 180;
interface StoredComputerIdentity {
  privateKeyJwk: JsonWebKey;
  publicKeyJwk: JsonWebKey;
}

type ClientWebSocket = WebSocket & {
  accept(): void;
};

type WebSocketResponse = Response & {
  webSocket?: ClientWebSocket;
};

export class ComputerPlayer {
  private readonly activeGameIds = new Set<string>();
  private readonly actionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly stockfishRetryAttempts = new Map<string, number>();
  private idleCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private socket: ClientWebSocket | null = null;
  private streamKey = '';
  private userId = '';

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return createJsonResponse({
        error: {
          code: 'method_not_allowed',
          message: 'Only POST is supported.'
        }
      }, { status: 405 });
    }

    const streamKey = sanitizeStreamKey(request.headers.get(COMPUTER_PLAYER_STREAM_KEY_HEADER) || '');
    this.streamKey = streamKey;
    this.state.waitUntil(this.ensureConnected());
    return createJsonResponse({ ok: true });
  }

  private async ensureConnected(): Promise<void> {
    const socket = this.socket;
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
      return;
    }

    this.clearReconnectTimer();
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.streamKey) return;

    this.closeSocket({ reconnect: false });
    const response = await connectStreamRoomSocket(
      this.env,
      this.streamKey,
      COMPUTER_PLAYER_DISPLAY_NAME
    ) as WebSocketResponse;

    if (!response.webSocket) throw new Error('Stream room did not return a WebSocket.');

    const socket = response.webSocket;
    socket.accept();
    this.socket = socket;
    this.logEvent('computer_player_socket_connected');
    socket.addEventListener('message', (event) => {
      void this.handleSocketMessage(socket, event.data);
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.userId = '';
      this.clearActionTimers();
      this.scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      this.closeSocket({ reconnect: true });
    });
  }

  private async handleSocketMessage(socket: ClientWebSocket, data: unknown): Promise<void> {
    const message = parseServerMessage(data);
    if (!message || this.socket !== socket) return;

    switch (message.type) {
      case 'challenge':
        await this.respondToChallenge(socket, message.challenge);
        return;
      case 'helloAccepted':
        this.userId = message.userId;
        this.reconnectAttempt = 0;
        this.logEvent('computer_player_authenticated', {
          gameCount: message.snapshot.games.length,
          user: hashLogValue(message.userId)
        });
        this.handleSnapshot(message.snapshot);
        return;
      case 'presenceSnapshot':
        this.handleSnapshot(message.snapshot);
        return;
      case 'inviteReceived':
        this.sendSocketMessage({
          accept: true,
          inviteId: message.invite.inviteId,
          type: 'respondInvite'
        });
        return;
      case 'gameStarted':
      case 'gameUpdated':
        this.handleGameChanged(message.game);
        return;
      case 'gameEnded':
        this.activeGameIds.delete(message.gameId);
        this.clearGameActionState(message.gameId);
        return;
      case 'error':
        this.logEvent('computer_player_socket_error', {
          code: message.code,
          message: truncateLogMessage(message.message)
        }, 'warn');
        return;
      case 'inviteCreated':
      case 'inviteUpdated':
      case 'pong':
        return;
    }
  }

  private async respondToChallenge(socket: ClientWebSocket, challenge: string): Promise<void> {
    const identity = await this.getIdentity();
    this.sendSocketMessage({
      availableGames: [...COMPUTER_PLAYER_AVAILABLE_GAMES],
      identity: await this.signIdentity(challenge, identity),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'hello'
    }, socket);
  }

  private handleSnapshot(snapshot: LobbySnapshot): void {
    this.activeGameIds.clear();
    snapshot.games.forEach((game) => this.handleGameChanged(game));
    this.updateIdleClose(snapshot);
  }

  private updateIdleClose(snapshot: LobbySnapshot): void {
    if (!this.userId) return;
    const hasOtherParticipant = snapshot.users.some((user) => user.userId !== this.userId);
    const hasActiveGame = this.activeGameIds.size > 0 || snapshot.games.some(isActivePublicGame);
    if (hasOtherParticipant || hasActiveGame) {
      this.clearIdleCloseTimer();
      return;
    }

    if (this.idleCloseTimer) return;
    this.idleCloseTimer = setTimeout(() => {
      this.idleCloseTimer = null;
      this.logEvent('computer_player_idle_closed', {
        activeGameCount: this.activeGameIds.size
      });
      this.closeSocket({ reconnect: false });
    }, IDLE_CLOSE_MS);
  }

  private handleGameChanged(game: PublicGame): void {
    if (isActivePublicGame(game)) {
      this.activeGameIds.add(game.gameId);
      this.clearIdleCloseTimer();
    } else {
      this.activeGameIds.delete(game.gameId);
    }

    this.clearGameActionState(game.gameId);
    if (!this.userId || !shouldComputerPlayerActFromPublicGame(game, this.userId)) return;

    const delayMs = getComputerPlayerActionDelayMs(game);
    const timer = setTimeout(() => {
      this.actionTimers.delete(game.gameId);
      this.runActionInBackground(game);
    }, delayMs);
    this.actionTimers.set(game.gameId, timer);
    this.logEvent('computer_player_action_scheduled', {
      delayMs,
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      user: hashLogValue(this.userId)
    });
  }

  private async runAction(game: PublicGame): Promise<void> {
    if (!this.userId || !shouldComputerPlayerActFromPublicGame(game, this.userId)) return;

    let stockfishFailure: ChessBotStockfishFailure | null = null;
    const action = await createComputerPlayerActionFromPublicGame(game, this.userId, {
      getStockfishBestMove: createStockfishBestMoveProvider(this.env),
      onChessBotStockfishFailure: (failure) => {
        stockfishFailure = failure;
        this.logChessBotStockfishFailure(game, failure);
      },
      onChessBotStockfishMove: (result) => this.logChessBotStockfishMove(game, result)
    });
    if (!action) {
      if (stockfishFailure) this.scheduleStockfishRetry(game, stockfishFailure);
      return;
    }

    this.stockfishRetryAttempts.delete(game.gameId);

    this.sendGameAction(game, action.action, action.payload);
  }

  private runActionInBackground(game: PublicGame): void {
    this.state.waitUntil(this.runAction(game).catch((error) => {
      this.logEvent('computer_player_action_failed', {
        errorType: getLogErrorType(error),
        game: shortLogId(game.gameId),
        gameType: game.gameType,
        user: hashLogValue(this.userId)
      }, 'warn');
    }));
  }

  private scheduleStockfishRetry(game: PublicGame, failure: ChessBotStockfishFailure): void {
    if (!this.userId || !shouldComputerPlayerActFromPublicGame(game, this.userId)) return;

    const attemptIndex = this.stockfishRetryAttempts.get(game.gameId) ?? 0;
    const delayMs = STOCKFISH_RETRY_DELAYS_MS[attemptIndex];
    if (delayMs === undefined) {
      this.stockfishRetryAttempts.set(game.gameId, STOCKFISH_RETRY_DELAYS_MS.length);
      this.logEvent('chess_bot_stockfish_retry_exhausted', {
        attempts: STOCKFISH_RETRY_DELAYS_MS.length,
        game: shortLogId(game.gameId),
        gameType: game.gameType,
        lastReason: failure.reason,
        user: hashLogValue(this.userId)
      }, 'warn');
      this.sendGameAction(game, 'leave');
      return;
    }

    const attempt = attemptIndex + 1;
    this.stockfishRetryAttempts.set(game.gameId, attempt);
    const timer = setTimeout(() => {
      this.actionTimers.delete(game.gameId);
      this.runActionInBackground(game);
    }, delayMs);
    this.actionTimers.set(game.gameId, timer);
    this.logEvent('chess_bot_stockfish_retry_scheduled', {
      attempt,
      delayMs,
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      reason: failure.reason,
      user: hashLogValue(this.userId)
    });
  }

  private sendGameAction(game: PublicGame, action: string, payload?: Record<string, unknown>): boolean {
    const sent = this.sendSocketMessage({
      action,
      gameId: game.gameId,
      payload,
      type: 'gameAction'
    });
    this.logEvent(sent ? 'computer_player_action_sent' : 'computer_player_action_send_failed', {
      action,
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      user: hashLogValue(this.userId)
    }, sent ? 'info' : 'warn');
    return sent;
  }

  private async getIdentity(): Promise<StoredComputerIdentity> {
    const stored = await this.state.storage.get<StoredComputerIdentity>(IDENTITY_STORAGE_KEY);
    if (isStoredComputerIdentity(stored)) return stored;

    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['sign', 'verify']
    );
    const identity = {
      privateKeyJwk: await crypto.subtle.exportKey('jwk', keyPair.privateKey),
      publicKeyJwk: await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    };
    await this.state.storage.put(IDENTITY_STORAGE_KEY, identity);
    return identity;
  }

  private async signIdentity(
    challenge: string,
    identity: StoredComputerIdentity
  ): Promise<Extract<ClientMessage, { type: 'hello' }>['identity']> {
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      identity.privateKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
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

  private sendSocketMessage(message: ClientMessage, socket = this.socket): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      this.closeSocket({ reconnect: true });
      return false;
    }
  }

  private closeSocket({ reconnect }: { reconnect: boolean }): void {
    const socket = this.socket;
    this.socket = null;
    this.userId = '';
    this.clearIdleCloseTimer();
    this.clearActionTimers();
    if (!socket) return;
    try {
      socket.close();
    } catch {
      // The connection is already unusable.
    }
    if (reconnect) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.streamKey || this.reconnectTimer) return;
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt];
    if (delay === undefined) {
      this.reconnectAttempt = 0;
      return;
    }
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.state.waitUntil(this.ensureConnected());
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearIdleCloseTimer(): void {
    if (!this.idleCloseTimer) return;
    clearTimeout(this.idleCloseTimer);
    this.idleCloseTimer = null;
  }

  private clearActionTimer(gameId: string): void {
    const timer = this.actionTimers.get(gameId);
    if (!timer) return;
    clearTimeout(timer);
    this.actionTimers.delete(gameId);
  }

  private clearGameActionState(gameId: string): void {
    this.clearActionTimer(gameId);
    this.stockfishRetryAttempts.delete(gameId);
  }

  private clearActionTimers(): void {
    this.actionTimers.forEach((timer) => clearTimeout(timer));
    this.actionTimers.clear();
    this.stockfishRetryAttempts.clear();
  }

  private logChessBotStockfishFailure(game: PublicGame, failure: ChessBotStockfishFailure): void {
    this.logEvent('chess_bot_stockfish_unavailable', {
      errorMessage: getStockfishFailureErrorMessage(failure.error),
      errorType: failure.error === undefined ? undefined : getLogErrorType(failure.error),
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      reason: failure.reason,
      user: hashLogValue(this.userId)
    }, 'warn');
  }

  private logChessBotStockfishMove(game: PublicGame, result: StockfishResult): void {
    this.logEvent('chess_bot_stockfish_move', {
      elapsedMs: result.elapsedMs,
      elo: result.elo,
      fen: result.fenHash,
      from: result.move?.from,
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      moveTimeMs: result.moveTimeMs,
      promotion: result.move?.promotion,
      source: 'container',
      to: result.move?.to,
      user: hashLogValue(this.userId)
    });
  }

  private logEvent(
    event: string,
    details: Record<string, boolean | number | string | undefined> = {},
    level: 'error' | 'info' | 'warn' = 'info'
  ): void {
    logPlaygroundEvent(event, {
      room: this.streamKey ? hashLogValue(this.streamKey) : undefined,
      ...details
    }, level);
  }
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

function isStoredComputerIdentity(value: unknown): value is StoredComputerIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredComputerIdentity>;
  return isJsonWebKey(candidate.privateKeyJwk) && isJsonWebKey(candidate.publicKeyJwk);
}

function isJsonWebKey(value: unknown): value is JsonWebKey {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isActivePublicGame(game: PublicGame): boolean {
  return game.status !== 'checkmate'
    && game.status !== 'draw'
    && game.status !== 'finished'
    && game.status !== 'resigned';
}

function getStockfishFailureErrorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  const message = error instanceof Error ? error.message : String(error);
  return truncateLogMessage(message);
}

function truncateLogMessage(message: string): string {
  if (message.length <= MAX_LOG_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_LOG_MESSAGE_LENGTH - 3)}...`;
}
