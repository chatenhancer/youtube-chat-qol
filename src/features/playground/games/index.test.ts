import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../shared/options';
import type { LobbySnapshot, PlaygroundBackgroundMessage, PublicGame } from '../../../shared/playground-protocol';
import { setOptions } from '../../../shared/state';
import {
  handleFeatureMutations,
  handleFeatureOptionsChanged
} from '../../../content/lifecycle';
import {
  cleanupStaleGamesButtons,
  refreshGamesButton,
  scheduleGamesButtonWire,
  wireGamesButton
} from './index';
import {
  createGamesButton,
  getGamesHeaderAnchor,
  moveGamesButton,
  positionGamesCard,
  setGamesButtonExpanded,
  shouldWireGamesButton
} from './button';
import {
  createGamesCard,
  installGamesCardListeners
} from './card';

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

    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });
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
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

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
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();

    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    expect(button.nextElementSibling?.id).toBe('live-chat-header-context-menu');
  });

  it('detects header mutations and falls back through header anchor selectors', () => {
    const wrapper = document.createElement('div');
    const header = createHeader();
    wrapper.append(header);
    const mutation = {
      target: header,
      type: 'childList'
    } as unknown as MutationRecord;

    expect(shouldWireGamesButton([], [mutation])).toBe(true);
    expect(shouldWireGamesButton([wrapper], [])).toBe(true);
    expect(shouldWireGamesButton([document.createElement('div')], [])).toBe(false);

    header.replaceChildren();
    const moreWrapper = document.createElement('span');
    const moreButton = document.createElement('button');
    moreButton.setAttribute('aria-label', 'More options');
    moreWrapper.append(moreButton);
    header.append(moreWrapper);
    expect(getGamesHeaderAnchor(header)).toBe(moreWrapper);

    moreButton.removeAttribute('aria-label');
    moreButton.title = 'More options';
    expect(getGamesHeaderAnchor(header)).toBe(moreWrapper);

    moreWrapper.remove();
    const closeButton = document.createElement('button');
    closeButton.id = 'close-button';
    header.append(closeButton);
    expect(getGamesHeaderAnchor(header)).toBe(closeButton);
  });

  it('appends, expands, and positions games buttons and cards across viewport edges', () => {
    const header = createHeader();
    header.replaceChildren();
    document.body.append(header);
    const button = createGamesButton('owner', vi.fn());

    moveGamesButton(button, header, null);
    expect(header.lastElementChild).toBe(button);

    setGamesButtonExpanded(button, true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    setGamesButtonExpanded(document.createElement('div'), false);

    const card = document.createElement('section');
    mockRect(card, { height: 180, left: 0, top: 0, width: 240 });
    const anchor = document.createElement('button');
    document.body.append(anchor, card);
    mockRect(anchor, { height: 20, left: 4, top: 4, width: 20 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 260 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 220 });

    positionGamesCard(card, anchor);
    expect(card.style.left).toBe('8px');
    expect(card.style.top).toBe('32px');

    anchor.remove();
    positionGamesCard(card, anchor);
    expect(card.style.left).toBe('12px');
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
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('No players online');
    expect(document.querySelector('.ytcq-games-availability-toggle')?.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('.ytcq-games-availability-toggle .ytcq-menu-toggle')).not.toBeNull();
    expect(getGamesSectionTitles()).toEqual(['Invites', 'Start a game']);
    expect(document.querySelector('.ytcq-games-section-empty')?.textContent).toBe('No invites received yet.');
    expect(getGameCards()).toHaveLength(2);
    expect(document.querySelector('.ytcq-games-preview-chess .ytcq-games-preview-canvas')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-preview-replay-trivia .ytcq-games-preview-canvas')).not.toBeNull();
    expect(getGameLabels()).toEqual(['Chess', 'HELP-A-FRIEND! Trivia']);
    expect(getGameCards()[0].getAttribute('aria-disabled')).toBe('false');
    expect(getGameCards()[1].getAttribute('aria-disabled')).toBe('true');
    expect(getGameCards()[1].title).toBe('Available on chat replays.');
    getGameCards()[1].click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Games');

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

  it('does not send the visible YouTube profile to Playground', () => {
    const header = createHeader();
    document.body.append(header);
    document.body.append(createCurrentUserInput({
      avatarLabel: 'Open @AvatarFallback channel',
      avatarUrl: 'https://yt3.example/avatar-fallback=s88-c-k'
    }));
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();

    expect(lastMockPort()?.messages.at(-1)).toEqual({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
  });

  it('advertises Replay Trivia only inside chat replay', () => {
    window.history.replaceState({}, '', '/live_chat_replay?video_id=stream-a');
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    expect(lastMockPort()?.messages[0]).toEqual({
      availableGames: ['chess', 'replay-trivia'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    expect(getGameCards()[1].getAttribute('aria-disabled')).toBe('false');
    expect(getGameCards()[1].title).toBe('');
  });

  it('offers replay trivia through the normal invite flow', () => {
    window.history.replaceState({}, '', '/live_chat_replay?video_id=stream-a');
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    expect(getGameLabels()).toEqual(['Chess', 'HELP-A-FRIEND! Trivia']);
    getGameCards()[1].click();

    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('HELP-A-FRIEND! Trivia');
    expect(document.querySelectorAll('.ytcq-games-player-row')).toHaveLength(2);
    expect(getPlayerAvatarBackgrounds()).toEqual([
      'hsl(89 62% 28%)',
      'hsl(195 62% 28%)'
    ]);
    getActionButton('Invite').click();
    expect(lastMockPort()?.messages.at(-1)).toMatchObject({
      gameId: 'replay-trivia',
      toUserId: 'luna-user',
      type: 'ytcq:playground:invite'
    });
  });

  it('does not count built-in Computer players in the online player total', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage({
      games: [],
      invites: [],
      users: [
        {
          availableGames: ['chess'],
          displayName: 'Me',
          joinedAt: Date.now(),
          userId: 'me-user'
        },
        ...createComputerUsers()
      ]
    }));

    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('No players online');

    getGameCards()[0].click();
    expect(getPlayerNames()).toEqual([
      'Computer (Beginner)',
      'Computer (Club)',
      'Computer (Master)'
    ]);
  });

  it('opens the newly invited game when another game is already active', () => {
    window.history.replaceState({}, '', '/live_chat_replay?video_id=stream-a');
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createChessGame()],
      invites: []
    }));

    getGameCards()[1].click();
    getActionButton('Invite').click();
    expect(lastMockPort()?.messages.at(-1)).toMatchObject({
      gameId: 'replay-trivia',
      toUserId: 'luna-user',
      type: 'ytcq:playground:invite'
    });

    lastMockPort()?.emit({
      message: {
        game: createReplayTriviaGame(),
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-replay-trivia-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();

    gamesButton.click();
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Chess');
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Luna Chat');
    expect(document.querySelector('.ytcq-games-active-count')?.textContent).toBe('1/2');
    document.querySelectorAll<HTMLButtonElement>('.ytcq-games-cycle-action')[1].click();
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('HELP-A-FRIEND! Trivia');
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Luna Chat');
  });

  it('does not offer duplicate active game invites for the same player', () => {
    window.history.replaceState({}, '', '/live_chat_replay?video_id=stream-a');
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createChessGame()],
      invites: []
    }));

    getGameCards()[0].click();
    expect(getPlayerNames()).toEqual(['Marco Vibes']);

    getActionButton('Back').click();
    getGameCards()[1].click();
    expect(getPlayerNames()).toEqual(['Luna Chat', 'Marco Vibes']);
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
    expect(getGamesSectionTitles()).toEqual(['Active games', 'Invites', 'Start a game']);
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
    expect(document.querySelector('.ytcq-games-card')).not.toBeNull();
    expect(getActionButtonLabels()).toEqual(['Minimize', 'Leave']);
    document.querySelector<HTMLButtonElement>('.ytcq-chess-game-close')!.click();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(getActionButtonLabels()).toEqual(['Resume', 'Leave']);
    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).not.toBeNull();
    getActionButton('Leave').click();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game-1',
      payload: undefined,
      type: 'ytcq:playground:game-action'
    });
    lastMockPort()?.emit({
      message: {
        gameId: 'game-1',
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'me-user'
      },
      type: 'ytcq:playground:server-message'
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
    getActionButton('Accept').click();
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

  it('shows active chess games as the backend connection state changes', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    getActionButton('Accept').click();
    lastMockPort()?.emit({
      message: {
        game: createChessGame(),
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();

    lastMockPort()?.emit({
      error: 'Playground connection failed.',
      status: 'connecting',
      type: 'ytcq:playground:status'
    });

    const status = document.querySelector<HTMLElement>('.ytcq-chess-game-status');
    expect(status?.textContent).toBe('Connection lost. Trying to reconnect...');
    expect(status?.hidden).toBe(false);

    lastMockPort()?.emit({
      error: 'Playground connection failed.',
      status: 'disconnected',
      type: 'ytcq:playground:status'
    });

    expect(status?.textContent).toBe('Could not reconnect. Open Games to try again.');
    expect(status?.hidden).toBe(false);

    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createChessGame()]
    }));

    expect(status?.hidden).toBe(true);
    expect(status?.textContent).toBe('');
  });

  it('shows when an active chess game cannot be restored after reconnecting', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    getActionButton('Accept').click();
    lastMockPort()?.emit({
      message: {
        game: createChessGame(),
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });

    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: []
    }));

    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-chess-game-status')?.textContent).toBe('This game could not be restored.');

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

  it('keeps the active games card positioned and closes it from an outside click listener', async () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();
    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    mockRect(button, { height: 20, left: 80, top: 10, width: 24 });
    button.click();
    const card = document.querySelector<HTMLElement>('.ytcq-games-card')!;
    mockRect(card, { height: 180, left: 0, top: 0, width: 240 });
    await vi.runOnlyPendingTimersAsync();

    window.dispatchEvent(new Event('resize'));
    expect(card.style.left).not.toBe('');

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('installs card listeners for outside click, escape, resize, and cleanup', async () => {
    const onClose = vi.fn();
    const { card } = createGamesCard(onClose);
    const anchor = document.createElement('button');
    anchor.className = 'ytcq-games-button';
    document.body.append(anchor, card);
    mockRect(card, { height: 100, left: 0, top: 0, width: 120 });
    mockRect(anchor, { height: 20, left: 40, top: 40, width: 20 });

    const cleanup = installGamesCardListeners({
      getAnchor: () => anchor,
      getCard: () => card,
      onClose
    });
    await vi.runOnlyPendingTimersAsync();

    card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const panel = document.createElement('section');
    panel.className = 'ytcq-game-panel';
    document.body.append(panel);
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('resize'));
    expect(card.style.left).not.toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledOnce();

    onClose.mockClear();
    cleanup();
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels pending wiring and removes buttons during cleanup', async () => {
    document.body.append(createHeader());
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    scheduleGamesButtonWire();
    cleanupStaleGamesButtons();
    await vi.runOnlyPendingTimersAsync();

    expect(document.querySelector('.ytcq-games-button')).toBeNull();
  });

  it('coalesces scheduled wiring and skips wiring when options are disabled before the frame runs', async () => {
    document.body.append(createHeader());
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    scheduleGamesButtonWire();
    scheduleGamesButtonWire();
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: false });
    await vi.runOnlyPendingTimersAsync();

    expect(document.querySelector('.ytcq-games-button')).toBeNull();
  });

  it('does nothing when wiring runs before the YouTube header exists', () => {
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    wireGamesButton();

    expect(document.querySelector('.ytcq-games-button')).toBeNull();
  });

  it('responds to lifecycle mutation batches by wiring the Games button', async () => {
    const wrapper = document.createElement('div');
    const header = createHeader();
    wrapper.append(header);
    document.body.append(wrapper);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });

    handleFeatureMutations({
      addedElements: [wrapper],
      changedMessages: [],
      mutations: []
    });
    await vi.runOnlyPendingTimersAsync();

    expect(header.querySelector('.ytcq-games-button')).not.toBeNull();
  });

  it('ignores lifecycle mutation batches when disabled or unrelated', async () => {
    const wrapper = document.createElement('div');
    const header = createHeader();
    wrapper.append(header);
    document.body.append(wrapper);

    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: false });
    handleFeatureMutations({
      addedElements: [wrapper],
      changedMessages: [],
      mutations: []
    });
    await vi.runOnlyPendingTimersAsync();
    expect(header.querySelector('.ytcq-games-button')).toBeNull();

    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });
    handleFeatureMutations({
      addedElements: [document.createElement('div')],
      changedMessages: [],
      mutations: []
    });
    await vi.runOnlyPendingTimersAsync();
    expect(header.querySelector('.ytcq-games-button')).toBeNull();
  });

  it('refreshes after unrelated enabled option changes without changing availability', async () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    handleFeatureOptionsChanged(
      { ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true },
      { ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true }
    );
    await vi.runOnlyPendingTimersAsync();

    expect(header.querySelector('.ytcq-games-button')).not.toBeNull();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      availableGames: ['chess'],
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
  });

  it('responds to lifecycle option changes while the card is open', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });
    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: false });
    handleFeatureOptionsChanged(
      { ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true },
      { ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: false }
    );

    expect(lastMockPort()?.messages.at(-1)).toEqual({
      availableGames: [],
      type: 'ytcq:playground:set-availability'
    });
    expect(document.querySelector('.ytcq-games-availability-toggle')?.getAttribute('aria-checked')).toBe('false');

    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: false, playgroundGamesAvailable: false });
    handleFeatureOptionsChanged(
      { ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: false },
      { ...DEFAULT_OPTIONS, playgroundEnabled: false, playgroundGamesAvailable: false }
    );

    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(document.querySelector('.ytcq-games-button')).toBeNull();
  });

  it('ignores invites and cancels pending player invites from the lobby UI', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });
    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    getActionButton('Ignore').click();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      accept: false,
      inviteId: 'invite-1',
      type: 'ytcq:playground:respond-invite'
    });

    getGameCards()[0].click();
    getActionButton('Invite').click();
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Waiting for reply...');
    getActionButton('Cancel').click();

    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Available now');
    expect(getActionButton('Invite')).not.toBeNull();
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
        availableGames: ['chess', 'replay-trivia'],
        displayName: 'Me',
        joinedAt: Date.now(),
        userId: 'me-user'
      },
      {
        availableGames: ['chess', 'replay-trivia'],
        displayName: 'Luna Chat',
        joinedAt: Date.now(),
        userId: 'luna-user'
      },
      {
        availableGames: ['chess', 'replay-trivia'],
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

function createComputerUsers(): LobbySnapshot['users'] {
  return [
    {
      availableGames: ['chess'],
      displayName: 'Computer (Beginner)',
      joinedAt: Date.now(),
      userId: 'server:computer:beginner'
    },
    {
      availableGames: ['chess'],
      displayName: 'Computer (Club)',
      joinedAt: Date.now(),
      userId: 'server:computer:club'
    },
    {
      availableGames: ['chess'],
      displayName: 'Computer (Master)',
      joinedAt: Date.now(),
      userId: 'server:computer:master'
    },
    {
      availableGames: ['replay-trivia'],
      displayName: 'Computer',
      joinedAt: Date.now(),
      userId: 'server:computer'
    }
  ];
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

function createReplayTriviaGame(): PublicGame {
  return {
    answers: {},
    currentQuestion: {
      choices: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
      friendIntro: 'help me answer this',
      id: 'question-1',
      prompt: 'Which answer is right?',
      rightReply: 'that helped',
      wrongReply: 'not quite'
    },
    currentQuestionIndex: 0,
    gameId: 'game-2',
    gameType: 'replay-trivia',
    phaseStartedAt: Date.now(),
    players: {
      guest: {
        displayName: 'Luna Chat',
        userId: 'luna-user'
      },
      host: {
        displayName: 'Me',
        userId: 'me-user'
      }
    },
    questionProviderUserId: 'me-user',
    scores: {
      guest: 0,
      host: 0
    },
    status: 'question',
    totalQuestions: 1
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

function getPlayerAvatarBackgrounds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ytcq-games-player-avatar'))
    .map((avatar) => avatar.style.getPropertyValue('--ytcq-games-player-avatar-bg'));
}

function getPlayerNames(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ytcq-games-player-row .ytcq-games-row-title'))
    .map((title) => title.textContent || '');
}

function getGamesSectionTitles(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ytcq-games-section:not([hidden]) .ytcq-games-section-title'))
    .map((title) => title.textContent || '');
}

function mockRect(
  element: Element,
  rect: {
    height: number;
    left: number;
    top: number;
    width: number;
  }
): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      bottom: rect.top + rect.height,
      height: rect.height,
      left: rect.left,
      right: rect.left + rect.width,
      toJSON: () => ({}),
      top: rect.top,
      width: rect.width,
      x: rect.left,
      y: rect.top
    } as DOMRect)
  });
}
