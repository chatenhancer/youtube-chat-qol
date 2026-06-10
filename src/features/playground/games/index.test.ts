import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../shared/options';
import type { LobbySnapshot, PlaygroundBackgroundMessage, PublicGame } from '../../../shared/playground-protocol';
import { setOptions } from '../../../shared/state';
import {
  cleanupStaleGamesButtons,
  refreshGamesButton,
  scheduleGamesButtonWire,
  wireGamesButton
} from './index';

describe('playground games header button', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/watch?v=stream-a');
    setOptions({ ...DEFAULT_OPTIONS });
    mockPorts.length = 0;
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupStaleGamesButtons();
    vi.useRealTimers();
    delete (chrome.runtime as Partial<typeof chrome.runtime>).connect;
  });

  it('does not insert the games button until the beta is enabled', async () => {
    document.body.append(createHeader());

    refreshGamesButton();
    await vi.runOnlyPendingTimersAsync();

    expect(document.querySelector('.ytcq-games-button')).toBeNull();

    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });
    refreshGamesButton();
    await vi.runOnlyPendingTimersAsync();

    expect(document.querySelector('.ytcq-games-button')).not.toBeNull();
  });

  it('places the games button to the left of Inbox when both header buttons exist', () => {
    const header = createHeader();
    const inbox = document.createElement('button');
    inbox.className = 'ytcq-inbox-button';
    header.prepend(inbox);
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();

    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    expect(button).not.toBeNull();
    expect(button.nextElementSibling).toBe(inbox);
    expect(inbox.nextElementSibling?.id).toBe('live-chat-header-context-menu');
    expect(button.dataset.ytcqManaged).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Games');
  });

  it('falls back to the native menu anchor when Inbox is absent', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();

    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    expect(button.nextElementSibling?.id).toBe('live-chat-header-context-menu');
  });

  it('reuses this content script button and replaces stale owner buttons', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();
    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    wireGamesButton();
    expect(header.querySelector('.ytcq-games-button')).toBe(button);

    button.dataset.ytcqGamesOwner = 'old-owner';
    wireGamesButton();
    expect(header.querySelector('.ytcq-games-button')).not.toBe(button);
  });

  it('toggles the games panel from the header button', () => {
    const header = createHeader();
    document.body.append(header);
    document.body.append(createCurrentUserInput({
      avatarUrl: 'https://yt3.example/current=s88-c-k',
      name: '@FirefoxViewer'
    }));
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: false });

    wireGamesButton();
    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    const stopPropagation = vi.spyOn(click, 'stopPropagation');

    button.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalled();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.ytcq-games-card')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card-icon svg')).not.toBeNull();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Games');
    expect(document.querySelector<HTMLElement>('.ytcq-games-beta-badge')?.hidden).toBe(false);
    expect(document.querySelector('.ytcq-games-beta-badge')?.textContent).toBe('Beta');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Connecting...');
    expect(document.querySelector('.ytcq-games-connection-notice')?.textContent).toContain('Connecting to Playground');
    expect(document.querySelector('.ytcq-games-connection-notice')?.textContent).toContain('Setting up the games lobby, please wait.');
    expect(document.querySelector('.ytcq-games-availability-toggle')).toBeNull();
    expect(lastMockPort()?.messages.at(-1)).toMatchObject({
      availableGames: [],
      profile: {
        avatarUrl: 'https://yt3.example/current=s88-c-k',
        displayName: '@FirefoxViewer'
      },
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });

    lastMockPort()?.emit(createSnapshotMessage({
      games: [],
      invites: [],
      users: [{ availableGames: [], displayName: 'Me', joinedAt: Date.now(), userId: 'me-user' }]
    }));

    expect(document.querySelector('.ytcq-games-connection-notice')).toBeNull();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Games');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('0 players online');
    expect(document.querySelector('.ytcq-games-availability-toggle')?.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('.ytcq-games-availability-toggle .ytcq-menu-toggle')).not.toBeNull();
    expect(getGamesSectionTitles()).toEqual(['Invites', 'Start a game']);
    expect(document.querySelector('.ytcq-games-section-empty')?.textContent).toBe('No invites received yet.');
    expect(getGameCards()).toHaveLength(1);
    expect(document.querySelector('.ytcq-games-preview-chess .ytcq-games-preview-canvas')).not.toBeNull();
    expect(getGameLabels()).toEqual(['Chess']);

    getGameCards()[0].click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Chess');
    expect(document.querySelector<HTMLElement>('.ytcq-games-beta-badge')?.hidden).toBe(true);
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Invite a player');
    expect(document.querySelector('.ytcq-games-section-empty')?.textContent).toBe('There are no players available.');
    expect(document.querySelector('.ytcq-games-player-row')).toBeNull();
    getActionButton('Back').click();

    button.click();

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
  });

  it('falls back to avatar labels for the current playground profile', () => {
    const header = createHeader();
    document.body.append(header);
    document.body.append(createCurrentUserInput({
      avatarLabel: 'Open @AvatarFallback channel',
      avatarUrl: 'https://yt3.example/avatar-fallback=s88-c-k'
    }));
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();

    expect(lastMockPort()?.messages.at(-1)).toMatchObject({
      profile: {
        avatarUrl: 'https://yt3.example/avatar-fallback=s88-c-k',
        displayName: '@AvatarFallback'
      },
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
  });

  it('renders server-backed invites, players, and active chess games inside the panel', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    expect(document.querySelector('.ytcq-games-availability-toggle')?.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('2 players online');
    expect(getActionButton('Accept')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('.ytcq-games-availability-toggle')!.click();
    expect(document.querySelector('.ytcq-games-availability-toggle')?.getAttribute('aria-checked')).toBe('false');
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      availableGames: [],
      type: 'ytcq:playground:set-availability'
    });

    getActionButton('Accept').click();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      accept: true,
      inviteId: 'invite-1',
      type: 'ytcq:playground:respond-invite'
    });
    lastMockPort()?.emit({
      message: {
        invite: {
          ...createLobbySnapshot().invites[0],
          status: 'accepted'
        },
        type: 'inviteUpdated'
      },
      type: 'ytcq:playground:server-message'
    });
    lastMockPort()?.emit({
      message: {
        game: createChessGame(),
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(gamesButton.getAttribute('aria-expanded')).toBe('false');
    const canvas = document.querySelector<HTMLCanvasElement>('.ytcq-chess-board-canvas');
    expect(canvas?.width).toBe(224);
    expect(canvas?.height).toBe(224);
    expect(canvas?.getAttribute('aria-label')).toBe('Chess');

    gamesButton.click();
    expect(getGamesSectionTitles()).toEqual(['Active game', 'Invites', 'Start a game']);
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Chess');
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Luna Chat');
    expect(document.querySelector('.ytcq-games-invite-row')).toBeNull();
    expect(document.querySelector('.ytcq-games-section-empty')?.textContent).toBe('No invites received yet.');
    expect(getActionButtonLabels()).toEqual(['Minimize', 'Leave']);

    getActionButton('Minimize').click();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(getActionButtonLabels()).toEqual(['Resume', 'Leave']);
    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    gamesButton.click();
    expect(getActionButtonLabels()).toEqual(['Minimize', 'Leave']);
    document.querySelector<HTMLButtonElement>('.ytcq-chess-game-close')!.click();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(getActionButtonLabels()).toEqual(['Resume', 'Leave']);
    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    gamesButton.click();
    getActionButton('Leave').click();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game-1',
      payload: undefined,
      type: 'ytcq:playground:game-action'
    });
    getGameCards()[0].click();

    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Chess');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Invite a player');
    expect(document.querySelectorAll('.ytcq-games-player-row')).toHaveLength(2);
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Luna Chat');

    getActionButton('Invite').click();
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Waiting for reply...');
    expect(getActionButton('Cancel')).not.toBeNull();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      gameId: 'chess',
      toUserId: 'luna-user',
      type: 'ytcq:playground:invite'
    });

    getActionButton('Back').click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Games');
    expect(document.querySelector<HTMLElement>('.ytcq-games-beta-badge')?.hidden).toBe(false);
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('2 players online');
  });

  it('removes ended games and tells the remaining player when the opponent leaves', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    lastMockPort()?.emit({
      message: {
        game: createChessGame(),
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();

    lastMockPort()?.emit({
      message: {
        gameId: 'game-1',
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'luna-user'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-chess-game-status')?.textContent).toBe('Opponent left the game.');

    gamesButton.click();
    expect(document.querySelector('.ytcq-games-active-row')).toBeNull();
  });

  it('shows a reconnect notice when the games backend is unavailable', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();
    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    button.click();

    lastMockPort()?.emit({
      error: 'Playground connection failed.',
      status: 'disconnected',
      type: 'ytcq:playground:status'
    });

    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Unavailable');
    expect(document.querySelector('.ytcq-games-connection-notice')?.textContent).toContain('Unable to connect');
    expect(document.querySelector('.ytcq-games-connection-notice')?.textContent).toContain('Playground connection failed. Please try again later.');
    expect(document.querySelector('.ytcq-games-availability-toggle')).toBeNull();
    expect(getActionButton('Reconnect').hidden).toBe(false);

    const messagesBeforeReconnect = lastMockPort()?.messages.length || 0;
    const reconnectButton = getActionButton('Reconnect');
    reconnectButton.click();
    expect(lastMockPort()?.messages.at(-1)).toMatchObject({
      availableGames: [],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Connecting...');
    reconnectButton.click();
    expect(lastMockPort()?.messages).toHaveLength(messagesBeforeReconnect + 1);
  });

  it('closes the games panel from the card close button and cleanup', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();
    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    button.click();

    document.querySelector<HTMLButtonElement>('.ytcq-profile-card-close')!.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.ytcq-games-card')).toBeNull();

    button.click();
    cleanupStaleGamesButtons();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
  });

  it('cancels pending wiring and removes buttons during cleanup', async () => {
    document.body.append(createHeader());
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    scheduleGamesButtonWire();
    cleanupStaleGamesButtons();
    await vi.runOnlyPendingTimersAsync();

    expect(document.querySelector('.ytcq-games-button')).toBeNull();
  });
});

interface MockPort {
  disconnect: () => void;
  emit: (message: PlaygroundBackgroundMessage) => void;
  messages: unknown[];
  name: string;
  onDisconnect: {
    addListener: (listener: () => void) => void;
    removeListener: (listener: () => void) => void;
  };
  onMessage: {
    addListener: (listener: (message: PlaygroundBackgroundMessage) => void) => void;
    removeListener: (listener: (message: PlaygroundBackgroundMessage) => void) => void;
  };
  postMessage: (message: unknown) => void;
}

const mockPorts: MockPort[] = [];

function createMockPort(): MockPort {
  const disconnectListeners = new Set<() => void>();
  const messageListeners = new Set<(message: PlaygroundBackgroundMessage) => void>();
  const port: MockPort = {
    disconnect: () => {
      disconnectListeners.forEach((listener) => listener());
    },
    emit: (message) => {
      messageListeners.forEach((listener) => listener(message));
    },
    messages: [],
    name: 'ytcq:playground',
    onDisconnect: {
      addListener: vi.fn((listener: () => void) => disconnectListeners.add(listener)),
      removeListener: vi.fn((listener: () => void) => disconnectListeners.delete(listener))
    },
    onMessage: {
      addListener: vi.fn((listener: (message: PlaygroundBackgroundMessage) => void) => messageListeners.add(listener)),
      removeListener: vi.fn((listener: (message: PlaygroundBackgroundMessage) => void) => messageListeners.delete(listener))
    },
    postMessage: vi.fn((message: unknown) => {
      port.messages.push(message);
    })
  };
  mockPorts.push(port);
  return port;
}

function lastMockPort(): MockPort | undefined {
  return mockPorts.at(-1);
}

function createHeader(): HTMLElement {
  const header = document.createElement('yt-live-chat-header-renderer');
  const menu = document.createElement('div');
  menu.id = 'live-chat-header-context-menu';
  header.append(menu);
  return header;
}

function createCurrentUserInput({
  avatarLabel = '',
  avatarUrl,
  name = ''
}: {
  avatarLabel?: string;
  avatarUrl: string;
  name?: string;
}): HTMLElement {
  const input = document.createElement('yt-live-chat-message-input-renderer');
  input.innerHTML = `
    ${name ? `<span id="author-name">${name}</span>` : ''}
    <span id="author-photo"${avatarLabel ? ` aria-label="${avatarLabel}"` : ''}>
      <img alt="" src="${avatarUrl}">
    </span>
    <div id="input" contenteditable="true"></div>
  `;
  return input;
}

function createSnapshotMessage(snapshot: LobbySnapshot): PlaygroundBackgroundMessage {
  return {
    snapshot,
    type: 'ytcq:playground:snapshot',
    userId: 'me-user'
  };
}

function createLobbySnapshot(): LobbySnapshot {
  return {
    games: [],
    invites: [
      {
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromUser: {
          displayName: 'Luna Chat',
          userId: 'luna-user'
        },
        gameId: 'chess',
        inviteId: 'invite-1',
        status: 'pending',
        toUser: {
          displayName: 'Me',
          userId: 'me-user'
        }
      }
    ],
    users: [
      {
        availableGames: ['chess'],
        displayName: 'Me',
        joinedAt: Date.now(),
        userId: 'me-user'
      },
      {
        availableGames: ['chess'],
        displayName: 'Luna Chat',
        joinedAt: Date.now(),
        userId: 'luna-user'
      },
      {
        availableGames: ['chess'],
        displayName: 'Marco Vibes',
        joinedAt: Date.now(),
        userId: 'marco-user'
      },
      {
        availableGames: [],
        displayName: 'Quiet Viewer',
        joinedAt: Date.now(),
        userId: 'quiet-user'
      }
    ]
  };
}

function createChessGame(): PublicGame {
  return {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    gameId: 'game-1',
    gameType: 'chess',
    pgn: '',
    players: {
      black: {
        displayName: 'Luna Chat',
        userId: 'luna-user'
      },
      white: {
        displayName: 'Me',
        userId: 'me-user'
      }
    },
    status: 'active',
    turn: 'white'
  } as PublicGame;
}

function getActionButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.ytcq-games-small-action'))
    .find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`Missing games action button: ${label}`);
  return button;
}

function getActionButtonLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.ytcq-games-small-action'))
    .map((candidate) => candidate.textContent || '');
}

function getGameCards(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.ytcq-games-game-card'));
}

function getGameLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ytcq-games-game-label'))
    .map((label) => label.textContent || '');
}

function getGamesSectionTitles(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ytcq-games-section:not([hidden]) > .ytcq-games-section-title'))
    .map((title) => title.textContent || '');
}
