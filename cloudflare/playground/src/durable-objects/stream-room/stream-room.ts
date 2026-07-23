/**
 * Stream-scoped realtime room.
 *
 * One Durable Object instance owns the Playground lobby for one YouTube stream:
 * WebSocket sessions, presence, invites, and active realtime game records.
 * Game-specific rules are delegated through `games/registry.ts`.
 */
import { getGameModule, getGameModuleForRecord } from '../../games/registry';
import type { GameActionInput, GameRecord } from '../../games/types';
import { createErrorResponse, createJsonResponse } from '../../http';
import { getLogErrorMessage, getLogErrorType, hashLogValue, logPlaygroundEvent, shortLogId } from '../../logging';
import {
  createChallenge,
  verifySignedIdentity
} from '../../protocol/identity';
import {
  PLAYGROUND_GAME_VERSIONS,
  PLAYGROUND_PROTOCOL_VERSION,
  isPlaygroundGameVersionCompatible,
  type ClientMessage,
  type GameId,
  type LobbySnapshot,
  type PlaygroundFailedRequest,
  type ServerMessage,
  isPlaygroundComputerUserId
} from '../../protocol/messages';
import { parseClientMessage, ProtocolError, sanitizeStreamKey } from '../../protocol/validation';
import { TokenBucket, type TokenBucketOptions } from '../../rate-limit';
import { attachComputerPlayerToRoom } from '../../features/computer-player/room-adapter';
import { recordPlayerMatch } from '../player-stats/client';
import type {
  PlayerMatchResultInput,
  RecordPlayerMatchResult
} from '../player-stats/types';
import { GameState } from './game-state';
import { GenerationTokens } from './generation-token';
import { InviteManager } from './invite-manager';
import { MatchResultOutbox } from './match-result-outbox';
import { type ClientSession, sendMessage, SessionManager } from './session-manager';
import type { Env } from '../../types';

const INVITE_TTL_MS = 2 * 60 * 1000;
const GENERATION_TOKEN_CONSUME_PATH = '/internal/games/generation-token/consume';
const MAX_MESSAGE_BYTES = 32_768;
const CLOSE_POLICY_VIOLATION = 1008;
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
  cancelInvite: 4,
  gameAction: 3,
  hello: 5,
  invite: 12,
  ping: 1,
  respondInvite: 4,
  setAvailability: 2,
  setDisplayName: 3
};

export class StreamRoom {
  private readonly gameState: GameState;
  private readonly generationTokens = new GenerationTokens(
    GENERATION_TOKEN_ROOM_RATE_LIMIT,
    GENERATION_TOKEN_USER_RATE_LIMIT
  );
  private readonly invites = new InviteManager();
  private readonly matchResultOutbox: MatchResultOutbox;
  private readonly sessions = new SessionManager();
  private readonly userRateLimits = new Map<string, TokenBucket>();
  private streamKey = '';

