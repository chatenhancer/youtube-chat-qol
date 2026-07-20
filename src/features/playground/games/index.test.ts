import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../../shared/options';
import type { LobbySnapshot, PlaygroundBackgroundMessage, PublicGame } from '../../../shared/playground/protocol';
import type { PublicStickAroundGame } from '../../../shared/playground/stick-around';
import { setOptions } from '../../../shared/state';
import { clearToast } from '../../../shared/toast';
import {
  handleFeatureMutations,
  handleFeatureOptionsChanged
} from '../../../content/feature-runtime';

const alertSoundMocks = vi.hoisted(() => ({
  playAlertSound: vi.fn()
}));
const minimizeAnimationMocks = vi.hoisted(() => ({
  animateGameSurfaceToGamesButton: vi.fn(() => true)
}));

vi.mock('../../../shared/sounds/alert-sounds', () => alertSoundMocks);
vi.mock('./minimize-animation', () => minimizeAnimationMocks);

import {
  cleanupStaleGamesUi,
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
import { isChessGamePanelOpen } from './chess/panel';

describe('playground games header button', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    window.history.replaceState({}, '', '/watch?v=stream-a');
    setOptions({ ...DEFAULT_OPTIONS });
    mockPorts.length = 0;
    alertSoundMocks.playAlertSound.mockClear();
    minimizeAnimationMocks.animateGameSurfaceToGamesButton.mockClear();
    chrome.runtime.connect = vi.fn(() => createMockPort() as unknown as chrome.runtime.Port);
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanupStaleGamesUi();
    clearToast();
    vi.useRealTimers();
    delete (chrome.runtime as Partial<typeof chrome.runtime>).connect;
  });

  it('does not insert the games button until Playground is enabled', async () => {
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

  it('toggles the games panel from the header button', async () => {
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
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Connecting...');
    expect(document.querySelector('.ytcq-games-connection-notice')?.textContent).toContain('Connecting to Playground');
    expect(document.querySelector('.ytcq-games-connection-notice')?.textContent).toContain('Setting up the games lobby, please wait.');
    expect(getActionButton('Connecting').disabled).toBe(true);
    expect(getActionButton('Connecting').querySelector('.ytcq-games-loading-spinner')).not.toBeNull();
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
    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('.ytcq-games-availability-toggle .ytcq-menu-toggle')).not.toBeNull();
    expect(getGamesSectionTitles()).toEqual(['Start a game', 'Unavailable games']);
    expect(document.querySelector('.ytcq-games-invite-row')).toBeNull();
    expect(document.querySelector('.ytcq-games-section-empty')).toBeNull();
    expect(getGameCards()).toHaveLength(4);
    const unavailableGames = document.querySelector<HTMLDetailsElement>(
      '.ytcq-games-unavailable-section'
    )!;
    const gamesBody = document.querySelector<HTMLElement>('.ytcq-games-card-body')!;
    Object.defineProperties(gamesBody, {
      clientHeight: { configurable: true, value: 336 },
      scrollHeight: { configurable: true, value: 520 }
    });
    expect(unavailableGames.open).toBe(false);
    expect(getGameLabels(unavailableGames)).toEqual(['HELP-A-FRIEND! Trivia']);
    unavailableGames.querySelector<HTMLElement>('summary')!.click();
    await vi.runOnlyPendingTimersAsync();
    expect(unavailableGames.open).toBe(true);
    expect(gamesBody.scrollTop).toBe(gamesBody.scrollHeight);
    expect(document.querySelector('.ytcq-games-preview-chess .ytcq-games-preview-canvas')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-preview-bounty-hunting .ytcq-games-preview-canvas')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-preview-replay-trivia .ytcq-games-preview-canvas')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-preview-stick-around .ytcq-games-preview-canvas')).not.toBeNull();
    expect(getGameLabels()).toEqual(['Chess', 'The Wild Wild Chat', 'Stick Around!', 'HELP-A-FRIEND! Trivia']);
    expect(getGameCardHelpers()).toEqual([
      'Classic chess, three difficulty levels.',
      'Time to take care of some bounties.',
      "It's raining bubbles.",
      'Do you have the knowledge?'
    ]);
    expect(getGameCard('Chess').getAttribute('aria-disabled')).toBe('false');
    expect(getGameCard('The Wild Wild Chat').getAttribute('aria-disabled')).toBe('false');
    expect(getGameCard('HELP-A-FRIEND! Trivia').getAttribute('aria-disabled')).toBe('true');
    expect(getGameCard('HELP-A-FRIEND! Trivia').title).toBe(
      'Can only be played during a live replay (a stream that has already ended).'
    );
    expect(getGameCard('HELP-A-FRIEND! Trivia').getAttribute('aria-label')).toContain(
      'Can only be played during a live replay (a stream that has already ended).'
    );
    const replayBadge = getGameCard('HELP-A-FRIEND! Trivia')
      .querySelector<HTMLElement>('.ytcq-games-context-badge');
    expect(replayBadge?.textContent).toBe('Replay only');
    expect(replayBadge?.parentElement?.classList).toContain('ytcq-games-preview');
    expect(replayBadge?.title).toBe('');
    expect(getGameCard('The Wild Wild Chat').querySelector('.ytcq-games-restriction-badge')).toBeNull();
    expect(getGameCard('The Wild Wild Chat').getAttribute('aria-label')).not.toContain('Can only be played');
    expect(getGameCard('Stick Around!').getAttribute('aria-disabled')).toBe('false');
    expect(getGameCard('Stick Around!').querySelector('.ytcq-games-restriction-badge')).toBeNull();
    expect(getGameCard('Stick Around!').getAttribute('aria-label')).not.toContain('Can only be played');
    getGameCard('HELP-A-FRIEND! Trivia').click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Games');

    getGameCard('Chess').click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Chess');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Invite a player');
    expect(getGamesSectionTitles()).toEqual(['Players']);
    expect(getDetailCancelButton().textContent).toBe('Cancel');
    expect(getDetailCancelButton().classList).toContain('ytcq-profile-card-open');
    expect(document.querySelector('.ytcq-games-detail-header')).toBeNull();
    expect(document.querySelector('.ytcq-games-section-empty')?.textContent).toBe('There are no players available.');
    expect(document.querySelector('.ytcq-games-player-row')).toBeNull();
    getDetailCancelButton().click();

    button.click();

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
  });

  it('keeps incompatible games visible with a disabled update badge and tooltip', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit({
      ...createSnapshotMessage(createLobbySnapshot()),
      incompatibleGames: ['bounty-hunting']
    });

    const cards = getGameCards();
    const bountyCard = getGameCard('The Wild Wild Chat');
    expect(cards).toHaveLength(4);
    expect(getGameCard('Chess').getAttribute('aria-disabled')).toBe('false');
    expect(bountyCard.getAttribute('aria-disabled')).toBe('true');
    expect(bountyCard.title).toBe(
      'The Wild Wild Chat is temporarily unavailable because Chat Enhancer and Playground versions do not match. Try again when the versions match.'
    );
    const badge = bountyCard.querySelector<HTMLElement>('.ytcq-games-version-badge');
    expect(badge?.classList).toContain('ytcq-games-restriction-badge');
    expect(badge?.textContent).toBe('Update required');
    expect(badge?.parentElement?.classList).toContain('ytcq-games-preview');
    expect(badge?.title).toBe('');
    expect(badge?.querySelector('svg')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-version-notice')).toBeNull();

    bountyCard.click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Games');
    getGameCard('Chess').click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Chess');
  });

  it('offers a leave-only row for an incompatible active game without mounting its UI', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit({
      ...createSnapshotMessage({
        ...createLobbySnapshot(),
        games: [],
        invites: []
      }),
      incompatibleActiveGames: [{
        gameId: 'incompatible-bounty-game',
        gameType: 'bounty-hunting'
      }],
      incompatibleGames: ['bounty-hunting']
    });

    const row = document.querySelector<HTMLElement>('.ytcq-games-incompatible-active-row');
    expect(row?.textContent).toContain('The Wild Wild Chat');
    expect(row?.textContent).toContain(
      'Update required. Chat Enhancer and Playground versions do not match.'
    );
    expect(row?.querySelectorAll('button')).toHaveLength(1);
    expect(row?.querySelector('button')?.textContent).toBe('Leave');
    expect(document.querySelector('.ytcq-bounty-hunting-game-panel')).toBeNull();
    expect(document.querySelector('.ytcq-bounty-hunting-canvas')).toBeNull();
    expect(gamesButton.querySelector('.ytcq-games-badge')?.textContent).toBe('1');

    row?.querySelector<HTMLButtonElement>('button')?.click();

    expect(
      document.querySelector<HTMLButtonElement>('.ytcq-games-incompatible-active-row button')
        ?.hasAttribute('disabled')
    ).toBe(true);
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      action: 'leave',
      gameId: 'incompatible-bounty-game',
      payload: undefined,
      type: 'ytcq:playground:game-action'
    });

    lastMockPort()?.emit({
      message: {
        gameId: 'incompatible-bounty-game',
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'me-user'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-games-incompatible-active-row')).toBeNull();
  });

  it('suppresses version errors and shows generic action errors in a global toast', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    lastMockPort()?.emit({
      code: 'game_version',
      message: 'This game needs matching Chat Enhancer and Playground versions.',
      type: 'ytcq:playground:error'
    });

    expect(document.querySelector('.ytcq-toast')).toBeNull();

    lastMockPort()?.emit({
      code: 'bad_action',
      message: 'That action is no longer available.',
      type: 'ytcq:playground:error'
    });

    const alert = document.querySelector<HTMLElement>('.ytcq-toast');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.dataset.tone).toBe('error');
    expect(alert?.textContent).toBe('That action is no longer available.');
    expect(document.querySelector('.ytcq-games-connection-notice')).toBeNull();
    expect(document.querySelector('.ytcq-games-action-error')).toBeNull();
    expect(getGameCards()).toHaveLength(4);

    document.querySelector<HTMLButtonElement>('.ytcq-games-availability')?.click();
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe(
      'That action is no longer available.'
    );

    vi.advanceTimersByTime(4_000);

    lastMockPort()?.emit({
      code: 'bad_action',
      message: 'That action is still unavailable.',
      type: 'ytcq:playground:error'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe(
      'That action is still unavailable.'
    );
    lastMockPort()?.emit({
      message: {
        game: createChessGame(),
        type: 'gameUpdated'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe(
      'That action is still unavailable.'
    );

    vi.advanceTimersByTime(1_000);
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe(
      'That action is still unavailable.'
    );

    vi.advanceTimersByTime(3_999);
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe(
      'That action is still unavailable.'
    );

    vi.advanceTimersByTime(1);
    expect(document.querySelector('.ytcq-toast')).toBeNull();
  });

  it('does not clear unrelated optimistic lobby state for a generic action error', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    getGameCard('Chess').click();
    getActionButton('Invite').click();

    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Waiting for reply...');

    lastMockPort()?.emit({
      code: 'bad_action',
      message: 'That action is no longer available.',
      type: 'ytcq:playground:error'
    });

    expect(document.querySelector('.ytcq-toast')?.textContent).toBe(
      'That action is no longer available.'
    );
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain(
      'Waiting for reply...'
    );
  });

  it('clears only the invite spinner matched by a correlated action error', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    getGameCard('Chess').click();
    getActionButton('Invite').click();

    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain(
      'Waiting for reply...'
    );

    lastMockPort()?.emit({
      code: 'user_unavailable',
      message: 'That player is not available for this game.',
      request: {
        gameId: 'chess',
        toUserId: 'other-user',
        type: 'invite'
      },
      type: 'ytcq:playground:error'
    } as PlaygroundBackgroundMessage);
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain(
      'Waiting for reply...'
    );

    lastMockPort()?.emit({
      code: 'game_version',
      message: 'Chat Enhancer and Playground versions do not match for this game.',
      request: {
        gameId: 'chess',
        toUserId: 'luna-user',
        type: 'invite'
      },
      type: 'ytcq:playground:error'
    } as PlaygroundBackgroundMessage);

    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Available now');
    expect(getActionButton('Invite')).not.toBeNull();
    expect(document.querySelector('.ytcq-toast')?.textContent).toBe(
      'That player is not available for this game.'
    );

    lastMockPort()?.emit({
      message: {
        game: createChessGame(),
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(document.querySelector('.ytcq-games-card')).not.toBeNull();
  });

  it('keeps auto-open queued when an older same-game invite fails', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    getGameCard('Chess').click();
    getActionButton('Invite').click();

    lastMockPort()?.emit({
      code: 'user_unavailable',
      message: 'That player is not available for this game.',
      request: {
        gameId: 'chess',
        toUserId: 'other-user',
        type: 'invite'
      },
      type: 'ytcq:playground:error'
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
  });

  it('cancels pending auto-open only for a failed accepted invite response', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    getActionButton('Accept').click();

    lastMockPort()?.emit({
      code: 'not_your_invite',
      message: 'That invite is not for you.',
      request: {
        accept: true,
        inviteId: 'invite-1',
        type: 'respondInvite'
      },
      type: 'ytcq:playground:error'
    } as PlaygroundBackgroundMessage);
    lastMockPort()?.emit({
      message: {
        game: createChessGame(),
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(document.querySelector('.ytcq-games-card')).not.toBeNull();
  });

  it('shows pending invite and active game counts on the header button', async () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    refreshGamesButton();
    await vi.runOnlyPendingTimersAsync();

    const button = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    const badge = button.querySelector<HTMLElement>('.ytcq-games-badge')!;
    expect(badge.hidden).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Games');

    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createChessGame()]
    }));

    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('1');
    expect(badge.classList.contains('ytcq-games-badge-invites')).toBe(true);
    expect(badge.classList.contains('ytcq-games-badge-active')).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Games: Invites 1');
    expect(alertSoundMocks.playAlertSound).not.toHaveBeenCalled();

    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createChessGame(), createReplayTriviaGame()],
      invites: []
    }));

    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe('2');
    expect(badge.classList.contains('ytcq-games-badge-invites')).toBe(false);
    expect(badge.classList.contains('ytcq-games-badge-active')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Games: Active games 2');

    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [],
      invites: []
    }));

    expect(badge.hidden).toBe(true);
    expect(badge.textContent).toBe('');
    expect(button.getAttribute('aria-label')).toBe('Games');
  });

  it('plays the game invite alert sound for new incoming invites', async () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    refreshGamesButton();
    await vi.runOnlyPendingTimersAsync();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      invites: []
    }));

    lastMockPort()?.emit({
      message: {
        invite: createLobbySnapshot().invites[0],
        type: 'inviteReceived'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(alertSoundMocks.playAlertSound).toHaveBeenCalledOnce();
    expect(alertSoundMocks.playAlertSound).toHaveBeenCalledWith('gameInvite');
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
      availableGames: ['chess', 'bounty-hunting', 'stick-around'],
      languageCode: 'en',
      locale: 'en',
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
      languageCode: 'en',
      locale: 'en',
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    const bountyCard = getGameCard('The Wild Wild Chat');
    const replayCard = getGameCard('HELP-A-FRIEND! Trivia');
    const stickAroundCard = getGameCard('Stick Around!');
    expect(bountyCard.getAttribute('aria-disabled')).toBe('true');
    expect(bountyCard.title).toBe('Can only be played during live chat.');
    expect(bountyCard.querySelector('.ytcq-games-context-badge')?.textContent)
      .toBe('Livestream only');
    expect(bountyCard.querySelector<HTMLElement>('.ytcq-games-context-badge')?.title).toBe('');
    expect(replayCard.getAttribute('aria-disabled')).toBe('false');
    expect(replayCard.title).toBe('');
    expect(replayCard.querySelector('.ytcq-games-restriction-badge')).toBeNull();
    expect(stickAroundCard.getAttribute('aria-disabled')).toBe('true');
    expect(stickAroundCard.title).toBe('Can only be played during live chat.');
    expect(stickAroundCard.querySelector('.ytcq-games-context-badge')?.textContent)
      .toBe('Livestream only');
    expect(stickAroundCard.querySelector<HTMLElement>('.ytcq-games-context-badge')?.title).toBe('');
    expect(getGameCardHelpers()).toEqual([
      'Classic chess, three difficulty levels.',
      'Do you have the knowledge?',
      'Time to take care of some bounties.',
      "It's raining bubbles."
    ]);
  });

  it('prioritizes context restrictions over version mismatches with one badge per card', () => {
    window.history.replaceState({}, '', '/live_chat_replay?video_id=stream-a');
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit({
      ...createSnapshotMessage(createLobbySnapshot()),
      incompatibleGames: ['bounty-hunting', 'replay-trivia']
    });

    const bountyCard = getGameCard('The Wild Wild Chat');
    expect(bountyCard.querySelectorAll('.ytcq-games-restriction-badge')).toHaveLength(1);
    expect(bountyCard.querySelector('.ytcq-games-context-badge')?.textContent)
      .toBe('Livestream only');
    expect(bountyCard.querySelector('.ytcq-games-version-badge')).toBeNull();
    expect(bountyCard.getAttribute('aria-label')).toContain('Can only be played during live chat.');
    expect(bountyCard.getAttribute('aria-label')).not.toContain('temporarily unavailable');

    const replayCard = getGameCard('HELP-A-FRIEND! Trivia');
    expect(replayCard.querySelectorAll('.ytcq-games-restriction-badge')).toHaveLength(1);
    expect(replayCard.querySelector('.ytcq-games-context-badge')).toBeNull();
    expect(replayCard.querySelector('.ytcq-games-version-badge')?.textContent)
      .toBe('Update required');
    expect(replayCard.title).toContain(
      'HELP-A-FRIEND! Trivia is temporarily unavailable because Chat Enhancer and Playground versions do not match.'
    );
    expect(replayCard.querySelector<HTMLElement>('.ytcq-games-version-badge')?.title).toBe('');
    expect(replayCard.getAttribute('aria-disabled')).toBe('true');
  });

  it('offers replay trivia through the normal invite flow', () => {
    window.history.replaceState({}, '', '/live_chat_replay?video_id=stream-a');
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    expect(getGameLabels()).toEqual(['Chess', 'HELP-A-FRIEND! Trivia', 'The Wild Wild Chat', 'Stick Around!']);
    getGameCard('HELP-A-FRIEND! Trivia').click();

    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('HELP-A-FRIEND! Trivia');
    expect(document.querySelectorAll('.ytcq-games-player-row')).toHaveLength(2);
    expect(getPlayerAvatarBackgrounds()).toEqual([
      'hsl(188 64% 30%)',
      'hsl(146 48% 30%)'
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
          availableGames: ['chess', 'bounty-hunting', 'stick-around'],
          displayName: 'Me',
          joinedAt: Date.now(),
          userId: 'me-user'
        },
        ...createComputerUsers()
      ]
    }));

    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('No players online');

    getGameCard('Chess').click();
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

    getGameCard('HELP-A-FRIEND! Trivia').click();
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
    expect(document.querySelectorAll('.ytcq-games-active-dot')).toHaveLength(2);
    expect(document.querySelector('.ytcq-games-active-dot-current')).toBe(
      document.querySelectorAll('.ytcq-games-active-dot')[0]
    );
    expect(document.querySelector('.ytcq-games-active-position')?.getAttribute('aria-hidden')).toBe(
      'true'
    );
    expect(document.querySelector('.ytcq-games-active-controls')?.getAttribute('role')).toBe('group');
    expect(document.querySelector('.ytcq-games-active-controls')?.getAttribute('aria-label')).toBe('Active games');
    expect(document.querySelector('.ytcq-games-cycle-action-previous')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-cycle-action-next')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-cycle-action')?.classList).not.toContain(
      'ytcq-games-small-action'
    );
    document.querySelectorAll<HTMLButtonElement>('.ytcq-games-cycle-action')[1].click();
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('HELP-A-FRIEND! Trivia');
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Luna Chat');
  });

  it('keeps another active game panel open when leaving the selected game', () => {
    window.history.replaceState({}, '', '/live_chat_replay?video_id=stream-a');
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createChessGame(), createReplayTriviaGame()],
      invites: []
    }));

    document.querySelector<HTMLButtonElement>('.ytcq-games-cycle-action-next')!.click();
    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-replay-trivia-game-panel')).not.toBeNull();

    gamesButton.click();
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Chess');
    getActionButton('Leave').click();

    expect(document.querySelector('.ytcq-replay-trivia-game-panel')).not.toBeNull();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game-1',
      payload: undefined,
      type: 'ytcq:playground:game-action'
    });
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

    getGameCard('Chess').click();
    expect(getPlayerNames()).toEqual(['Marco Vibes']);

    getDetailCancelButton().click();
    getGameCard('HELP-A-FRIEND! Trivia').click();
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

    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('2 players online');
    expect(getActionButton('Accept')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('.ytcq-games-availability')!.click();
    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('false');
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
    expect(getGamesSectionTitles()).toEqual(['Active games', 'Start a game', 'Unavailable games']);
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Chess');
    expect(document.querySelector('.ytcq-games-active-row')?.textContent).toContain('Luna Chat');
    expect(document.querySelector('.ytcq-games-invite-row')).toBeNull();
    expect(getActionButtonLabels()).toEqual(['Hide', 'Leave']);

    getActionButton('Hide').click();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(getActionButtonLabels()).toEqual(['Resume', 'Leave']);
    expect(minimizeAnimationMocks.animateGameSurfaceToGamesButton).toHaveBeenCalledOnce();
    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(gamesButton.getAttribute('aria-expanded')).toBe('false');
    gamesButton.click();
    expect(getActionButtonLabels()).toEqual(['Hide', 'Leave']);
    document.querySelector<HTMLButtonElement>('.ytcq-chess-game-close')!.click();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
    expect(getActionButtonLabels()).toEqual(['Resume', 'Leave']);
    expect(minimizeAnimationMocks.animateGameSurfaceToGamesButton).toHaveBeenCalledTimes(2);
    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-chess-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    gamesButton.click();
    getActionButton('Leave').click();
    expect(getActionButton('Leave').disabled).toBe(true);
    expect(getActionButton('Leave').querySelector('.ytcq-games-loading-spinner')).not.toBeNull();
    expect(minimizeAnimationMocks.animateGameSurfaceToGamesButton).toHaveBeenCalledTimes(2);
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      action: 'leave',
      gameId: 'game-1',
      payload: undefined,
      type: 'ytcq:playground:game-action'
    });
    lastMockPort()?.emit({
      code: 'not_in_game',
      message: 'You are not a player in this game.',
      request: {
        action: 'leave',
        gameId: 'other-game',
        type: 'gameAction'
      },
      type: 'ytcq:playground:error'
    } as PlaygroundBackgroundMessage);
    expect(getActionButton('Leave').disabled).toBe(true);

    lastMockPort()?.emit({
      code: 'not_in_game',
      message: 'You are not a player in this game.',
      request: {
        action: 'leave',
        gameId: 'game-1',
        type: 'gameAction'
      },
      type: 'ytcq:playground:error'
    } as PlaygroundBackgroundMessage);
    expect(getActionButton('Leave').disabled).toBe(false);
    expect(getActionButton('Leave').querySelector('.ytcq-games-loading-spinner')).toBeNull();

    lastMockPort()?.emit({
      message: {
        gameId: 'game-1',
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'me-user'
      },
      type: 'ytcq:playground:server-message'
    });
    getGameCard('Chess').click();

    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Chess');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Invite a player');
    expect(document.querySelectorAll('.ytcq-games-player-row')).toHaveLength(2);
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Luna Chat');

    getActionButton('Invite').click();
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Waiting for reply...');
    expect(getActionButton('Cancel')).not.toBeNull();
    expect(getActionButton('Cancel').querySelector('.ytcq-games-loading-spinner')).not.toBeNull();
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      gameId: 'chess',
      toUserId: 'luna-user',
      type: 'ytcq:playground:invite'
    });

    getDetailCancelButton().click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Games');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('2 players online');

    getGameCard('Chess').click();
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Waiting for reply...');
    expect(getActionButton('Cancel')).not.toBeNull();
    expect(lastMockPort()?.messages.filter((message) =>
      (message as { type?: string }).type === 'ytcq:playground:invite'
    )).toHaveLength(1);
  });

  it('remembers compact mode only when resuming an active Bounty Hunting game', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCanvasContext() as unknown as CanvasRenderingContext2D);
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createBountyHuntingGame()],
      invites: []
    }));

    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-bounty-hunting-game-panel')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(document.querySelector('.ytcq-bounty-hunting-game-title')?.textContent).toBe('The Wild Wild Chat');

    document.querySelector<HTMLButtonElement>('.ytcq-bounty-hunting-game-compact-toggle')!.click();
    expect(document.querySelector('.ytcq-bounty-hunting-game-panel')?.classList.contains('ytcq-game-panel-compact')).toBe(true);

    gamesButton.click();
    getActionButton('Hide').click();
    expect(document.querySelector('.ytcq-bounty-hunting-game-panel')).toBeNull();

    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-bounty-hunting-game-panel')?.classList.contains('ytcq-game-panel-compact')).toBe(true);
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(document.querySelector('.ytcq-bounty-hunting-canvas')?.classList.contains('ytcq-bounty-hunting-canvas-compact')).toBe(true);

    gamesButton.click();
    getActionButton('Hide').click();
    const bountyInvite = {
      ...createLobbySnapshot().invites[0],
      gameId: 'bounty-hunting' as const,
      inviteId: 'invite-bounty-hunting'
    };
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createBountyHuntingGame()],
      invites: [bountyInvite]
    }));

    document.dispatchEvent(createPointerEvent('pointermove', {
      clientX: 180,
      clientY: 90,
      pointerId: 4
    }));
    getActionButton('Accept').click();
    lastMockPort()?.emit({
      message: {
        game: {
          ...createBountyHuntingGame(),
          gameId: 'game-bounty-hunting-2'
        },
        type: 'gameStarted'
      },
      type: 'ytcq:playground:server-message'
    });

    const panel = document.querySelector<HTMLElement>('.ytcq-bounty-hunting-game-panel');
    expect(panel?.classList.contains('ytcq-game-panel-compact')).toBe(false);
    expect(panel?.style.left).toBe('180px');
    expect(panel?.style.top).toBe('90px');
    expect(document.querySelector('.ytcq-bounty-hunting-canvas')?.classList.contains('ytcq-bounty-hunting-canvas-compact')).toBe(false);
  });

  it('keeps stream availability separate from the default setting while reopening the card', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('true');

    document.querySelector<HTMLButtonElement>('.ytcq-games-availability')!.click();
    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('false');
    expect(lastMockPort()?.messages.at(-1)).toEqual({
      availableGames: [],
      type: 'ytcq:playground:set-availability'
    });

    gamesButton.click();
    gamesButton.click();

    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('false');

    gamesButton.click();
    window.history.replaceState({}, '', '/watch?v=stream-b');
    gamesButton.click();

    expect(lastMockPort()?.messages.at(-1)).toEqual({
      availableGames: ['chess', 'bounty-hunting', 'stick-around'],
      languageCode: 'en',
      locale: 'en',
      streamKey: 'stream-b',
      type: 'ytcq:playground:init'
    });

    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));
    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('true');
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

  it('cleans up game runtime when the shared panel shell is removed externally', () => {
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

    expect(isChessGamePanelOpen()).toBe(true);

    document.querySelector('.ytcq-chess-game-panel')?.remove();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createChessGame()]
    }));

    expect(isChessGamePanelOpen()).toBe(false);
  });

  it('treats an externally removed Stick Around overlay as hidden', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCanvasContext() as unknown as CanvasRenderingContext2D);
    const header = createHeader();
    const feed = document.createElement('yt-live-chat-item-list-renderer');
    document.body.append(header, feed);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    const snapshot = {
      ...createLobbySnapshot(),
      games: [createStickAroundGame()],
      invites: []
    };
    lastMockPort()?.emit(createSnapshotMessage(snapshot));

    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-stick-around-overlay')).not.toBeNull();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(gamesButton.getAttribute('aria-expanded')).toBe('false');

    document.querySelector('.ytcq-stick-around-overlay')?.remove();
    lastMockPort()?.emit(createSnapshotMessage(snapshot));

    expect(document.querySelector('.ytcq-stick-around-overlay')).toBeNull();
    gamesButton.click();
    expect(getActionButtonLabels()).toEqual(['Resume', 'Leave']);
  });

  it('keeps lobby buttons stable during active Stick Around game updates', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCanvasContext() as unknown as CanvasRenderingContext2D);
    const header = createHeader();
    const feed = document.createElement('yt-live-chat-item-list-renderer');
    document.body.append(header, feed);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    const game = createStickAroundGame();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [game],
      invites: []
    }));
    getActionButton('Resume').click();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    gamesButton.click();

    const hideButton = getActionButton('Hide');
    lastMockPort()?.emit({
      message: {
        game: {
          ...game,
          inputs: {
            'me-user': {
              jump: true,
              left: false,
              right: false,
              frame: 1,
              seq: 1,
              sentAt: Date.now(),
              userId: 'me-user'
            }
          }
        } as PublicStickAroundGame,
        type: 'gameUpdated'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(getActionButton('Hide')).toBe(hideButton);
  });

  it('shows active Stick Around games as the backend connection state changes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCanvasContext() as unknown as CanvasRenderingContext2D);
    const header = createHeader();
    const feed = document.createElement('yt-live-chat-item-list-renderer');
    document.body.append(header, feed);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    const snapshot = {
      ...createLobbySnapshot(),
      games: [createStickAroundGame()],
      invites: []
    };
    lastMockPort()?.emit(createSnapshotMessage(snapshot));
    getActionButton('Resume').click();

    const status = document.querySelector<HTMLElement>('.ytcq-stick-around-status');
    expect(document.querySelector('.ytcq-stick-around-overlay')).not.toBeNull();
    expect(status?.hidden).toBe(true);

    lastMockPort()?.emit({
      error: 'Playground connection failed.',
      status: 'connecting',
      type: 'ytcq:playground:status'
    });

    expect(status?.textContent).toBe('Connection lost. Trying to reconnect...');
    expect(status?.hidden).toBe(false);

    lastMockPort()?.emit({
      error: 'Playground connection failed.',
      status: 'disconnected',
      type: 'ytcq:playground:status'
    });

    expect(status?.textContent).toBe('Could not reconnect. Open Games to try again.');
    expect(status?.hidden).toBe(false);

    lastMockPort()?.emit(createSnapshotMessage(snapshot));

    expect(status?.hidden).toBe(true);
    expect(status?.textContent).toBe('');
  });

  it('shows system status notices for ended and unavailable Stick Around overlays', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCanvasContext() as unknown as CanvasRenderingContext2D);
    const header = createHeader();
    const feed = document.createElement('yt-live-chat-item-list-renderer');
    document.body.append(header, feed);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    const gamesButton = header.querySelector<HTMLButtonElement>('.ytcq-games-button')!;
    gamesButton.click();
    const game = createStickAroundGame();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [game],
      invites: []
    }));
    getActionButton('Resume').click();

    lastMockPort()?.emit({
      message: {
        gameId: game.gameId,
        reason: 'playerLeft',
        type: 'gameEnded',
        userId: 'server:computer:stick-around'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-stick-around-overlay')).not.toBeNull();
    expect(document.querySelector('.ytcq-stick-around-status')?.textContent).toBe('Opponent left the game.');

    gamesButton.click();
    expect(document.querySelector('.ytcq-games-active-row')).toBeNull();
  });

  it('shows when an active Stick Around game cannot be restored after reconnecting', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(createMockCanvasContext() as unknown as CanvasRenderingContext2D);
    const header = createHeader();
    const feed = document.createElement('yt-live-chat-item-list-renderer');
    document.body.append(header, feed);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: [createStickAroundGame()],
      invites: []
    }));
    getActionButton('Resume').click();

    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      games: []
    }));

    expect(document.querySelector('.ytcq-stick-around-overlay')).not.toBeNull();
    expect(document.querySelector('.ytcq-stick-around-status')?.textContent).toBe('This game could not be restored.');
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
    expect(getGamesSectionTitles()).not.toContain('Start a game');
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
    expect(getActionButton('Connecting').disabled).toBe(true);
    expect(getActionButton('Connecting').querySelector('.ytcq-games-loading-spinner')).not.toBeNull();
    reconnectButton.click();
    expect(lastMockPort()?.messages).toHaveLength(messagesBeforeReconnect + 1);
  });

  it('does not show the game picker heading while a selected game view is disconnected', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });

    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    getGameCard('Chess').click();
    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Chess');
    expect(document.querySelector('.ytcq-profile-card-subtitle')?.textContent).toBe('Invite a player');

    lastMockPort()?.emit({
      error: 'Playground connection failed.',
      status: 'disconnected',
      type: 'ytcq:playground:status'
    });

    expect(document.querySelector('.ytcq-profile-card-title')?.textContent).toBe('Chess');
    expect(document.querySelector('.ytcq-games-connection-notice')?.textContent).toContain('Unable to connect');
    expect(getGamesSectionTitles()).not.toContain('Start a game');
    expect(document.querySelector('.ytcq-games-game-card')).toBeNull();
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
    cleanupStaleGamesUi();
    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(document.querySelector('.ytcq-chess-game-panel')).toBeNull();
  });

  it('removes orphaned game surfaces from a previous content script instance', () => {
    const staleCard = document.createElement('section');
    staleCard.className = 'ytcq-games-card';
    const stalePanel = document.createElement('section');
    stalePanel.className = 'ytcq-game-panel ytcq-chess-game-panel';
    const staleAnimationGhost = document.createElement('section');
    staleAnimationGhost.className = 'ytcq-game-overlay ytcq-game-minimize-ghost';
    const staleMissFeedback = document.createElement('div');
    staleMissFeedback.className = 'ytcq-bounty-hunting-miss-feedback';
    document.body.append(staleCard, stalePanel, staleAnimationGhost, staleMissFeedback);

    cleanupStaleGamesUi();

    expect(document.querySelector('.ytcq-games-card')).toBeNull();
    expect(document.querySelector('.ytcq-game-panel')).toBeNull();
    expect(document.querySelector('.ytcq-game-minimize-ghost')).toBeNull();
    expect(document.querySelector('.ytcq-bounty-hunting-miss-feedback')).toBeNull();
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
    cleanupStaleGamesUi();
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
      mutations: []
    });
    await vi.runOnlyPendingTimersAsync();
    expect(header.querySelector('.ytcq-games-button')).toBeNull();

    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true });
    handleFeatureMutations({
      addedElements: [document.createElement('div')],
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
      availableGames: ['chess', 'bounty-hunting', 'stick-around'],
      languageCode: 'en',
      locale: 'en',
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
      availableGames: ['chess', 'bounty-hunting', 'stick-around'],
      languageCode: 'en',
      locale: 'en',
      streamKey: 'stream-a',
      type: 'ytcq:playground:init'
    });
    expect(document.querySelector('.ytcq-games-availability')?.getAttribute('aria-checked')).toBe('true');

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

    getGameCard('Chess').click();
    getActionButton('Invite').click();
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Waiting for reply...');
    getActionButton('Cancel').click();

    expect(lastMockPort()?.messages.at(-1)).toEqual({
      gameId: 'chess',
      toUserId: 'luna-user',
      type: 'ytcq:playground:cancel-invite'
    });
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Available now');
    expect(getActionButton('Invite')).not.toBeNull();
  });

  it('hands an optimistic invite spinner over to the server invite lifecycle', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });
    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    lastMockPort()?.emit(createSnapshotMessage(createLobbySnapshot()));

    getGameCard('Chess').click();
    getActionButton('Invite').click();
    const outgoingInvite = {
      ...createLobbySnapshot().invites[0],
      fromUser: {
        displayName: 'Me',
        userId: 'me-user'
      },
      inviteId: 'invite-out-1',
      toUser: {
        displayName: 'Luna Chat',
        userId: 'luna-user'
      }
    };
    lastMockPort()?.emit({
      message: {
        invite: outgoingInvite,
        type: 'inviteCreated'
      },
      type: 'ytcq:playground:server-message'
    });
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain(
      'Waiting for reply...'
    );

    lastMockPort()?.emit({
      message: {
        invite: {
          ...outgoingInvite,
          status: 'ignored'
        },
        type: 'inviteUpdated'
      },
      type: 'ytcq:playground:server-message'
    });

    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Available now');
  });

  it('waits for the server to confirm outgoing invite cancellations', () => {
    const header = createHeader();
    document.body.append(header);
    setOptions({ ...DEFAULT_OPTIONS, playgroundEnabled: true, playgroundGamesAvailable: true });
    wireGamesButton();
    header.querySelector<HTMLButtonElement>('.ytcq-games-button')!.click();
    const incomingInvite = createLobbySnapshot().invites[0];
    const outgoingInvite = {
      ...incomingInvite,
      fromUser: {
        displayName: 'Me',
        userId: 'me-user'
      },
      inviteId: 'invite-out-1',
      toUser: {
        displayName: 'Luna Chat',
        userId: 'luna-user'
      }
    };
    lastMockPort()?.emit(createSnapshotMessage({
      ...createLobbySnapshot(),
      invites: [outgoingInvite]
    }));

    getGameCard('Chess').click();
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain('Waiting for reply...');
    getActionButton('Cancel').click();

    expect(lastMockPort()?.messages.at(-1)).toEqual({
      gameId: 'chess',
      toUserId: 'luna-user',
      type: 'ytcq:playground:cancel-invite'
    });
    expect(document.querySelector('.ytcq-games-player-row')?.textContent).toContain(
      'Waiting for reply...'
    );

    lastMockPort()?.emit({
      message: {
        invite: {
          ...outgoingInvite,
          status: 'cancelled'
        },
        type: 'inviteUpdated'
      },
      type: 'ytcq:playground:server-message'
    });

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

function createSnapshotMessage(
  snapshot: LobbySnapshot
): Extract<PlaygroundBackgroundMessage, { type: 'ytcq:playground:snapshot' }> {
  return {
    incompatibleActiveGames: [],
    incompatibleGames: [],
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
        availableGames: ['chess', 'bounty-hunting', 'replay-trivia', 'stick-around'],
        displayName: 'Me',
        joinedAt: Date.now(),
        userId: 'me-user'
      },
      {
        availableGames: ['chess', 'bounty-hunting', 'replay-trivia', 'stick-around'],
        displayName: 'Luna Chat',
        joinedAt: Date.now(),
        userId: 'luna-user'
      },
      {
        availableGames: ['chess', 'bounty-hunting', 'replay-trivia', 'stick-around'],
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
      userId: 'server:computer:chess:beginner'
    },
    {
      availableGames: ['chess'],
      displayName: 'Computer (Club)',
      joinedAt: Date.now(),
      userId: 'server:computer:chess:club'
    },
    {
      availableGames: ['chess'],
      displayName: 'Computer (Master)',
      joinedAt: Date.now(),
      userId: 'server:computer:chess:master'
    },
    {
      availableGames: ['replay-trivia'],
      displayName: 'Computer',
      joinedAt: Date.now(),
      userId: 'server:computer:replay-trivia'
    },
    {
      availableGames: ['bounty-hunting'],
      displayName: 'Computer (Bounty Hunter)',
      joinedAt: Date.now(),
      userId: 'server:computer:bounty-hunting'
    },
    {
      availableGames: ['stick-around'],
      displayName: 'Computer (Stick Around!)',
      joinedAt: Date.now(),
      userId: 'server:computer:stick-around'
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

function createBountyHuntingGame(): PublicGame {
  return {
    bounties: [{
      amount: 50,
      description: 'a message with 3+ emojis',
      id: 'emoji',
      matcher: { kind: 'emojiCount', min: 3 }
    }],
    bountyProviderUserId: 'me-user',
    gameId: 'game-bounty-hunting',
    gameType: 'bounty-hunting',
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
    readyPlayers: {
      guest: true,
      host: true
    },
    roundEndsAt: Date.now() + 60_000,
    scores: {
      guest: 0,
      host: 0
    },
    status: 'active'
  } as PublicGame;
}

function createStickAroundGame(): PublicStickAroundGame {
  return {
    finishReports: {},
    gameId: 'game-stick-around',
    gameType: 'stick-around',
    hazards: [],
    inputs: {},
    phaseStartedAt: Date.now(),
    players: {
      guest: {
        displayName: 'Computer (Stick Around!)',
        userId: 'server:computer:stick-around'
      },
      host: {
        displayName: 'Me',
        userId: 'me-user'
      }
    },
    readyPlayers: {
      guest: true,
      host: true
    },
    roundSeed: 123,
    roundStartedAt: Date.now(),
    status: 'active'
  };
}

function createMockCanvasContext(): Partial<CanvasRenderingContext2D> {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    ellipse: vi.fn(),
    lineTo: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 8 }) as TextMetrics),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn()
  };
}

function getActionButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.ytcq-games-small-action'))
    .find((candidate) => candidate.textContent === label);
  if (!button) throw new Error(`Missing games action button: ${label}`);
  return button;
}

function getDetailCancelButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>('.ytcq-games-detail-cancel');
  if (!button) throw new Error('Missing games detail Cancel button.');
  return button;
}

function getActionButtonLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.ytcq-games-small-action'))
    .map((candidate) => candidate.textContent || '');
}

function getGameCards(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.ytcq-games-game-card'));
}

function getGameCard(label: string): HTMLButtonElement {
  const card = getGameCards().find((candidate) =>
    candidate.querySelector('.ytcq-games-game-label')?.textContent === label
  );
  if (!card) throw new Error(`Missing game card: ${label}`);
  return card;
}

function getGameLabels(root: ParentNode = document): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.ytcq-games-game-label'))
    .map((label) => label.textContent || '');
}

function getGameCardHelpers(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.ytcq-games-game-helper'))
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

function createPointerEvent(type: string, options: {
  clientX: number;
  clientY: number;
  pointerId: number;
}): Event {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true
  });
  Object.defineProperties(event, {
    clientX: { value: options.clientX },
    clientY: { value: options.clientY },
    pointerId: { value: options.pointerId }
  });
  return event;
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
