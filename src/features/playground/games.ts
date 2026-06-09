/**
 * Playground Games experiment.
 *
 * This owns the chat header Games entry point and the lobby surface. Network
 * state comes through the playground client; game-specific rendering stays in
 * game submodules such as chess.
 */
import { registerFeatureLifecycle, type FeatureMutationBatch } from '../../content/lifecycle';
import { createCloseIcon, createGamesIcon } from '../../shared/icons';
import { t } from '../../shared/i18n';
import { ytcqCreateElement } from '../../shared/managed-dom';
import type { Options } from '../../shared/options';
import type { GameId, PresenceUser, PublicGame, PublicInvite } from '../../shared/playground-protocol';
import { getOptions } from '../../shared/state';
import {
  closeChessGamePanel,
  getActiveChessGameId,
  isChessGamePanelOpen,
  isPublicChessGame,
  openChessGamePanel,
  showChessGameEndedNotice,
  updateChessGamePanel
} from './chess';
import {
  getPlaygroundClientState,
  respondToPlaygroundInvite,
  sendPlaygroundGameAction,
  sendPlaygroundInvite,
  setPlaygroundAvailability,
  startPlaygroundClient,
  stopPlaygroundClient,
  subscribePlaygroundClient,
  type PlaygroundClientState
} from './client';

const HEADER_SELECTOR = 'yt-live-chat-header-renderer';
const GAMES_BUTTON_OWNER_ID = `${Date.now()}-${Math.random()}`;

type GamesPanelMode = 'lobby' | 'players';

interface GameDefinition {
  id: GameId;
  labelKey: 'gamesChess';
}

interface GamesPanelState {
  available: boolean;
  invitedPlayer: string;
  mode: GamesPanelMode;
  selectedGameId: GameId | null;
  transport: PlaygroundClientState;
}

const GAMES: readonly GameDefinition[] = [
  { id: 'chess', labelKey: 'gamesChess' }
];
const CHESS_THUMBNAIL_PATH = 'games/chess/thumbnail.png';

let gamesWireTimer: number | null = null;
let activeGamesCard: HTMLElement | null = null;
let activeGamesAnchor: HTMLElement | null = null;
let activeGamesCardCleanup: (() => void) | null = null;
let activeGamesClientCleanup: (() => void) | null = null;
let gamesPanelState: GamesPanelState | null = null;
let shouldOpenNextStartedGame = false;

registerFeatureLifecycle({
  page: {
    boot: refreshGamesButton,
    cleanupStale: cleanupStaleGamesButtons,
    reset: cleanupStaleGamesButtons,
    optionsChanged: handlePlaygroundOptionsChanged
  },
  mutation: { enhance: handlePlaygroundMutations }
});

export function refreshGamesButton(): void {
  if (!getOptions().playgroundEnabled) {
    cleanupStaleGamesButtons();
    return;
  }

  if (getOptions().playgroundGamesAvailable) {
    startPlaygroundClient(true);
  }
  scheduleGamesButtonWire();
}

export function scheduleGamesButtonWire(): void {
  if (gamesWireTimer !== null) return;

  gamesWireTimer = window.setTimeout(() => {
    gamesWireTimer = null;
    wireGamesButton();
  }, 0);
}

export function wireGamesButton(): void {
  if (!getOptions().playgroundEnabled) {
    cleanupStaleGamesButtons();
    return;
  }

  const header = document.querySelector<HTMLElement>(HEADER_SELECTOR);
  if (!header) return;

  const anchor = getGamesHeaderAnchor(header);
  const existing = header.querySelector<HTMLButtonElement>('.ytcq-games-button');
  if (existing?.dataset.ytcqGamesOwner === GAMES_BUTTON_OWNER_ID) {
    moveGamesButton(existing, header, anchor);
    return;
  }

  existing?.remove();
  const button = createGamesButton();
  moveGamesButton(button, header, anchor);
}

export function cleanupStaleGamesButtons(): void {
  if (gamesWireTimer !== null) {
    window.clearTimeout(gamesWireTimer);
    gamesWireTimer = null;
  }
  closeChessGamePanel({ notify: false });
  closeGamesCard();
  activeGamesClientCleanup?.();
  activeGamesClientCleanup = null;
  stopPlaygroundClient();
  document.querySelectorAll<HTMLButtonElement>('.ytcq-games-button').forEach((button) => button.remove());
}

