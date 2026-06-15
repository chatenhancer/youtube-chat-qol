/**
 * Stream-room adapter for the built-in computer player.
 *
 * The adapter owns the server-client session plumbing so `StreamRoom` only has
 * to attach the feature once.
 */
import type { GameRecord } from '../../games/types';
import type { LobbySnapshot, ClientMessage } from '../../protocol/messages';
import { TokenBucket, type TokenBucketOptions } from '../../rate-limit';
import {
  type ClientSession,
  sendMessage,
  SessionManager
} from '../../durable-objects/stream-room/session-manager';
import type { Env } from '../../types';
import { COMPUTER_PLAYER_PROFILES } from './actions';
import { createComputerPlayer } from './computer-player';

type LogDetails = Record<string, boolean | number | string | undefined>;

export interface AttachComputerPlayerToRoomOptions {
  connectionRateLimitOptions: TokenBucketOptions;
  createSnapshot(userId: string): LobbySnapshot;
  env: Env;
  getGame(gameId: string): GameRecord | undefined;
  handleMessage(session: ClientSession, message: string): Promise<void>;
  logEvent(event: string, details?: LogDetails, level?: 'error' | 'info' | 'warn'): void;
  sessions: SessionManager;
  waitUntil(promise: Promise<unknown>): void;
}

export function attachComputerPlayerToRoom(options: AttachComputerPlayerToRoomOptions): void {
  COMPUTER_PLAYER_PROFILES.forEach((profile) => {
    const computerPlayer = createComputerPlayer({
      env: options.env,
      getGame: options.getGame,
      logEvent: options.logEvent,
      sendClientMessage: (message) => sendComputerPlayerMessage(options, profile.connectionId, message),
      waitUntil: options.waitUntil
    }, profile);
    if (options.sessions.get(computerPlayer.connectionId)) return;

    const availableGames = [...computerPlayer.availableGames];
    const session: ClientSession = {
      availableGames: new Set(),
      challenge: '',
      connectionId: computerPlayer.connectionId,
      displayName: computerPlayer.displayName,
      joinedAt: Date.now(),
      rateLimit: new TokenBucket(options.connectionRateLimitOptions),
      socket: computerPlayer.socket,
      userId: ''
    };
    options.sessions.authenticate(session, computerPlayer.userId, availableGames, computerPlayer.displayName);
    sendMessage(computerPlayer.socket, {
      snapshot: options.createSnapshot(computerPlayer.userId),
      type: 'helloAccepted',
      userId: computerPlayer.userId
    });
  });
}

function sendComputerPlayerMessage(
  options: AttachComputerPlayerToRoomOptions,
  connectionId: string,
  message: Exclude<ClientMessage, { type: 'hello' }>
): void {
  const session = options.sessions.get(connectionId);
  if (!session) return;
  options.waitUntil(options.handleMessage(session, JSON.stringify(message)));
}
