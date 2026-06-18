const DEFAULT_PLAYGROUND_BACKEND_ORIGIN = 'https://playground.chatenhancer.com';
const configuredPlaygroundBackendOrigin = (globalThis as { YTCQ_PLAYGROUND_BACKEND_ORIGIN?: string })
  .YTCQ_PLAYGROUND_BACKEND_ORIGIN;

export const PLAYGROUND_BACKEND_ORIGIN =
  normalizePlaygroundBackendOrigin(configuredPlaygroundBackendOrigin) || DEFAULT_PLAYGROUND_BACKEND_ORIGIN;
export const PLAYGROUND_PORT_NAME = 'ytcq:playground';
export const PLAYGROUND_PROTOCOL_VERSION = 1;
export const SUPPORTED_GAMES = ['chess', 'replay-trivia'] as const;

export function isPlaygroundComputerUserId(userId: string): boolean {
  return userId === 'server:computer' || userId.startsWith('server:computer:');
}

export type GameId = typeof SUPPORTED_GAMES[number];
export type GameEndReason = 'playerLeft';
export type InviteStatus = 'accepted' | 'ignored' | 'pending';

export interface PublicUserIdentity {
  displayName: string;
  userId: string;
}

export interface PlaygroundUserLanguage {
  languageCode: string;
  locale?: string;
}

export interface PresenceUser extends PublicUserIdentity {
  availableGames: GameId[];
  joinedAt: number;
}

export interface LobbySnapshot {
  games: PublicGame[];
  invites: PublicInvite[];
  users: PresenceUser[];
}

export interface PublicInvite {
  createdAt: number;
  expiresAt: number;
  fromUser: PublicUserIdentity;
  gameId: GameId;
  inviteId: string;
  status: InviteStatus;
  toUser: PublicUserIdentity;
}

export interface PublicGame {
  gameId: string;
  gameType: GameId;
  players?: Partial<Record<string, PublicUserIdentity>>;
  status: string;
}

export type ClientMessage =
  | HelloClientMessage
  | SetAvailabilityClientMessage
  | InviteClientMessage
  | RespondInviteClientMessage
  | GameActionClientMessage
  | PingClientMessage;

export interface HelloClientMessage {
  availableGames?: GameId[];
  identity: SignedClientIdentity;
  languageCode?: string;
  locale?: string;
  protocolVersion: typeof PLAYGROUND_PROTOCOL_VERSION;
  type: 'hello';
}

export interface SignedClientIdentity {
  publicKeyJwk: JsonWebKey;
  signature: string;
}

export interface SetAvailabilityClientMessage {
  availableGames: GameId[];
  type: 'setAvailability';
}

export interface InviteClientMessage {
  gameId: GameId;
  toUserId: string;
  type: 'invite';
}

export interface RespondInviteClientMessage {
  accept: boolean;
  inviteId: string;
  type: 'respondInvite';
}

export interface GameActionClientMessage {
  action: string;
  gameId: string;
  payload?: Record<string, unknown>;
  type: 'gameAction';
}

export interface PingClientMessage {
  id?: string;
  type: 'ping';
}

export type ServerMessage =
  | ChallengeServerMessage
  | HelloAcceptedServerMessage
  | PresenceSnapshotServerMessage
  | InviteCreatedServerMessage
  | InviteReceivedServerMessage
  | InviteUpdatedServerMessage
  | GameStartedServerMessage
  | GameUpdatedServerMessage
  | GameEndedServerMessage
  | ReplayTriviaGenerationTokenServerMessage
  | ErrorServerMessage
  | PongServerMessage;

export interface ChallengeServerMessage {
  challenge: string;
  issuedAt: number;
  protocolVersion: typeof PLAYGROUND_PROTOCOL_VERSION;
  type: 'challenge';
}

export interface HelloAcceptedServerMessage {
  snapshot: LobbySnapshot;
  type: 'helloAccepted';
  userId: string;
}

export interface PresenceSnapshotServerMessage {
  snapshot: LobbySnapshot;
  type: 'presenceSnapshot';
}

export interface InviteCreatedServerMessage {
  invite: PublicInvite;
  type: 'inviteCreated';
}

export interface InviteReceivedServerMessage {
  invite: PublicInvite;
  type: 'inviteReceived';
}

export interface InviteUpdatedServerMessage {
  invite: PublicInvite;
  type: 'inviteUpdated';
}

export interface GameStartedServerMessage {
  game: PublicGame;
  type: 'gameStarted';
}

export interface GameUpdatedServerMessage {
  game: PublicGame;
  type: 'gameUpdated';
}

export interface GameEndedServerMessage {
  gameId: string;
  reason: GameEndReason;
  userId: string;
  type: 'gameEnded';
}

export interface ReplayTriviaGenerationTokenServerMessage {
  expiresAt: number;
  gameId: string;
  generationToken: string;
  type: 'replayTriviaGenerationToken';
}

export interface ErrorServerMessage {
  code: string;
  message: string;
  type: 'error';
}

export interface PongServerMessage {
  id?: string;
  type: 'pong';
}

export type PlaygroundContentMessage =
  | PlaygroundInitMessage
  | PlaygroundSetAvailabilityMessage
  | PlaygroundInviteMessage
  | PlaygroundRespondInviteMessage
  | PlaygroundGameActionMessage
  | PlaygroundDisconnectMessage;

export interface PlaygroundInitMessage {
  availableGames: GameId[];
  languageCode?: string;
  locale?: string;
  streamKey: string;
  type: 'ytcq:playground:init';
}

export interface PlaygroundSetAvailabilityMessage {
  availableGames: GameId[];
  type: 'ytcq:playground:set-availability';
}

export interface PlaygroundInviteMessage {
  gameId: GameId;
  toUserId: string;
  type: 'ytcq:playground:invite';
}

export interface PlaygroundRespondInviteMessage {
  accept: boolean;
  inviteId: string;
  type: 'ytcq:playground:respond-invite';
}

export interface PlaygroundGameActionMessage {
  action: string;
  gameId: string;
  payload?: Record<string, unknown>;
  type: 'ytcq:playground:game-action';
}

export interface PlaygroundDisconnectMessage {
  type: 'ytcq:playground:disconnect';
}

export type PlaygroundBackgroundMessage =
  | PlaygroundStatusMessage
  | PlaygroundSnapshotMessage
  | PlaygroundServerEventMessage
  | PlaygroundBackgroundErrorMessage;

export interface PlaygroundStatusMessage {
  error?: string;
  status: 'connected' | 'connecting' | 'disconnected';
  type: 'ytcq:playground:status';
}

export interface PlaygroundSnapshotMessage {
  snapshot: LobbySnapshot;
  type: 'ytcq:playground:snapshot';
  userId: string;
}

export interface PlaygroundServerEventMessage {
  message: ServerMessage;
  type: 'ytcq:playground:server-message';
}

export interface PlaygroundBackgroundErrorMessage {
  code: string;
  message: string;
  type: 'ytcq:playground:error';
}

function normalizePlaygroundBackendOrigin(value: unknown): string {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}