function handlePlaygroundOptionsChanged(previousOptions: Options, nextOptions: Options): void {
  if (!nextOptions.playgroundEnabled) {
    cleanupStaleGamesButtons();
    return;
  }

  if (previousOptions.playgroundGamesAvailable !== nextOptions.playgroundGamesAvailable) {
    setPlaygroundAvailability(nextOptions.playgroundGamesAvailable);
    if (gamesPanelState) {
      gamesPanelState.available = nextOptions.playgroundGamesAvailable;
      renderGamesPanel();
    }
  }

  refreshGamesButton();
}

function handlePlaygroundMutations({ addedElements, mutations }: FeatureMutationBatch): void {
  if (!getOptions().playgroundEnabled) return;

  const shouldWireButton = mutations.some((mutation) => {
    return mutation.type === 'childList' &&
      mutation.target instanceof Element &&
      mutation.target.closest(HEADER_SELECTOR);
  }) || addedElements.some((element) => {
    return element.matches(HEADER_SELECTOR) || Boolean(element.querySelector(HEADER_SELECTOR));
  });

  if (shouldWireButton) scheduleGamesButtonWire();
}

function createGamesButton(): HTMLButtonElement {
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-games-button';
  button.dataset.ytcqGamesOwner = GAMES_BUTTON_OWNER_ID;
  button.title = t('games');
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', t('games'));
  button.append(createGamesIcon());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleGamesCard(button);
  }, true);
  return button;
}

function toggleGamesCard(anchor: HTMLElement): void {
  if (activeGamesCard) {
    closeGamesCard();
    return;
  }

  openGamesCard(anchor);
}

function openGamesCard(anchor: HTMLElement): void {
  closeGamesCard();

  const card = ytcqCreateElement('section');
  card.className = 'ytcq-profile-card ytcq-games-card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', t('games'));

  const header = ytcqCreateElement('div');
  header.className = 'ytcq-profile-card-header ytcq-games-card-header';

  const icon = ytcqCreateElement('span');
  icon.className = 'ytcq-games-card-icon';
  icon.append(createGamesIcon());

  const titleWrap = ytcqCreateElement('div');
  titleWrap.className = 'ytcq-profile-card-title-wrap';

  const titleRow = ytcqCreateElement('div');
  titleRow.className = 'ytcq-games-title-row';

  const title = ytcqCreateElement('div');
  title.className = 'ytcq-profile-card-title';
  title.textContent = t('games');

  const betaBadge = ytcqCreateElement('span');
  betaBadge.className = 'ytcq-games-beta-badge';
  betaBadge.textContent = 'Beta';

  const subtitle = ytcqCreateElement('div');
  subtitle.className = 'ytcq-profile-card-subtitle';
  subtitle.textContent = t('playground');

  const closeButton = createGamesCardCloseButton();
  titleRow.append(title, betaBadge);
  titleWrap.append(titleRow, subtitle);
  header.append(icon, titleWrap, closeButton);

  const body = ytcqCreateElement('div');
  body.className = 'ytcq-profile-card-messages ytcq-games-card-body';

  card.append(header, body);
  document.body.append(card);
  activeGamesCard = card;
  activeGamesAnchor = anchor;
  gamesPanelState = createInitialGamesPanelState();
  startPlaygroundClient(gamesPanelState.available);
  ensureGamesClientSubscription();
  renderGamesPanel();
  setGamesButtonExpanded(anchor, true);
  positionGamesCard(card, anchor);

  const handleOutsideClick = (event: MouseEvent): void => {
    if (activeGamesCard?.contains(event.target as Node)) return;
    if ((event.target as Element | null)?.closest?.('.ytcq-games-button')) return;
    closeGamesCard();
  };
  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeGamesCard();
  };
  const handleResize = (): void => {
    if (!activeGamesCard) return;
    positionGamesCard(activeGamesCard, activeGamesAnchor || undefined);
  };
  const cardListeners = new AbortController();

  activeGamesCardCleanup = () => {
    cardListeners.abort();
  };

  window.setTimeout(() => {
    const options = { capture: true, signal: cardListeners.signal };
    document.addEventListener('click', handleOutsideClick, options);
    document.addEventListener('keydown', handleKeydown, options);
    window.addEventListener('resize', handleResize, options);
  }, 0);
}