  constructor(private readonly state: DurableObjectState, private readonly env: Env) {
    this.gameState = new GameState(this.state, (event, details, level) => this.logEvent(event, details, level));
    this.matchResultOutbox = new MatchResultOutbox(this.state, {
      deliver: (match) => recordPlayerMatch(this.env, match),
      onDelivered: (match, result) => this.logRecordedMatchResult(match, result),
      onDeliveryFailed: (match, error, retry) => {
        this.logEvent('game_result_record_failed', {
          attempt: retry.attempt,
          errorMessage: getLogErrorMessage(error),
          errorType: getLogErrorType(error),
          game: shortLogId(match.matchId),
          gameType: match.gameType,
          retryAt: retry.nextAttemptAt
        }, 'warn');
      },
      onInvalidRecord: (key) => {
        this.logEvent('game_result_outbox_invalid', {
          record: shortLogId(key)
        }, 'warn');
      }
    });
    attachComputerPlayerToRoom({
      connectionRateLimitOptions: CONNECTION_RATE_LIMIT,
      createSnapshot: (userId) => this.createSnapshot(userId),
      env: this.env,
      getGame: (gameId) => this.gameState.get(gameId),
      handleMessage: (session, message) => this.handleSocketMessage(session, message),
      logEvent: (event, details, level) => this.logEvent(event, details, level),
      sessions: this.sessions,
      waitUntil: (promise) => this.state.waitUntil(promise)
    });

    this.state.blockConcurrencyWhile(async () => {
      await this.gameState.load();
      await this.restoreStoredMatchResults();
      await this.matchResultOutbox.resume();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const streamKey = request.headers.get('X-Chat-Enhancer-Stream-Key') || url.searchParams.get('streamKey') || '';
    this.streamKey = sanitizeStreamKey(streamKey);

    if (url.pathname.endsWith(GENERATION_TOKEN_CONSUME_PATH)) {
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

  async alarm(): Promise<void> {
    await this.matchResultOutbox.alarm();
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
      gameVersions: {},
      joinedAt: Date.now(),
      languageCode: 'en',
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
      gameVersions: { ...PLAYGROUND_GAME_VERSIONS },
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
    let request: PlaygroundFailedRequest | undefined;
    try {
      if (typeof data !== 'string') throw new ProtocolError('invalid_message', 'Messages must be strings.');
      if (data.length > MAX_MESSAGE_BYTES) throw new ProtocolError('message_too_large', 'Message is too large.');

      const message = parseClientMessage(data);
      if (message.type !== 'hello') request = message;
      this.assertWithinRateLimit(session, message);
      if (message.type !== 'hello' && !session.userId) {
        throw new ProtocolError('hello_required', 'Send hello before other messages.');
      }

      await this.handleClientMessage(session, message);
    } catch (error) {
      const protocolError = normalizeError(error);
      this.logProtocolError(session, protocolError, error);
      if (session.socket) sendMessage(session.socket, {
        code: protocolError.code,
        message: protocolError.message,
        ...(request ? { request } : {}),
        type: 'error'
      });
      if (protocolError.code === 'hello_required' || protocolError.code === 'invalid_signature') {
        session.socket?.close(CLOSE_POLICY_VIOLATION, protocolError.message);
      }
    }
  }

  private async handleClientMessage(session: ClientSession, message: ClientMessage): Promise<void> {
    switch (message.type) {
      case 'hello':
        await this.handleHello(session, message);
        return;
      case 'setAvailability':
        this.sessions.setAvailability(session, message.availableGames);
        this.logEvent('availability_changed', {
          availableGameCount: session.availableGames.size,
          connection: shortLogId(session.connectionId),
          user: hashLogValue(session.userId)
        });
        this.broadcastPresence();
        return;
      case 'setDisplayName':
        this.sessions.setDisplayName(session, message.displayName);
        this.logEvent('display_name_changed', {
          connection: shortLogId(session.connectionId),
          user: hashLogValue(session.userId)
        });
        this.broadcastPresence();
        return;
      case 'invite':
        this.handleInvite(session, message.gameId, message.toUserId);
        return;
      case 'cancelInvite':
        this.handleCancelInvite(session, message.gameId, message.toUserId);
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
        if (session.socket) sendMessage(session.socket, { id: message.id, type: 'pong' });
        return;
    }
  }

  private async handleHello(session: ClientSession, message: Extract<ClientMessage, { type: 'hello' }>): Promise<void> {
    if (session.userId) throw new ProtocolError('already_authenticated', 'This connection is already authenticated.');

    const identity = await verifySignedIdentity(session.challenge, message.identity);
    this.sessions.authenticate(session, identity.userId, message.availableGames || [], message.displayName, {
      languageCode: message.languageCode || 'en',
      locale: message.locale
    }, message.gameVersions ?? {});
    this.logEvent('client_authenticated', {
      availableGameCount: session.availableGames.size,
      connection: shortLogId(session.connectionId),
      user: hashLogValue(session.userId)
    });

    if (session.socket) sendMessage(session.socket, {
      snapshot: this.createSnapshot(session.userId),
      type: 'helloAccepted',
      userId: session.userId
    });
    this.broadcastPresence();
  }

  private handleInvite(session: ClientSession, gameId: GameId, toUserId: string): void {
    this.assertCompatibleGameVersion(session, gameId);
    if (session.userId === toUserId) throw new ProtocolError('self_invite', 'Choose another player.');

    const target = this.sessions.getPresenceUser(toUserId);
    if (!target) throw new ProtocolError('user_not_found', 'That player is not connected.');
    this.assertUserAvailableForGame(toUserId, gameId);
    this.assertNoActiveGameBetweenUsers(gameId, session.userId, toUserId);

    const now = Date.now();
    const invite = this.invites.createInvite({
      fromUserId: session.userId,
      gameId,
      inviteId: createId('inv'),
      now,
      toUserId,
      ttlMs: INVITE_TTL_MS
    });

    const publicInvite = this.invites.toPublicInvite(invite, (userId) => this.sessions.getPublicUser(userId));
    this.logEvent('invite_created', {
      fromUser: hashLogValue(invite.fromUserId),
      gameType: invite.gameId,
      invite: shortLogId(invite.inviteId),
      toUser: hashLogValue(invite.toUserId)
    });
    this.sendToUser(session.userId, { invite: publicInvite, type: 'inviteCreated' });
    this.sendToUser(toUserId, { invite: publicInvite, type: 'inviteReceived' });
  }

  private handleCancelInvite(session: ClientSession, gameId: GameId, toUserId: string): void {
    const invite = this.invites.getPendingInviteFromUser({
      fromUserId: session.userId,
      gameId,
      toUserId
    });
    if (!invite) return;

    this.invites.setInviteStatus(invite, 'cancelled');
    this.logEvent('invite_cancelled', {
      fromUser: hashLogValue(invite.fromUserId),
      gameType: invite.gameId,
      invite: shortLogId(invite.inviteId),
      toUser: hashLogValue(invite.toUserId)
    });
    const publicInvite = this.invites.toPublicInvite(invite, (publicUserId) => this.sessions.getPublicUser(publicUserId));
    this.sendToUser(invite.fromUserId, { invite: publicInvite, type: 'inviteUpdated' });
    this.sendToUser(invite.toUserId, { invite: publicInvite, type: 'inviteUpdated' });
  }

  private handleInviteResponse(session: ClientSession, inviteId: string, accept: boolean): void {
    const invite = this.invites.getPendingInvite(inviteId);
    if (invite.toUserId !== session.userId) {
      throw new ProtocolError('not_your_invite', 'That invite is not for you.');
    }
    if (accept) {
      this.assertCompatibleGameVersion(session, invite.gameId);
      this.assertUserConnectedForGame(invite.fromUserId, invite.gameId);
      this.assertNoActiveGameBetweenUsers(invite.gameId, invite.fromUserId, invite.toUserId);
    }

    this.invites.setInviteStatus(invite, accept ? 'accepted' : 'ignored');
    this.logEvent(accept ? 'invite_accepted' : 'invite_ignored', {
      fromUser: hashLogValue(invite.fromUserId),
      gameType: invite.gameId,
      invite: shortLogId(invite.inviteId),
      toUser: hashLogValue(invite.toUserId)
    });
    const publicInvite = this.invites.toPublicInvite(invite, (publicUserId) => this.sessions.getPublicUser(publicUserId));
    this.sendToUser(invite.fromUserId, { invite: publicInvite, type: 'inviteUpdated' });
    this.sendToUser(invite.toUserId, { invite: publicInvite, type: 'inviteUpdated' });

    if (!accept) return;

    const game = getGameModule(invite.gameId).createGame(createId('game'), [invite.fromUserId, invite.toUserId]);
    this.gameState.set(game);
    this.logEvent('game_started', {
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      playerCount: getGameModuleForRecord(game).getRecipientUserIds(game).length
    });
    this.sendGameToUser(game, invite.fromUserId, 'gameStarted');
    this.sendGameToUser(game, invite.toUserId, 'gameStarted');
  }

  private handleGameAction(
    session: ClientSession,
    gameId: string,
    action: GameActionInput
  ): void {
    const game = this.gameState.get(gameId);
    if (!game) throw new ProtocolError('game_not_found', 'Game not found.');
    const gameModule = getGameModuleForRecord(game);
    if (!gameModule.canUserAccessGame(game, session.userId)) {
      throw new ProtocolError('not_in_game', 'You are not a player in this game.');
    }
    if (action.action === 'leave') {
      this.handleLeaveGame(session.userId, game);
      return;
    }
    this.assertCompatibleGameVersion(session, game.gameType);
    if (action.action === 'requestGenerationToken') {
      this.handleGenerationTokenRequest(session, game);
      return;
    }

    this.applyGameAction(game, action);
  }

  private assertCompatibleGameVersion(session: ClientSession, gameId: GameId): void {
    if (!isPlaygroundGameVersionCompatible(gameId, session.gameVersions)) {
      throw new ProtocolError(
        'game_version',
        'Chat Enhancer and Playground versions do not match for this game.'
      );
    }
  }

  private assertUserAvailableForGame(userId: string, gameId: GameId): void {
    if (!this.sessions.isUserAvailableForGame(userId, gameId)) {
      throw new ProtocolError('user_unavailable', 'That player is not available for this game.');
    }
  }

  private assertUserConnectedForGame(userId: string, gameId: GameId): void {
    if (!this.sessions.hasCompatibleGameSession(userId, gameId)) {
      throw new ProtocolError('user_unavailable', 'That player is not available for this game.');
    }
  }

  private assertNoActiveGameBetweenUsers(gameId: GameId, userA: string, userB: string): void {
    const hasActiveGame = this.gameState.values().some((game) => {
      const gameModule = getGameModuleForRecord(game);
      if (game.gameType !== gameId || gameModule.isTerminal(game)) return false;
      const recipientUserIds = gameModule.getRecipientUserIds(game);
      return recipientUserIds.includes(userA) && recipientUserIds.includes(userB);
    });
    if (hasActiveGame) {
      throw new ProtocolError('game_already_active', 'You already have this game active with that player.');
    }
  }

  private applyGameAction(
    game: GameRecord,
    action: GameActionInput
  ): void {
    const gameModule = getGameModuleForRecord(game);
    const appliedGame = gameModule.applyAction(game, action);
    if (appliedGame === game) return;
    const transitionedToTerminal =
      game.status !== appliedGame.status &&
      getGameModuleForRecord(appliedGame).isTerminal(appliedGame);
    const nextGame: GameRecord = transitionedToTerminal
      ? {
          ...appliedGame,
          finishedAt: appliedGame.finishedAt ?? Date.now()
        }
      : appliedGame;
    const persistence = gameModule.getStatePersistence?.({
      action,
      nextGame,
      previousGame: game
    }) ?? 'immediate';
    this.gameState.set(nextGame, { persistence });
    if (transitionedToTerminal) {
      this.logEvent('game_ended', {
        game: shortLogId(nextGame.gameId),
        gameType: nextGame.gameType,
        reason: nextGame.status
      });
    }
    this.broadcastGame(nextGame);
    if (transitionedToTerminal) this.queueMatchResult(createPlayerMatchResult(nextGame));
  }

  private queueMatchResult(match: PlayerMatchResultInput): void {
    const write = this.matchResultOutbox.enqueue(match).catch((error: unknown) => {
      this.logEvent('game_result_queue_failed', {
        errorMessage: getLogErrorMessage(error),
        errorType: getLogErrorType(error),
        game: shortLogId(match.matchId),
        gameType: match.gameType
      }, 'warn');
    });
    this.state.waitUntil(write);
  }

  private async restoreStoredMatchResults(): Promise<void> {
    for (const game of this.gameState.values()) {
      if (!getGameModuleForRecord(game).isTerminal(game) || game.finishedAt === undefined) continue;
      await this.matchResultOutbox.enqueue(createPlayerMatchResult(game));
    }
  }

  private logRecordedMatchResult(
    match: PlayerMatchResultInput,
    result: RecordPlayerMatchResult
  ): void {
    if (!result.recorded) {
      this.logEvent('game_result_reconciled', {
        game: shortLogId(match.matchId),
        gameType: match.gameType
      });
      return;
    }

    const humanWinnerUserId = match.winnerUserId &&
      !isPlaygroundComputerUserId(match.winnerUserId)
      ? match.winnerUserId
      : '';
    if (!humanWinnerUserId) {
      this.logEvent('game_result_recorded', {
        game: shortLogId(match.matchId),
        gameType: match.gameType,
        reason: match.finishReason
      });
      return;
    }

    this.logEvent('game_win_recorded', {
      game: shortLogId(match.matchId),
      gameType: match.gameType,
      user: hashLogValue(humanWinnerUserId)
    });
  }

  private handleLeaveGame(userId: string, game: GameRecord): void {
    const gameModule = getGameModuleForRecord(game);
    this.gameState.delete(game.gameId);
    this.logEvent('game_ended', {
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      reason: 'playerLeft',
      user: hashLogValue(userId)
    });
    gameModule.getRecipientUserIds(game).forEach((recipientUserId) => {
      this.sendToUser(recipientUserId, {
        gameId: game.gameId,
        reason: 'playerLeft',
        type: 'gameEnded',
        userId
      });
    });
  }

  private handleGenerationTokenRequest(session: ClientSession, game: GameRecord): void {
    const gameModule = getGameModuleForRecord(game);
    if (!gameModule.createGenerationToken || !gameModule.createGenerationTokenMessage) {
      throw new ProtocolError('unsupported_action', 'This game does not support generated content.');
    }

    const now = Date.now();
    this.generationTokens.assertWithinRateLimit(session.userId, now);

    const grant = gameModule.createGenerationToken(game, {
      now,
      userId: session.userId
    });
    const generationToken = createId(grant.tokenPrefix || 'gen');
    this.generationTokens.create({
      expiresAt: grant.expiresAt,
      generationToken,
      gameId: game.gameId,
      now,
      userId: session.userId
    });

    this.logEvent('generation_token_created', {
      game: shortLogId(game.gameId),
      gameType: game.gameType,
      user: hashLogValue(session.userId)
    });
    if (session.socket) {
      sendMessage(session.socket, gameModule.createGenerationTokenMessage({
        expiresAt: grant.expiresAt,
        gameId: game.gameId,
        generationToken
      }));
    }
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
      return createErrorResponse('invalid_generation_token', 'Generation token is invalid.', 403);
    }

    const now = Date.now();
    const token = this.generationTokens.consume(gameId, generationToken, now);
    if (!token) {
      this.logEvent('generation_token_rejected', {
        game: gameId ? shortLogId(gameId) : undefined
      }, 'warn');
      return createErrorResponse('invalid_generation_token', 'Generation token is invalid or expired.', 403);
    }

    const game = this.gameState.get(token.gameId);
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
        errorMessage: getLogErrorMessage(error),
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
      targetLanguages: this.getGameTargetLanguages(game),
      userId: token.userId
    });
  }

  private assertWithinRateLimit(session: ClientSession, message: ClientMessage): void {
    const cost = this.getMessageRateCost(message);
    if (!session.rateLimit.consume(cost)) {
      throw new ProtocolError('rate_limited', 'Slow down before sending more playground messages.');
    }

    if (!session.userId) return;
    if (!this.getUserRateLimit(session.userId).consume(cost)) {
      throw new ProtocolError('rate_limited', 'Slow down before sending more playground messages.');
    }
  }

  private getMessageRateCost(message: ClientMessage): number {
    if (message.type === 'gameAction') {
      const game = this.gameState.get(message.gameId);
      const gameActionCost = game
        ? getGameModuleForRecord(game).getActionRateCost?.({
            action: message.action,
            game,
            payload: message.payload
          })
        : undefined;
      if (typeof gameActionCost === 'number' && Number.isFinite(gameActionCost) && gameActionCost >= 0) {
        return gameActionCost;
      }
    }

    return MESSAGE_RATE_COSTS[message.type];
  }

  private getUserRateLimit(userId: string): TokenBucket {
    const existing = this.userRateLimits.get(userId);
    if (existing) return existing;

    const bucket = new TokenBucket(USER_RATE_LIMIT);
    this.userRateLimits.set(userId, bucket);
    return bucket;
  }

  private createSnapshot(forUserId = ''): LobbySnapshot {
    return {
      games: this.gameState.values()
        .filter((game) => Boolean(forUserId) && getGameModuleForRecord(game).canUserAccessGame(game, forUserId))
        .map((game) => getGameModuleForRecord(game).toPublicGame(game, (userId) => {
          return this.sessions.getPublicUser(userId);
        }, this.createPublicGameContext(forUserId))),
      invites: this.invites.getPublicInvites(forUserId, (userId) => this.sessions.getPublicUser(userId)),
      users: this.sessions.getPresenceUsers()
    };
  }

  private broadcastPresence(): void {
    this.sessions.broadcastPresence((userId) => this.createSnapshot(userId));
  }

  private broadcastGame(game: GameRecord): void {
    const gameModule = getGameModuleForRecord(game);
    gameModule.getRecipientUserIds(game).forEach((userId) => {
      this.sendGameToUser(game, userId, 'gameUpdated');
    });
  }

  private sendGameToUser(game: GameRecord, userId: string, type: 'gameStarted' | 'gameUpdated'): void {
    const publicGame = getGameModuleForRecord(game).toPublicGame(
      game,
      (publicUserId) => this.sessions.getPublicUser(publicUserId),
      this.createPublicGameContext(userId)
    );
    this.sendToUser(userId, { game: publicGame, type });
  }

  private createPublicGameContext(recipientUserId: string) {
    return {
      getUserLanguage: (userId: string) => this.sessions.getUserLanguage(userId),
      recipientUserId
    };
  }

  private getGameTargetLanguages(game: GameRecord) {
    const languages = new Map<string, { languageCode: string; locale?: string }>();
    getGameModuleForRecord(game).getRecipientUserIds(game).forEach((userId) => {
      const language = this.sessions.getUserLanguage(userId);
      languages.set(language.locale || language.languageCode, language);
    });
    return [...languages.values()];
  }

  private sendToUser(userId: string, message: ServerMessage): void {
    this.sessions.sendToUser(userId, message);
  }

  private removeClient(connectionId: string, reason = 'unknown'): void {
    const session = this.sessions.remove(connectionId);
    if (!session) {
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

    this.broadcastPresence();
  }

  private logProtocolError(session: ClientSession, error: ProtocolError, originalError: unknown): void {
    const event = getProtocolLogEvent(error.code);
    this.logEvent(event, {
      code: error.code,
      connection: shortLogId(session.connectionId),
      errorMessage: getLogErrorMessage(originalError),
      errorType: getLogErrorType(originalError),
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

function createPlayerMatchResult(game: GameRecord): PlayerMatchResultInput {
  const gameModule = getGameModuleForRecord(game);
  const finishedAt = game.finishedAt;
  if (finishedAt === undefined) {
    throw new Error('Cannot record a match without a finish timestamp.');
  }

  return {
    finishedAt,
    finishReason: game.status,
    gameType: game.gameType,
    gameVersion: game.gameVersion,
    matchId: game.gameId,
    participantUserIds: gameModule.getRecipientUserIds(game),
    startedAt: game.startedAt,
    winnerUserId: gameModule.getWinnerUserId?.(game) || null
  };
}

function createId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
