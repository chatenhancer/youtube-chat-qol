/**
 * Stream-scoped realtime room.
 *
 * One Durable Object instance owns the Playground lobby for one YouTube stream:
 * WebSocket sessions, presence, invites, and active realtime game records.
 * Game-specific rules are delegated through `games/registry.ts`.
 */
import { getGameModule, getGameModuleForRecord } from '../games/registry';
import type { GameRecord } from '../games/types';
import { createErrorResponse, createJsonResponse } from '../http';
import { hashLogValue, logPlaygroundEvent, shortLogId } from '../logging';
import {
  createChallenge,
  verifySignedIdentity
} from '../protocol/identity';
import {
  PLAYGROUND_PROTOCOL_VERSION,
  type ClientMessage,
  type GameId,
  type LobbySnapshot,
  type PresenceUser,
  type PublicInvite,
  type PublicUserIdentity,
  type ServerMessage
} from '../protocol/messages';
import { parseClientMessage, ProtocolError, sanitizeStreamKey } from '../protocol/validation';
import { TokenBucket, type TokenBucketOptions } from '../rate-limit';
import { attachBotClientsToRoom } from '../bots/room-adapter';
import type { DurableObjectState, Env, ServerWebSocket } from '../types';

const INVITE_TTL_MS = 2 * 60 * 1000;
const MAX_MESSAGE_BYTES = 32_768;
const CLOSE_POLICY_VIOLATION = 1008;
const ROOM_STATE_STORAGE_KEY = 'roomState:v1';
const CONNECTION_RATE_LIMIT: TokenBucketOptions = {
  capacity: 30,
  refillPerSecond: 10
};
const USER_RATE_LIMIT: TokenBucketOptions = {
  capacity: 45,
  refillPerSecond: 10
};
const GENERATION_TOKEN_ROOM_RATE_LIMIT: TokenBucketOptions = {
  capacity: 6,
  refillPerSecond: 1 / 30
};
const GENERATION_TOKEN_USER_RATE_LIMIT: TokenBucketOptions = {
  capacity: 3,
  refillPerSecond: 1 / 60
};
const MESSAGE_RATE_COSTS: { [Type in ClientMessage['type']]: number } = {
  gameAction: 3,
  hello: 5,
  invite: 12,
  ping: 1,
  respondInvite: 4,
  setAvailability: 2
};

interface ClientSession {
  availableGames: Set<GameId>;
  challenge: string;
  connectionId: string;
  displayName: string;
  joinedAt: number;
  rateLimit: TokenBucket;
  socket: ServerWebSocket;
  userId: string;
}

interface PendingInvite {
  createdAt: number;
  expiresAt: number;
  fromUserId: string;
  gameId: GameId;
  inviteId: string;
  status: 'accepted' | 'ignored' | 'pending';
  toUserId: string;
}

interface GenerationTokenRecord {
  expiresAt: number;
  gameId: string;
  userId: string;
}

interface StoredRoomState {
  games: unknown[];
}

export class StreamRoom {
  private readonly clients = new Map<string, ClientSession>();
  private readonly generationTokens = new Map<string, GenerationTokenRecord>();
  private readonly generationTokenRoomRateLimit = new TokenBucket(GENERATION_TOKEN_ROOM_RATE_LIMIT);
  private readonly generationTokenUserRateLimits = new Map<string, TokenBucket>();
  private readonly invites = new Map<string, PendingInvite>();
  private readonly games = new Map<string, GameRecord>();
  private readonly userAvailableGames = new Map<string, GameId[]>();
  private readonly userRateLimits = new Map<string, TokenBucket>();
  private storageWriteQueue: Promise<unknown> = Promise.resolve();
  private streamKey = '';

  constructor(private readonly state: DurableObjectState, _env: Env) {
    this.state.blockConcurrencyWhile(async () => {
      await this.loadStoredRoomState();
      this.attachBotClients();
    });
  }