function closeGamesCard(): void {
  activeGamesCardCleanup?.();
  activeGamesCardCleanup = null;
  activeGamesCard?.remove();
  activeGamesCard = null;
  gamesPanelState = null;
  setGamesButtonExpanded(activeGamesAnchor, false);
  activeGamesAnchor = null;
}

function ensureGamesClientSubscription(): void {
  activeGamesClientCleanup ||= subscribePlaygroundClient(handlePlaygroundClientStateChanged);
}

function createInitialGamesPanelState(): GamesPanelState {
  return {
    available: getOptions().playgroundGamesAvailable,
    invitedPlayer: '',
    mode: 'lobby',
    selectedGameId: null,
    transport: getPlaygroundClientState()
  };
}

function handlePlaygroundClientStateChanged(nextState: PlaygroundClientState): void {
  if (!gamesPanelState) {
    updateOpenChessGame(nextState);
    return;
  }

  gamesPanelState.transport = nextState;
  gamesPanelState.available = isCurrentUserAvailable(nextState);
  updateOpenChessGame(nextState);

  if (shouldOpenNextStartedGame) {
    const game = getFirstSupportedGame(nextState.games);
    if (game) {
      shouldOpenNextStartedGame = false;
      openSupportedGamePanel(game, nextState.userId);
      closeGamesCard();
      return;
    }
  }

  renderGamesPanel();
}

function renderGamesPanel(): void {
  if (!activeGamesCard || !gamesPanelState) return;

  updateGamesCardHeader();
  const body = activeGamesCard.querySelector<HTMLElement>('.ytcq-games-card-body');
  if (!body) return;

  body.replaceChildren();
  if (shouldShowTransportNotice()) {
    body.append(createTransportNotice());
    return;
  }

  if (gamesPanelState.mode === 'players') {
    renderPlayWithView(body);
    return;
  }

  renderLobbyView(body);
}

function updateGamesCardHeader(): void {
  if (!activeGamesCard || !gamesPanelState) return;

  const title = activeGamesCard.querySelector<HTMLElement>('.ytcq-profile-card-title');
  const subtitle = activeGamesCard.querySelector<HTMLElement>('.ytcq-profile-card-subtitle');
  const betaBadge = activeGamesCard.querySelector<HTMLElement>('.ytcq-games-beta-badge');
  if (!title || !subtitle) return;

  if (gamesPanelState.mode === 'players' && gamesPanelState.selectedGameId) {
    title.textContent = getGameLabel(gamesPanelState.selectedGameId);
    subtitle.textContent = t('gamesPlayWith');
    if (betaBadge) betaBadge.hidden = true;
    return;
  }

  title.textContent = t('games');
  if (betaBadge) betaBadge.hidden = false;
  if (shouldShowTransportNotice()) {
    subtitle.textContent = gamesPanelState.transport.status === 'connecting'
      ? t('gamesConnectingTitle')
      : t('gamesUnavailableTitle');
    return;
  }

  subtitle.textContent = t('gamesPlayersOnline', { count: getOnlinePlayerCount() });
}

function renderLobbyView(body: HTMLElement): void {
  body.append(
    createAvailabilitySection(),
    createActiveGameSection(),
    createInvitesSection(),
    createGamesGrid()
  );
}

function shouldShowTransportNotice(): boolean {
  if (!gamesPanelState) return false;
  return gamesPanelState.transport.status !== 'connected';
}

