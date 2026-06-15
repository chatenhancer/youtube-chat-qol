/**
 * Room adapter for built-in bot clients.
 *
 * Bot behavior lives in individual bot classes. This adapter attaches those
 * bots to a stream room by giving them normal client-shaped sessions and
 * routing their outbound messages through the room's existing message handler.
 */
import {
  type ChessBotFallback,
  COMPUTER_PLAYER_CONNECTION_ID,
  createComputerPlayer
} from './computer-player';
import type { GameRecord } from '../games/types';
import { getLogErrorType, hashLogValue, shortLogId } from '../logging';
import type { ClientMessage, GameId, LobbySnapshot, ServerMessage } from '../protocol/messages';
import { ProtocolError } from '../protocol/validation';
import { TokenBucket, type TokenBucketOptions } from '../rate-limit';
import type { ServerWebSocket } from '../types';

type LogDetails = Record<string, boolean | number | string | undefined>;
const MAX_LOG_MESSAGE_LENGTH = 180;

export interface BotClientSession {
  availableGames: readonly GameId[];
  connectionId: string;
  displayName: string;
  socket: ServerWebSocket;
  userId: string;
}

interface BotClientsHost {
  getGame(gameId: string): GameRecord | undefined;
  onActionError?(connectionId: string, gameId: string, error: unknown): void;
  onChessBotFallback?(connectionId: string, gameId: string, fallback: ChessBotFallback): void;
  sendClientMessage(connectionId: string, message: Exclude<ClientMessage, { type: 'hello' }>): void;
  waitUntil(promise: Promise<unknown>): void;
}

interface BotClients {
  getSessions(): BotClientSession[];
}

export interface ConnectedBotClientSession {
  availableGames: Set<GameId>;
  challenge: string;
  connectionId: string;
  displayName: string;
  joinedAt: number;
  rateLimit: TokenBucket;
  socket: ServerWebSocket;
  userId: string;
}

export interface AttachBotClientsToRoomOptions extends Omit<BotClientsHost, 'onActionError' | 'sendClientMessage'> {
  clients: Map<string, ConnectedBotClientSession>;
  connectionRateLimitOptions: TokenBucketOptions;
  createSnapshot(userId: string): LobbySnapshot;
  handleMessage(session: ConnectedBotClientSession, message: string): Promise<void>;
  logEvent(event: string, details?: LogDetails, level?: 'error' | 'info' | 'warn'): void;
  setAvailableGames(userId: string, availableGames: GameId[]): void;
}

export function attachBotClientsToRoom(options: AttachBotClientsToRoomOptions): void {
  const botClients = createBotClients({
    getGame: options.getGame,
    onActionError: (connectionId, gameId, error) => {
      const session = options.clients.get(connectionId);
      logBotClientActionFailure(options, session, connectionId, gameId, error);
    },
    onChessBotFallback: (connectionId, gameId, fallback) => {
      const session = options.clients.get(connectionId);
      logChessBotFallback(options, session, connectionId, gameId, fallback);
    },
    sendClientMessage: (connectionId, message) => {
      const session = options.clients.get(connectionId);
      if (!session) return;

      options.waitUntil(options.handleMessage(session, JSON.stringify(message)));
    },
    waitUntil: options.waitUntil
  });
  botClients.getSessions().forEach((botSession) => {
    if (options.clients.has(botSession.connectionId)) return;

    const availableGames = [...botSession.availableGames];
    options.clients.set(botSession.connectionId, {
      availableGames: new Set(availableGames),
      challenge: '',
      connectionId: botSession.connectionId,
      displayName: botSession.displayName,
      joinedAt: Date.now(),
      rateLimit: new TokenBucket(options.connectionRateLimitOptions),
      socket: botSession.socket,
      userId: botSession.userId
    });
    options.setAvailableGames(botSession.userId, availableGames);
    sendMessage(botSession.socket, {
      snapshot: options.createSnapshot(botSession.userId),
      type: 'helloAccepted',
      userId: botSession.userId
    });
  });
}

function logBotClientActionFailure(
  options: AttachBotClientsToRoomOptions,
  session: ConnectedBotClientSession | undefined,
  connectionId: string,
  gameId: string,
  error: unknown
): void {
  const game = options.getGame(gameId);
  const protocolError = normalizeError(error);
  options.logEvent('bot_client_action_failed', {
    code: protocolError.code,
    connection: shortLogId(connectionId),
    game: gameId ? shortLogId(gameId) : undefined,
    gameType: game?.gameType,
    user: session?.userId ? hashLogValue(session.userId) : undefined
  }, 'warn');
}

function logChessBotFallback(
  options: AttachBotClientsToRoomOptions,
  session: ConnectedBotClientSession | undefined,
  connectionId: string,
  gameId: string,
  fallback: ChessBotFallback
): void {
  const game = options.getGame(gameId);
  options.logEvent('chess_bot_stockfish_fallback', {
    connection: shortLogId(connectionId),
    errorMessage: getFallbackErrorMessage(fallback.error),
    errorType: fallback.error === undefined ? undefined : getLogErrorType(fallback.error),
    game: gameId ? shortLogId(gameId) : undefined,
    gameType: game?.gameType,
    reason: fallback.reason,
    user: session?.userId ? hashLogValue(session.userId) : undefined
  }, 'warn');
}

function getFallbackErrorMessage(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (message.length <= MAX_LOG_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_LOG_MESSAGE_LENGTH - 3)}...`;
}

function createBotClients(host: BotClientsHost): BotClients {
  return new BuiltInBotClients(host);
}

class BuiltInBotClients implements BotClients {
  private readonly sessions: BotClientSession[];

  constructor(host: BotClientsHost) {
    this.sessions = [
      createComputerPlayer({
        getGame: host.getGame,
        onActionError: (gameId, error) => host.onActionError?.(COMPUTER_PLAYER_CONNECTION_ID, gameId, error),
        onChessBotFallback: (gameId, fallback) => {
          host.onChessBotFallback?.(COMPUTER_PLAYER_CONNECTION_ID, gameId, fallback);
        },
        sendClientMessage: (message) => host.sendClientMessage(COMPUTER_PLAYER_CONNECTION_ID, message),
        waitUntil: host.waitUntil
      })
    ];
  }

  getSessions(): BotClientSession[] {
    return this.sessions;
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
