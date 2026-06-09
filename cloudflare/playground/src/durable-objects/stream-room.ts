import { getGameModule, getGameModuleForRecord } from '../games/registry';
import type { GameRecord } from '../games/types';
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
import { parseClientMessage, ProtocolError, sanitizeAvatarUrl, sanitizeDisplayName, sanitizeStreamKey } from '../protocol/validation';
import { TokenBucket, type TokenBucketOptions } from '../rate-limit';
import type { DurableObjectState, Env, ServerWebSocket } from '../types';

const INVITE_TTL_MS = 2 * 60 * 1000;
const MAX_MESSAGE_BYTES = 8_192;
const CLOSE_POLICY_VIOLATION = 1008;
const CONNECTION_RATE_LIMIT: TokenBucketOptions = {
  capacity: 30,
  refillPerSecond: 10
};
const USER_RATE_LIMIT: TokenBucketOptions = {
  capacity: 45,
  refillPerSecond: 10
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
  avatarUrl?: string;
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

export class StreamRoom {
  private readonly clients = new Map<string, ClientSession>();
  private readonly invites = new Map<string, PendingInvite>();
  private readonly games = new Map<string, GameRecord>();
  private readonly userAvailableGames = new Map<string, GameId[]>();
  private readonly userRateLimits = new Map<string, TokenBucket>();
  private streamKey = '';

  constructor(_state: DurableObjectState, _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const streamKey = request.headers.get('X-Chat-Enhancer-Stream-Key') || url.searchParams.get('streamKey') || '';
    this.streamKey = sanitizeStreamKey(streamKey);

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
    session.displayName = sanitizeDisplayName(message.profile?.displayName);
    session.avatarUrl = sanitizeAvatarUrl(message.profile?.avatarUrl);
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

    const nextGame = getGameModuleForRecord(game).applyAction(game, action);
    this.games.set(gameId, nextGame);
    if (game.status !== nextGame.status && nextGame.status !== 'active') {
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

  private getPresenceUsers(): PresenceUser[] {
    const users = new Map<string, PresenceUser>();

    this.clients.forEach((client) => {
      if (!client.userId) return;
      const existing = users.get(client.userId);
      users.set(client.userId, {
        availableGames: this.userAvailableGames.get(client.userId) || [...client.availableGames],
        avatarUrl: client.avatarUrl || existing?.avatarUrl,
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
      avatarUrl: presence?.avatarUrl,
      displayName: presence?.displayName || 'Player',
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