function createTransportNotice(): HTMLElement {
  const notice = ytcqCreateElement('section');
  notice.className = 'ytcq-games-connection-notice';
  notice.setAttribute('role', gamesPanelState?.transport.status === 'connecting' ? 'status' : 'alert');
  notice.setAttribute('aria-live', 'polite');

  const title = ytcqCreateElement('div');
  title.className = 'ytcq-games-row-title';
  title.textContent = gamesPanelState?.transport.status === 'connecting'
    ? t('gamesConnectingNoticeTitle')
    : t('gamesUnavailableNoticeTitle');

  const helper = ytcqCreateElement('div');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = gamesPanelState?.transport.status === 'connecting'
    ? t('gamesConnectingHelper')
    : getUnavailableNoticeHelper();

  const refresh = createSmallActionButton(t('gamesReconnect'));
  refresh.addEventListener('click', () => {
    if (!gamesPanelState || gamesPanelState.transport.status === 'connecting') return;
    startPlaygroundClient(gamesPanelState.available);
  });
  refresh.hidden = gamesPanelState?.transport.status === 'connecting';

  notice.append(title, helper, refresh);
  return notice;
}

function getUnavailableNoticeHelper(): string {
  const helper = t('gamesUnavailableHelper');
  const error = gamesPanelState?.transport.error.trim();
  return error ? `${error} ${helper}` : helper;
}

function createAvailabilitySection(): HTMLElement {
  const section = createGamesSection(t('gamesAvailability'));
  const item = ytcqCreateElement('div');
  item.className = 'ytcq-games-availability';

  const copy = ytcqCreateElement('span');
  copy.className = 'ytcq-games-section-copy';
  const title = ytcqCreateElement('span');
  title.className = 'ytcq-games-row-title';
  title.textContent = t('gamesAvailableToPlay');
  const helper = ytcqCreateElement('span');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = t('gamesAvailableHelper');
  copy.append(title, helper);

  const toggle = createGamesAvailabilityToggle();
  item.append(copy, toggle);
  section.append(item);
  return section;
}

function createGamesAvailabilityToggle(): HTMLButtonElement {
  const toggle = ytcqCreateElement('button');
  toggle.type = 'button';
  toggle.className = 'ytcq-games-availability-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', t('gamesAvailableToPlay'));
  toggle.setAttribute('aria-checked', String(Boolean(gamesPanelState?.available)));

  const track = ytcqCreateElement('span');
  track.className = 'ytcq-menu-toggle';
  track.setAttribute('aria-hidden', 'true');
  toggle.append(track);
  toggle.addEventListener('click', () => {
    if (!gamesPanelState) return;
    gamesPanelState.available = !gamesPanelState.available;
    setPlaygroundAvailability(gamesPanelState.available);
    toggle.setAttribute('aria-checked', String(gamesPanelState.available));
  });
  return toggle;
}

function createActiveGameSection(): HTMLElement {
  const section = createGamesSection(t('gamesActiveGame'));
  const game = getFirstSupportedGame(gamesPanelState?.transport.games || []);
  if (!game || !gamesPanelState?.transport.userId) {
    section.hidden = true;
    return section;
  }

  const item = ytcqCreateElement('div');
  item.className = 'ytcq-games-active-row';
  const copy = ytcqCreateElement('span');
  copy.className = 'ytcq-games-section-copy';
  const title = ytcqCreateElement('span');
  title.className = 'ytcq-games-row-title';
  title.textContent = getGameLabel(game.gameType);
  const helper = ytcqCreateElement('span');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = getGameOpponentLabel(game, gamesPanelState.transport.userId);
  copy.append(title, helper);

  const actions = ytcqCreateElement('span');
  actions.className = 'ytcq-games-row-actions';
  const isPanelOpen = isChessGamePanelOpen();
  const togglePanel = createSmallActionButton(t(isPanelOpen ? 'gamesMinimize' : 'gamesResume'));
  togglePanel.addEventListener('click', () => {
    if (!gamesPanelState?.transport.userId) return;
    if (isChessGamePanelOpen() && getActiveChessGameId() === game.gameId) {
      closeChessGamePanel();
      return;
    }

    openSupportedGamePanel(game, gamesPanelState.transport.userId);
    closeGamesCard();
  });
  const leave = createSmallActionButton(t('gamesLeave'));
  leave.addEventListener('click', () => {
    if (!gamesPanelState || !isPublicChessGame(game)) return;
    closeChessGamePanel({ notify: false });
    sendPlaygroundGameAction(game.gameId, 'leave');
  });
  actions.append(togglePanel, leave);
  item.append(copy, actions);
  section.append(item);
  return section;
}

