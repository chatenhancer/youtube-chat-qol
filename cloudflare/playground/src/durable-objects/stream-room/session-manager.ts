import { TokenBucket } from '../../rate-limit';
import type {
  GameId,
  LobbySnapshot,
  PlaygroundUserLanguage,
  PresenceUser,
  PublicUserIdentity,
  ServerMessage
} from '../../protocol/messages';

const DEFAULT_USER_LANGUAGE: PlaygroundUserLanguage = { languageCode: 'en' };

export interface ClientSession {
  availableGames: Set<GameId>;
  challenge: string;
  connectionId: string;
  displayName: string;
  joinedAt: number;
  languageCode: string;
  locale?: string;
  rateLimit: TokenBucket;
  socket?: WebSocket;
  userId: string;
}

export class SessionManager {
  private readonly sessions = new Map<string, ClientSession>();
  private readonly userAvailableGames = new Map<string, GameId[]>();
  private readonly userDisplayNames = new Map<string, string>();
  private readonly userLanguages = new Map<string, PlaygroundUserLanguage>();

  authenticate(
    session: ClientSession,
    userId: string,
    availableGames: GameId[],
    displayName = getPlayerDisplayName(userId),
    language: PlaygroundUserLanguage = DEFAULT_USER_LANGUAGE
  ): void {
    const resolvedDisplayName = displayName || this.userDisplayNames.get(userId) || getPlayerDisplayName(userId);
    session.userId = userId;
    session.displayName = resolvedDisplayName;
    session.availableGames = new Set(availableGames);
    session.joinedAt = Date.now();
    session.languageCode = language.languageCode || DEFAULT_USER_LANGUAGE.languageCode;
    session.locale = language.locale;
    this.sessions.set(session.connectionId, session);
    this.userAvailableGames.set(userId, availableGames);
    this.userDisplayNames.set(userId, resolvedDisplayName);
    this.userLanguages.set(userId, {
      languageCode: session.languageCode,
      locale: session.locale
    });
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
        displayName: this.userDisplayNames.get(session.userId) || session.displayName || existing?.displayName || 'Player',
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

  getUserLanguage(userId: string): PlaygroundUserLanguage {
    return this.userLanguages.get(userId) || DEFAULT_USER_LANGUAGE;
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
      this.userLanguages.delete(session.userId);
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

  setDisplayName(session: ClientSession, displayName: string): void {
    if (!session.userId || !displayName) return;
    this.sessions.forEach((candidate) => {
      if (candidate.userId === session.userId) candidate.displayName = displayName;
    });
    this.userDisplayNames.set(session.userId, displayName);
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

export function sendMessage(socket: WebSocket, message: ServerMessage): void {
  try {
    socket.send(JSON.stringify(message));
  } catch {
    socket.close();
  }
}