  private attachBotClients(): void {
    attachBotClientsToRoom({
      clients: this.clients,
      connectionRateLimitOptions: CONNECTION_RATE_LIMIT,
      createSnapshot: (userId) => this.createSnapshot(userId),
      getGame: (gameId) => this.games.get(gameId),
      handleMessage: (session, message) => this.handleSocketMessage(session, message),
      logEvent: (event, details, level) => this.logEvent(event, details, level),
      setAvailableGames: (userId, availableGames) => this.userAvailableGames.set(userId, availableGames),
      waitUntil: (promise) => this.state.waitUntil(promise)
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const streamKey = request.headers.get('X-Chat-Enhancer-Stream-Key') || url.searchParams.get('streamKey') || '';
    this.streamKey = sanitizeStreamKey(streamKey);

    if (url.pathname.endsWith('/internal/replay-trivia/generation-token/consume')) {
      return this.handleGenerationTokenConsume(request);
    }

    if (url.pathname.endsWith('/snapshot')) {
      return new Response(`${JSON.stringify(this.createSnapshot())}\n`, {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade.', { status: 426 });
    }

    return this.handleSocket();
  }

  private handleSocket(): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const socket = pair[1];
    const connectionId = createId('conn');
    const challenge = createChallenge();

    socket.accept();
    const pendingSession: ClientSession = {
      availableGames: new Set(),
      challenge,
      connectionId,
      displayName: 'Player',
      joinedAt: Date.now(),
      rateLimit: new TokenBucket(CONNECTION_RATE_LIMIT),
      socket,
      userId: ''
    };
    this.logEvent('websocket_accepted', {
      connection: shortLogId(connectionId)
    });

    socket.addEventListener('message', (event) => {
      void this.handleSocketMessage(pendingSession, event.data);
    });
    socket.addEventListener('close', () => {
      this.removeClient(connectionId, 'close');
    });
    socket.addEventListener('error', () => {
      this.logEvent('websocket_error', {
        connection: shortLogId(connectionId)
      }, 'warn');
      this.removeClient(connectionId, 'error');
    });

    sendMessage(socket, {
      challenge,
      issuedAt: Date.now(),
      protocolVersion: PLAYGROUND_PROTOCOL_VERSION,
      type: 'challenge'
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    } as ResponseInit & { webSocket: WebSocket });
  }

  private async handleSocketMessage(session: ClientSession, data: unknown): Promise<void> {
    try {
      if (typeof data !== 'string') throw new ProtocolError('invalid_message', 'Messages must be strings.');
      if (data.length > MAX_MESSAGE_BYTES) throw new ProtocolError('message_too_large', 'Message is too large.');

      const message = parseClientMessage(data);
      this.assertWithinRateLimit(session, message);
      if (message.type !== 'hello' && !session.userId) {
        throw new ProtocolError('hello_required', 'Send hello before other messages.');
      }

      await this.handleClientMessage(session, message);
    } catch (error) {
      const protocolError = normalizeError(error);
      this.logProtocolError(session, protocolError);
      sendMessage(session.socket, {
        code: protocolError.code,
        message: protocolError.message,
        type: 'error'
      });
      if (protocolError.code === 'hello_required' || protocolError.code === 'invalid_signature') {
        session.socket.close(CLOSE_POLICY_VIOLATION, protocolError.message);
      }
    }
  }

  private async handleClientMessage(session: ClientSession, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'hello':
        await this.handleHello(session, message);
        return;
      case 'setAvailability':
        session.availableGames = new Set(message.availableGames);
        this.userAvailableGames.set(session.userId, message.availableGames);
        this.logEvent('availability_changed', {
          availableGameCount: message.availableGames.length,
          connection: shortLogId(session.connectionId),
          user: hashLogValue(session.userId)
        });
        this.broadcastPresence();
        return;
      case 'invite':
        this.handleInvite(session, message.gameId, message.toUserId);
        return;
      case 'respondInvite':
        this.handleInviteResponse(session, message.inviteId, message.accept);
        return;
      case 'gameAction':
        this.handleGameAction(session, message.gameId, {
          action: message.action,
          payload: message.payload,
          userId: session.userId
        });
        return;
      case 'ping':
        sendMessage(session.socket, { id: message.id, type: 'pong' });
        return;
    }
  }

  private async handleHello(session: ClientSession, message: Extract<ClientMessage, { type: 'hello' }>): Promise<void> {
    if (session.userId) throw new ProtocolError('already_authenticated', 'This connection is already authenticated.');

    const identity = await verifySignedIdentity(session.challenge, message.identity);
    session.userId = identity.userId;
    session.displayName = getPlayerDisplayName(identity.userId);
    session.availableGames = new Set(message.availableGames || []);
    this.userAvailableGames.set(session.userId, [...session.availableGames]);
    session.joinedAt = Date.now();
    this.clients.set(session.connectionId, session);
    this.logEvent('client_authenticated', {
      availableGameCount: session.availableGames.size,
      connection: shortLogId(session.connectionId),
      user: hashLogValue(session.userId)
    });

    sendMessage(session.socket, {
      snapshot: this.createSnapshot(session.userId),
      type: 'helloAccepted',
      userId: session.userId
    });
    this.broadcastPresence();
  }

  private handleInvite(session: ClientSession, gameId: GameId, toUserId: string): void {
    if (session.userId === toUserId) throw new ProtocolError('self_invite', 'Choose another player.');

    const target = this.getUserPresence(toUserId);
    if (!target) throw new ProtocolError('user_not_found', 'That player is not connected.');
    if (!target.availableGames.includes(gameId)) {
      throw new ProtocolError('user_unavailable', 'That player is not available for this game.');
    }

    const now = Date.now();
    const invite: PendingInvite = {
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
      fromUserId: session.userId,
      gameId,
      inviteId: createId('inv'),
      status: 'pending',
      toUserId
    };
    this.invites.set(invite.inviteId, invite);

    const publicInvite = this.toPublicInvite(invite);
    this.logEvent('invite_created', {
      fromUser: hashLogValue(invite.fromUserId),
      gameType: invite.gameId,
      invite: shortLogId(invite.inviteId),
      toUser: hashLogValue(invite.toUserId)
    });
    this.sendToUser(session.userId, { invite: publicInvite, type: 'inviteCreated' });
    this.sendToUser(toUserId, { invite: publicInvite, type: 'inviteReceived' });
  }

  private handleInviteResponse(session: ClientSession, inviteId: string, accept: boolean): void {
    const invite = this.getPendingInvite(inviteId);
    if (invite.toUserId !== session.userId) {
      throw new ProtocolError('not_your_invite', 'That invite is not for you.');
    }

    invite.status = accept ? 'accepted' : 'ignored';
    this.logEvent(accept ? 'invite_accepted' : 'invite_ignored', {
      fromUser: hashLogValue(invite.fromUserId),
      gameType: invite.gameId,
      invite: shortLogId(invite.inviteId),
      toUser: hashLogValue(invite.toUserId)
    });
    const publicInvite = this.toPublicInvite(invite);
    this.sendToUser(invite.fromUserId, { invite: publicInvite, type: 'inviteUpdated' });
    this.sendToUser(invite.toUserId, { invite: publicInvite, type: 'inviteUpdated' });

    if (!accept) return;

    const game = getGameModule(invite.gameId).createGame(createId('game'), [invite.fromUserId, invite.toUserId]);
    this.games.set(game.gameId, game);
    this.queueStoredRoomStateWrite();
    this.logEvent('game_started', {
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      playerCount: getGameModuleForRecord(game).getRecipientUserIds(game).length
    });
    const publicGame = getGameModuleForRecord(game).toPublicGame(game, (userId) => this.getPublicUser(userId));
    this.sendToUser(invite.fromUserId, { game: publicGame, type: 'gameStarted' });
    this.sendToUser(invite.toUserId, { game: publicGame, type: 'gameStarted' });
  }

  private handleGameAction(
    session: ClientSession,
    gameId: string,
    action: {
      action: string;
      payload?: Record<string, unknown>;
      userId: string;
    }
  ): void {
    const game = this.games.get(gameId);
    if (!game) throw new ProtocolError('game_not_found', 'Game not found.');
    if (action.action === 'leave') {
      this.handleLeaveGame(session, game);
      return;
    }
    if (action.action === 'requestGenerationToken') {
      this.handleGenerationTokenRequest(session, game);
      return;
    }

    const nextGame = getGameModuleForRecord(game).applyAction(game, action);
    this.games.set(gameId, nextGame);
    this.queueStoredRoomStateWrite();
    if (game.status !== nextGame.status && isTerminalGameStatus(nextGame.status)) {
      this.logEvent('game_ended', {
        game: shortLogId(nextGame.gameId),
        gameType: nextGame.gameType,
        reason: nextGame.status
      });
    }
    this.broadcastGame(nextGame);
  }

  private handleLeaveGame(session: ClientSession, game: GameRecord): void {
    const gameModule = getGameModuleForRecord(game);
    if (!gameModule.canUserAccessGame(game, session.userId)) {
      throw new ProtocolError('not_in_game', 'You are not a player in this game.');
    }

    this.games.delete(game.gameId);
    this.queueStoredRoomStateWrite();
    this.logEvent('game_ended', {
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      reason: 'playerLeft',
      user: hashLogValue(session.userId)
    });
    gameModule.getRecipientUserIds(game).forEach((userId) => {
      this.sendToUser(userId, {
        gameId: game.gameId,
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: session.userId
      });
    });
  }

  private handleGenerationTokenRequest(session: ClientSession, game: GameRecord): void {
    const gameModule = getGameModuleForRecord(game);
    if (!gameModule.createGenerationToken) {
      throw new ProtocolError('unsupported_action', 'This game does not support generated content.');
    }

    const now = Date.now();
    this.assertWithinGenerationTokenRateLimit(session, now);
    this.pruneExpiredGenerationTokens(now);

    const grant = gameModule.createGenerationToken(game, {
      now,
      userId: session.userId
    });
    const generationToken = createId('rtg');
    this.generationTokens.set(generationToken, {
      expiresAt: grant.expiresAt,
      gameId: game.gameId,
      userId: session.userId
    });

    this.logEvent('generation_token_created', {
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      user: hashLogValue(session.userId)
    });
    sendMessage(session.socket, {
      expiresAt: grant.expiresAt,
      gameId: game.gameId,
      generationToken,
      type: 'replayTriviaGenerationToken'
    });
  }

  private async handleGenerationTokenConsume(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return createErrorResponse('method_not_allowed', 'Only POST is supported.', 405);
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return createErrorResponse('invalid_json', 'Request body must be valid JSON.', 400);
    }
    if (!isRecord(payload)) {
      return createErrorResponse('invalid_request', 'Request body must be an object.', 400);
    }

    const gameId = typeof payload.gameId === 'string' ? payload.gameId.trim() : '';
    const generationToken = typeof payload.generationToken === 'string' ? payload.generationToken.trim() : '';
    if (!gameId || !generationToken) {
      return createErrorResponse('invalid_generation_token', 'Replay Trivia generation token is invalid.', 403);
    }

    const now = Date.now();
    this.pruneExpiredGenerationTokens(now);
    const token = this.generationTokens.get(generationToken);
    this.generationTokens.delete(generationToken);
    if (!token || token.gameId !== gameId || token.expiresAt <= now) {
      this.logEvent('generation_token_rejected', {
        game: gameId ? shortLogId(gameId) : undefined
      }, 'warn');
      return createErrorResponse('invalid_generation_token', 'Replay Trivia generation token is invalid or expired.', 403);
    }

    const game = this.games.get(token.gameId);
    if (!game) {
      return createErrorResponse('game_not_found', 'Game not found.', 404);
    }

    const gameModule = getGameModuleForRecord(game);
    if (!gameModule.validateGenerationToken) {
      return createErrorResponse('unsupported_action', 'This game does not support generated content.', 400);
    }

    try {
      gameModule.validateGenerationToken(game, {
        now,
        userId: token.userId
      });
    } catch (error) {
      const protocolError = normalizeError(error);
      this.logEvent('generation_token_rejected', {
        code: protocolError.code,
        game: shortLogId(game.gameId),
        gameType: game.gameType,
        user: hashLogValue(token.userId)
      }, 'warn');
      return createErrorResponse(protocolError.code, protocolError.message, 403);
    }

    this.logEvent('generation_token_consumed', {
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      user: hashLogValue(token.userId)
    });
    return createJsonResponse({
      gameId: token.gameId,
      ok: true,
      userId: token.userId
    });
  }

  private assertWithinRateLimit(session: ClientSession, message: ClientMessage): void {
    const cost = MESSAGE_RATE_COSTS[message.type];
    if (!session.rateLimit.consume(cost)) {
      throw new ProtocolError('rate_limited', 'Slow down before sending more playground messages.');
    }

    if (!session.userId) return;
    if (!this.getUserRateLimit(session.userId).consume(cost)) {
      throw new ProtocolError('rate_limited', 'Slow down before sending more playground messages.');
    }
  }

  private getUserRateLimit(userId: string): TokenBucket {
    const existing = this.userRateLimits.get(userId);
    if (existing) return existing;

    const bucket = new TokenBucket(USER_RATE_LIMIT);
    this.userRateLimits.set(userId, bucket);
    return bucket;
  }

  private assertWithinGenerationTokenRateLimit(session: ClientSession, now: number): void {
    if (!this.generationTokenRoomRateLimit.consume(1, now)) {
      throw new ProtocolError('rate_limited', 'Slow down before requesting more generated content.');
    }

    const existing = this.generationTokenUserRateLimits.get(session.userId);
    const bucket = existing || new TokenBucket(GENERATION_TOKEN_USER_RATE_LIMIT, now);
    if (!existing) this.generationTokenUserRateLimits.set(session.userId, bucket);
    if (!bucket.consume(1, now)) {
      throw new ProtocolError('rate_limited', 'Slow down before requesting more generated content.');
    }
  }

  private createSnapshot(forUserId = ''): LobbySnapshot {
    this.pruneExpiredInvites();
    return {
      games: [...this.games.values()]
        .filter((game) => Boolean(forUserId) && getGameModuleForRecord(game).canUserAccessGame(game, forUserId))
        .map((game) => getGameModuleForRecord(game).toPublicGame(game, (userId) => this.getPublicUser(userId))),
      invites: [...this.invites.values()]
        .filter((invite) => invite.status === 'pending')
        .filter((invite) => Boolean(forUserId) && (invite.fromUserId === forUserId || invite.toUserId === forUserId))
        .map((invite) => this.toPublicInvite(invite)),
      users: this.getPresenceUsers()
    };
  }

  private async loadStoredRoomState(): Promise<void> {
    let stored: unknown;
    try {
      stored = await this.state.storage.get<StoredRoomState>(ROOM_STATE_STORAGE_KEY);
    } catch {
      this.logEvent('room_state_restore_failed', {}, 'warn');
      return;
    }

    if (!isStoredRoomState(stored)) return;

    stored.games.forEach((game) => {
      if (!isSupportedStoredGame(game)) {
        this.logEvent('stored_game_ignored', {
          game: isRecord(game) && typeof game.gameId === 'string' ? shortLogId(game.gameId) : undefined
        }, 'warn');
        return;
      }

      this.games.set(game.gameId, game);
    });

    if (this.games.size > 0) {
      this.logEvent('room_state_restored', {
        gameCount: this.games.size
      });
    }
  }

  private queueStoredRoomStateWrite(): void {
    const write = this.storageWriteQueue
      .then(() => this.writeStoredRoomState())
      .catch(() => {
        this.logEvent('room_state_persist_failed', {}, 'warn');
      });
    this.storageWriteQueue = write.catch(() => undefined);
    this.state.waitUntil(write);
  }

  private async writeStoredRoomState(): Promise<void> {
    await this.state.storage.put(ROOM_STATE_STORAGE_KEY, {
      games: [...this.games.values()]
    } satisfies StoredRoomState);
  }

  private broadcastPresence(): void {
    this.clients.forEach((client) => {
      if (!client.userId) return;
      sendMessage(client.socket, {
        snapshot: this.createSnapshot(client.userId),
        type: 'presenceSnapshot'
      });
    });
  }

  private broadcastGame(game: GameRecord): void {
    const gameModule = getGameModuleForRecord(game);
    const publicGame = gameModule.toPublicGame(game, (userId) => this.getPublicUser(userId));
    gameModule.getRecipientUserIds(game).forEach((userId) => {
      this.sendToUser(userId, { game: publicGame, type: 'gameUpdated' });
    });
  }

  private sendToUser(userId: string, message: ServerMessage): void {
    this.clients.forEach((client) => {
      if (client.userId === userId) sendMessage(client.socket, message);
    });
  }

  private removeClient(connectionId: string, reason = 'unknown'): void {
    const session = this.clients.get(connectionId);
    const removed = this.clients.delete(connectionId);
    if (!removed) {
      this.logEvent('websocket_disconnected', {
        authenticated: false,
        connection: shortLogId(connectionId),
        reason
      });
      return;
    }

    this.logEvent('websocket_disconnected', {
      authenticated: Boolean(session?.userId),
      connection: shortLogId(connectionId),
      reason,
      user: session?.userId ? hashLogValue(session.userId) : undefined
    });

    if (session?.userId && !this.hasConnectedUser(session.userId)) {
      this.userAvailableGames.delete(session.userId);
    }
    this.broadcastPresence();
  }

  private getPendingInvite(inviteId: string): PendingInvite {
    this.pruneExpiredInvites();
    const invite = this.invites.get(inviteId);
    if (!invite || invite.status !== 'pending') {
      throw new ProtocolError('invite_not_found', 'Invite not found.');
    }
    return invite;
  }

  private pruneExpiredInvites(): void {
    const now = Date.now();
    this.invites.forEach((invite, inviteId) => {
      if (invite.expiresAt <= now) this.invites.delete(inviteId);
    });
  }

  private pruneExpiredGenerationTokens(now = Date.now()): void {
    this.generationTokens.forEach((token, value) => {
      if (token.expiresAt <= now) this.generationTokens.delete(value);
    });
  }

  private getPresenceUsers(): PresenceUser[] {
    const users = new Map<string, PresenceUser>();

    this.clients.forEach((client) => {
      if (!client.userId) return;
      const existing = users.get(client.userId);
      users.set(client.userId, {
        availableGames: this.userAvailableGames.get(client.userId) || [...client.availableGames],
        displayName: client.displayName || existing?.displayName || 'Player',
        joinedAt: Math.min(existing?.joinedAt || client.joinedAt, client.joinedAt),
        userId: client.userId
      });
    });

    return [...users.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  private hasConnectedUser(userId: string): boolean {
    return [...this.clients.values()].some((client) => client.userId === userId);
  }

  private getUserPresence(userId: string): PresenceUser | undefined {
    return this.getPresenceUsers().find((user) => user.userId === userId);
  }

  private getPublicUser(userId: string): PublicUserIdentity {
    const presence = this.getUserPresence(userId);
    return {
      displayName: presence?.displayName || getPlayerDisplayName(userId),
      userId
    };
  }

  private toPublicInvite(invite: PendingInvite): PublicInvite {
    return {
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      fromUser: this.getPublicUser(invite.fromUserId),
      gameId: invite.gameId,
      inviteId: invite.inviteId,
      status: invite.status,
      toUser: this.getPublicUser(invite.toUserId)
    };
  }

  private logProtocolError(session: ClientSession, error: ProtocolError): void {
    const event = getProtocolLogEvent(error.code);
    this.logEvent(event, {
      code: error.code,
      connection: shortLogId(session.connectionId),
      message: truncateLogMessage(error.message),
      user: session.userId ? hashLogValue(session.userId) : undefined
    }, error.code === 'internal_error' ? 'error' : 'warn');
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

function sendMessage(socket: ServerWebSocket, message: ServerMessage): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    socket.close();
  }
}

function normalizeError(error: unknown): ProtocolError {
  if (error instanceof ProtocolError) return error;
  return new ProtocolError('internal_error', 'Something went wrong.');
}

function truncateLogMessage(message: string): string {
  if (message.length <= 180) return message;
  return `${message.slice(0, 177)}...`;
}

function getProtocolLogEvent(code: string): string {
  switch (code) {
    case 'rate_limited':
      return 'rate_limit_rejected';
    case 'protocol_version':
      return 'protocol_version_mismatch';
    case 'identity_required':
    case 'invalid_public_key':
    case 'invalid_signature':
      return 'auth_failed';
    case 'message_too_large':
      return 'message_too_large';
    case 'internal_error':
      return 'internal_error';
    default:
      return 'protocol_error';
  }
}

function createId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function getPlayerDisplayName(userId: string): string {
  const code = userId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase();
  return `Player ${code || '0000'}`;
}

function isTerminalGameStatus(status: string): boolean {
  return status === 'checkmate' ||
    status === 'draw' ||
    status === 'finished' ||
    status === 'resigned';
}

function isStoredRoomState(value: unknown): value is StoredRoomState {
  return isRecord(value) && Array.isArray(value.games);
}

function isSupportedStoredGame(value: unknown): value is GameRecord {
  if (!isRecord(value)) return false;
  if (typeof value.gameId !== 'string' || typeof value.gameType !== 'string' || typeof value.status !== 'string') {
    return false;
  }

  try {
    getGameModuleForRecord(value as unknown as GameRecord);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