function createInvitesSection(): HTMLElement {
  const section = createGamesSection(t('gamesInvites'));
  const invites = getPendingInvites();
  if (!invites.length) {
    const empty = createGamesEmpty(t('gamesNoInvites'));
    section.append(empty);
    return section;
  }

  invites.forEach((invite) => {
    section.append(createInviteRow(invite));
  });
  return section;
}

function createInviteRow(invite: PublicInvite): HTMLElement {
  const item = ytcqCreateElement('div');
  item.className = 'ytcq-games-invite-row';
  const copy = ytcqCreateElement('span');
  copy.className = 'ytcq-games-section-copy';
  const title = ytcqCreateElement('span');
  title.className = 'ytcq-games-row-title';
  title.textContent = t('gamesInviteFrom', {
    game: getGameLabel(invite.gameId),
    user: invite.fromUser.displayName
  });
  const helper = ytcqCreateElement('span');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = t('gamesInviteHelper');
  copy.append(title, helper);

  const actions = ytcqCreateElement('span');
  actions.className = 'ytcq-games-row-actions';
  const accept = createSmallActionButton(t('gamesAccept'));
  accept.addEventListener('click', () => {
    shouldOpenNextStartedGame = true;
    respondToPlaygroundInvite(invite.inviteId, true);
  });
  const ignore = createSmallActionButton(t('gamesIgnore'));
  ignore.addEventListener('click', () => {
    respondToPlaygroundInvite(invite.inviteId, false);
  });
  actions.append(accept, ignore);
  item.append(copy, actions);
  return item;
}

function createGamesGrid(): HTMLElement {
  const section = createGamesSection(t('gamesStartGame'));
  const grid = ytcqCreateElement('div');
  grid.className = 'ytcq-games-grid';

  GAMES.forEach((game) => {
    const card = ytcqCreateElement('button');
    card.type = 'button';
    card.className = 'ytcq-games-game-card';
    card.append(createGamePreview(game.id), createGameCardLabel(getGameLabel(game.id)));
    card.addEventListener('click', () => {
      if (!gamesPanelState) return;
      gamesPanelState.mode = 'players';
      gamesPanelState.selectedGameId = game.id;
      gamesPanelState.invitedPlayer = '';
      renderGamesPanel();
    });
    grid.append(card);
  });

  section.append(grid);
  return section;
}

function renderPlayWithView(body: HTMLElement): void {
  const nav = ytcqCreateElement('div');
  nav.className = 'ytcq-games-detail-nav';
  const back = createSmallActionButton(t('gamesBack'));
  back.addEventListener('click', () => {
    if (!gamesPanelState) return;
    gamesPanelState.mode = 'lobby';
    gamesPanelState.selectedGameId = null;
    gamesPanelState.invitedPlayer = '';
    renderGamesPanel();
  });
  nav.append(back);

  const section = createGamesSection(t('gamesPlayers'));
  const list = ytcqCreateElement('div');
  list.className = 'ytcq-games-player-list';
  const players = getAvailablePlayers(gamesPanelState?.selectedGameId || 'chess');
  if (!players.length) {
    list.append(createGamesEmpty(t('gamesNoPlayersAvailable')));
  }
  players.forEach((player) => {
    list.append(createPlayerRow(player));
  });
  section.append(list);
  body.append(nav, section);
}

