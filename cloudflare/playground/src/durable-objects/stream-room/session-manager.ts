import { TokenBucket } from '../../rate-limit';
import type {
  GameId,
  LobbySnapshot,
  PresenceUser,
  PublicUserIdentity,
  ServerMessage
} from '../../protocol/messages';
import type { ServerWebSocket } from '../../types';

export interface ClientSession {
  availableGames: Set<GameId>;
  challenge: string;
  connectionId: string;
  displayName: string;
  joinedAt: number;
  rateLimit: TokenBucket;
  socket?: ServerWebSocket;
  trustedDisplayName?: string;
  userId: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, ClientSession>();
  private readonly userAvailableGames = new Map<string, GameId[]>();
  private readonly userDisplayNames = new Map<string, string>();

  authenticate(session: ClientSession, userId: string, availableGames: GameId[]): void {
    session.userId = userId;
    session.displayName = session.trustedDisplayName || this.userDisplayNames.get(userId) || getPlayerDisplayName(userId);
    session.availableGames = new Set(availableGames);
    session.joinedAt = Date.now();
    this.sessions.set(session.connectionId, session);
    this.userAvailableGames.set(userId, availableGames);
    this.userDisplayNames.set(userId, session.displayName);
  }

  get(connectionId: string): ClientSession | undefined {
    return this.sessions.get(connectionId);
  }

  getPresenceUser(userId: string): PresenceUser | undefined {
    return this.getPresenceUsers().find((user) => user.userId === userId);
  }

  getPresenceUsers(): PresenceUser[] {
    const users = new Map<string, PresenceUser>();

    this.sessions.forEach((session) => {
      if (!session.userId) return;
      const existing = users.get(session.userId);
      users.set(session.userId, {
        availableGames: this.userAvailableGames.get(session.userId) || [...session.availableGames],
        displayName: session.displayName || existing?.displayName || 'Player',
        joinedAt: Math.min(existing?.joinedAt || session.joinedAt, session.joinedAt),
        userId: session.userId
      });
    });

    return [...users.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  getPublicUser(userId: string): PublicUserIdentity {
    const presence = this.getPresenceUser(userId);
    return {
      displayName: presence?.displayName || this.userDisplayNames.get(userId) || getPlayerDisplayName(userId),
      userId
    };
  }

  hasConnectedUser(userId: string): boolean {
    return [...this.sessions.values()].some((session) => session.userId === userId);
  }

  remove(connectionId: string): ClientSession | undefined {
    const session = this.sessions.get(connectionId);
    if (!session) return undefined;

    this.sessions.delete(connectionId);
    if (session.userId && !this.hasConnectedUser(session.userId)) {
      this.userAvailableGames.delete(session.userId);
    }
    return session;
  }

  sendToUser(userId: string, message: ServerMessage): void {
    this.sessions.forEach((session) => {
      if (session.userId === userId && session.socket) sendMessage(session.socket, message);
    });
  }

  setAvailability(session: ClientSession, availableGames: GameId[]): void {
    session.availableGames = new Set(availableGames);
    this.userAvailableGames.set(session.userId, availableGames);
  }

  rememberUsers(users: PublicUserIdentity[]): void {
    users.forEach((user) => {
      if (!user.userId || !user.displayName) return;
      this.userDisplayNames.set(user.userId, user.displayName);
    });
  }

  broadcastPresence(createSnapshot: (userId: string) => LobbySnapshot): void {
    this.sessions.forEach((session) => {
      if (!session.userId || !session.socket) return;
      sendMessage(session.socket, {
        snapshot: createSnapshot(session.userId),
        type: 'presenceSnapshot'
      });
    });
  }
}

export function getPlayerDisplayName(userId: string): string {
  const code = userId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase();
  return `Player ${code || '0000'}`;
}

export function sendMessage(socket: ServerWebSocket, message: ServerMessage): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    socket.close();
  }
}