function createPlayerRow(player: PresenceUser): HTMLElement {
  const row = ytcqCreateElement('div');
  row.className = 'ytcq-games-player-row';

  const avatar = ytcqCreateElement('span');
  avatar.className = 'ytcq-games-player-avatar';
  avatar.textContent = getPlayerInitial(player.displayName);

  const copy = ytcqCreateElement('span');
  copy.className = 'ytcq-games-section-copy';
  const title = ytcqCreateElement('span');
  title.className = 'ytcq-games-row-title';
  title.textContent = player.displayName;
  const helper = ytcqCreateElement('span');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = gamesPanelState?.invitedPlayer === player.userId
    ? t('gamesWaitingForReply')
    : t('gamesAvailableNow');
  copy.append(title, helper);

  const actions = ytcqCreateElement('span');
  actions.className = 'ytcq-games-row-actions';
  const action = createSmallActionButton(gamesPanelState?.invitedPlayer === player.userId ? t('gamesCancelInvite') : t('gamesInvite'));
  action.addEventListener('click', () => {
    if (!gamesPanelState?.selectedGameId) return;
    if (gamesPanelState.invitedPlayer === player.userId) {
      gamesPanelState.invitedPlayer = '';
      renderGamesPanel();
      return;
    }

    gamesPanelState.invitedPlayer = player.userId;
    shouldOpenNextStartedGame = true;
    sendPlaygroundInvite(gamesPanelState.selectedGameId, player.userId);
    renderGamesPanel();
  });
  actions.append(action);
  row.append(avatar, copy, actions);
  return row;
}

function createGamesCardCloseButton(): HTMLButtonElement {
  const closeButton = ytcqCreateElement('button');
  closeButton.type = 'button';
  closeButton.className = 'ytcq-profile-card-header-button ytcq-profile-card-close';
  closeButton.setAttribute('aria-label', t('close'));
  closeButton.append(createCloseIcon());
  closeButton.addEventListener('click', closeGamesCard);
  return closeButton;
}

function setGamesButtonExpanded(anchor: HTMLElement | null | undefined, expanded: boolean): void {
  if (anchor instanceof HTMLButtonElement && anchor.classList.contains('ytcq-games-button')) {
    anchor.setAttribute('aria-expanded', String(expanded));
  }
}

function createGamesSection(titleText: string): HTMLElement {
  const section = ytcqCreateElement('section');
  section.className = 'ytcq-games-section';
  section.append(createGamesSectionTitle(titleText));
  return section;
}

function createGamesSectionTitle(titleText: string): HTMLElement {
  const title = ytcqCreateElement('div');
  title.className = 'ytcq-games-section-title';
  title.textContent = titleText;
  return title;
}

function createGamesEmpty(textContent: string): HTMLElement {
  const empty = ytcqCreateElement('div');
  empty.className = 'ytcq-games-section-empty';
  empty.textContent = textContent;
  return empty;
}

function createSmallActionButton(label: string): HTMLButtonElement {
  const button = ytcqCreateElement('button');
  button.type = 'button';
  button.className = 'ytcq-games-small-action';
  button.textContent = label;
  return button;
}

function createGameCardLabel(label: string): HTMLElement {
  const text = ytcqCreateElement('span');
  text.className = 'ytcq-games-game-label';
  text.textContent = label;
  return text;
}

function createGamePreview(gameId: GameId): HTMLElement {
  const preview = ytcqCreateElement('span');
  preview.className = `ytcq-games-preview ytcq-games-preview-${gameId}`;

  const image = ytcqCreateElement('img');
  image.className = 'ytcq-games-preview-image';
  image.alt = '';
  image.decoding = 'async';
  image.loading = 'eager';
  image.src = chrome.runtime.getURL(CHESS_THUMBNAIL_PATH);
  preview.append(image);
  return preview;
}

function getGameLabel(gameId: GameId): string {
  return t(GAMES.find((game) => game.id === gameId)?.labelKey || 'games');
}

function getOnlinePlayerCount(): number {
  const users = gamesPanelState?.transport.users || [];
  const currentUserId = gamesPanelState?.transport.userId || '';
  return users
    .filter((user) => user.userId !== currentUserId)
    .filter(isUserAvailableForSupportedGame)
    .length;
}

function isCurrentUserAvailable(state: PlaygroundClientState): boolean {
  const currentUser = state.users.find((user) => user.userId === state.userId);
  return currentUser?.availableGames.includes('chess') ?? gamesPanelState?.available ?? false;
}

function getPendingInvites(): PublicInvite[] {
  const currentUserId = gamesPanelState?.transport.userId || '';
  return (gamesPanelState?.transport.invites || [])
    .filter((invite) => invite.status === 'pending' && invite.toUser.userId === currentUserId);
}

function getAvailablePlayers(gameId: GameId): PresenceUser[] {
  const currentUserId = gamesPanelState?.transport.userId || '';
  return (gamesPanelState?.transport.users || [])
    .filter((user) => user.userId !== currentUserId && user.availableGames.includes(gameId));
}

function isUserAvailableForSupportedGame(user: PresenceUser): boolean {
  return GAMES.some((game) => user.availableGames.includes(game.id));
}

function getFirstSupportedGame(games: PublicGame[]): PublicGame | null {
  return games.find((game) => GAMES.some((definition) => definition.id === game.gameType)) || null;
}

function getGameOpponentLabel(game: PublicGame, currentUserId: string): string {
  if (isPublicChessGame(game)) {
    const opponent = game.players.white.userId === currentUserId
      ? game.players.black
      : game.players.white;
    return opponent.displayName || 'Player';
  }

  return 'Player';
}

function openSupportedGamePanel(game: PublicGame, currentUserId: string): void {
  if (!isPublicChessGame(game)) return;
  openChessGamePanel(game, currentUserId, (gameId, from, to, promotion) => {
    sendPlaygroundGameAction(gameId, 'move', promotion ? { from, promotion, to } : { from, to });
  }, renderGamesPanel);
}

function updateOpenChessGame(nextState: PlaygroundClientState): void {
  const activeChessGameId = getActiveChessGameId();
  if (!activeChessGameId || !nextState.userId) return;

  if (nextState.endedGame?.gameId === activeChessGameId) {
    if (nextState.endedGame.userId === nextState.userId) {
      closeChessGamePanel({ notify: false });
    } else {
      showChessGameEndedNotice(t('gamesOpponentLeft'));
    }
    return;
  }

  const game = nextState.games.find((candidate) => candidate.gameId === activeChessGameId);
  if (isPublicChessGame(game)) {
    updateChessGamePanel(game, nextState.userId);
  }
}

function getPlayerInitial(player: string): string {
  const handle = player.replace(/^@/, '').trim();
  return (handle[0] || '?').toUpperCase();
}

function getGamesHeaderAnchor(header: HTMLElement): HTMLElement | null {
  return header.querySelector<HTMLElement>('.ytcq-inbox-button') ||
    header.querySelector<HTMLElement>('#live-chat-header-context-menu') ||
    getDirectHeaderChild(header, header.querySelector<HTMLElement>('button[aria-label="More options"]')) ||
    getDirectHeaderChild(header, header.querySelector<HTMLElement>('button[title="More options"]')) ||
    header.querySelector<HTMLElement>('#close-button');
}

function getDirectHeaderChild(header: HTMLElement, element: HTMLElement | null): HTMLElement | null {
  if (!element) return null;

  let current: HTMLElement | null = element;
  while (current && current.parentElement !== header) {
    current = current.parentElement;
  }

  return current;
}

function moveGamesButton(button: HTMLButtonElement, header: HTMLElement, anchor: HTMLElement | null): void {
  if (anchor?.classList.contains('ytcq-inbox-button')) {
    if (button.nextElementSibling !== anchor) anchor.before(button);
    return;
  }

  if (anchor && anchor !== button && button.nextElementSibling !== anchor) {
    anchor.before(button);
  } else if (!anchor && button.parentElement !== header) {
    header.append(button);
  }
}

function positionGamesCard(card: HTMLElement, anchor?: HTMLElement): void {
  const margin = 8;
  const cardRect = card.getBoundingClientRect();
  const width = cardRect.width;
  const height = cardRect.height;
  const anchorRect = anchor?.isConnected
    ? anchor.getBoundingClientRect()
    : {
        left: window.innerWidth - margin,
        right: window.innerWidth - margin,
        top: margin,
        bottom: margin
      };

  let left = anchorRect.right - width;
  if (left < margin) {
    left = anchorRect.left;
  }
  if (left + width + margin > window.innerWidth) {
    left = window.innerWidth - width - margin;
  }

  let top = anchorRect.bottom + margin;
  if (top + height + margin > window.innerHeight) {
    top = anchorRect.top - height - margin;
  }

  card.style.left = `${Math.max(margin, Math.round(left))}px`;
  card.style.top = `${Math.max(margin, Math.round(top))}px`;
}
