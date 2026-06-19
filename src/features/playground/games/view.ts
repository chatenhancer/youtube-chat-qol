/**
 * Games lobby view rendering.
 *
 * Builds the availability, invite, active-game, game-picker, and player-list
 * DOM for the Games panel. All mutations that affect network or panel state are
 * delegated through `GamesViewActions`.
 */
import { createChevronBackwardIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { ytcqCreateElement } from '../../../shared/managed-dom';
import { getPlaygroundAvatarPresentation } from '../../../shared/playground/identity';
import type { GameId, PresenceUser, PublicGame, PublicInvite } from '../../../shared/playground/protocol';
import {
  getActiveGamePanelId,
  getGamePickerCards,
  getGameLabel,
  getGameOpponentLabel
} from './registry';
import {
  getAvailablePlayers,
  getOnlinePlayerCount,
  getPendingInvites,
  getSupportedGames,
  shouldShowTransportNotice,
  type GamesPanelState
} from './state';

export interface GamesViewActions {
  onAcceptInvite: (invite: PublicInvite) => void;
  onBackToLobby: () => void;
  onCancelInvite: (player: PresenceUser) => void;
  onCycleActiveGame: (step: number) => void;
  onIgnoreInvite: (invite: PublicInvite) => void;
  onInvitePlayer: (player: PresenceUser) => void;
  onLeaveGame: (game: PublicGame) => void;
  onReconnect: () => void;
  onSelectGame: (gameId: GameId) => void;
  onSetAvailability: (available: boolean) => void;
  onToggleActiveGame: (game: PublicGame) => void;
}

export function updateGamesCardHeader(card: HTMLElement, state: GamesPanelState): void {
  const title = card.querySelector<HTMLElement>('.ytcq-profile-card-title');
  const subtitle = card.querySelector<HTMLElement>('.ytcq-profile-card-subtitle');
  const betaBadge = card.querySelector<HTMLElement>('.ytcq-games-beta-badge');
  if (!title || !subtitle) return;

  if (state.mode === 'players' && state.selectedGameId) {
    title.textContent = getGameLabel(state.selectedGameId);
    subtitle.textContent = t('gamesPlayWith');
    if (betaBadge) betaBadge.hidden = true;
    return;
  }

  title.textContent = t('games');
  if (betaBadge) betaBadge.hidden = false;
  if (shouldShowTransportNotice(state)) {
    subtitle.textContent = state.transport.status === 'connecting'
      ? t('gamesConnectingTitle')
      : t('gamesUnavailableTitle');
    return;
  }

  subtitle.textContent = t('gamesPlayersOnline', { count: getOnlinePlayerCount(state) });
}

export function renderGamesPanelBody(body: HTMLElement, state: GamesPanelState, actions: GamesViewActions): void {
  body.replaceChildren();
  if (shouldShowTransportNotice(state)) {
    body.append(createTransportNotice(state, actions));
    return;
  }

  if (state.mode === 'players') {
    renderPlayWithView(body, state, actions);
    return;
  }

  renderLobbyView(body, state, actions);
}

function renderLobbyView(body: HTMLElement, state: GamesPanelState, actions: GamesViewActions): void {
  body.append(
    createAvailabilitySection(state, actions),
    createActiveGameSection(state, actions),
    createInvitesSection(state, actions),
    createGamesGrid(actions)
  );
}

function createTransportNotice(state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const notice = ytcqCreateElement('section');
  notice.className = 'ytcq-games-connection-notice';
  notice.setAttribute('role', state.transport.status === 'connecting' ? 'status' : 'alert');
  notice.setAttribute('aria-live', 'polite');

  const title = ytcqCreateElement('div');
  title.className = 'ytcq-games-row-title';
  title.textContent = state.transport.status === 'connecting'
    ? t('gamesConnectingNoticeTitle')
    : t('gamesUnavailableNoticeTitle');

  const helper = ytcqCreateElement('div');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = state.transport.status === 'connecting'
    ? t('gamesConnectingHelper')
    : getUnavailableNoticeHelper(state);

  const refresh = createSmallActionButton(t('gamesReconnect'));
  refresh.addEventListener('click', () => {
    if (state.transport.status === 'connecting') return;
    actions.onReconnect();
  });
  refresh.hidden = state.transport.status === 'connecting';

  notice.append(title, helper, refresh);
  return notice;
}

function getUnavailableNoticeHelper(state: GamesPanelState): string {
  const helper = t('gamesUnavailableHelper');
  const error = state.transport.error.trim();
  return error ? `${error} ${helper}` : helper;
}

function createAvailabilitySection(state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const section = createGamesSection();
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

  const toggle = createGamesAvailabilityToggle(state, actions);
  item.append(copy, toggle);
  section.append(item);
  return section;
}

function createGamesAvailabilityToggle(state: GamesPanelState, actions: GamesViewActions): HTMLButtonElement {
  const toggle = ytcqCreateElement('button');
  toggle.type = 'button';
  toggle.className = 'ytcq-games-availability-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', t('gamesAvailableToPlay'));
  toggle.setAttribute('aria-checked', String(state.available));

  const track = ytcqCreateElement('span');
  track.className = 'ytcq-menu-toggle';
  track.setAttribute('aria-hidden', 'true');
  toggle.append(track);
  toggle.addEventListener('click', () => {
    const nextAvailable = !state.available;
    state.available = nextAvailable;
    actions.onSetAvailability(nextAvailable);
    toggle.setAttribute('aria-checked', String(nextAvailable));
  });
  return toggle;
}

function createActiveGameSection(state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const section = createGamesSection();
  const games = getSupportedGames(state.transport.games);
  if (!games.length || !state.transport.userId) {
    section.hidden = true;
    return section;
  }

  const gameIndex = getClampedActiveGameIndex(state.activeGameIndex, games.length);
  const game = games[gameIndex];
  section.append(
    createActiveGameHeader(games, gameIndex, state.transport.userId, actions),
    createActiveGameRow(game, state.transport.userId, actions)
  );
  return section;
}

function createActiveGameHeader(
  games: PublicGame[],
  gameIndex: number,
  currentUserId: string,
  actions: GamesViewActions
): HTMLElement {
  const header = ytcqCreateElement('div');
  header.className = 'ytcq-games-section-header';
  header.append(createGamesSectionTitle(t('gamesActiveGame')));
  if (games.length <= 1) return header;

  const previousGame = games[getWrappedIndex(gameIndex - 1, games.length)];
  const nextGame = games[getWrappedIndex(gameIndex + 1, games.length)];
  const controls = ytcqCreateElement('span');
  controls.className = 'ytcq-games-active-controls';
  const previous = createCycleButton(getActiveGameControlLabel(previousGame, currentUserId), () => {
    actions.onCycleActiveGame(-1);
  });
  const count = ytcqCreateElement('span');
  count.className = 'ytcq-games-active-count';
  count.textContent = `${gameIndex + 1}/${games.length}`;
  const next = createCycleButton(getActiveGameControlLabel(nextGame, currentUserId), () => {
    actions.onCycleActiveGame(1);
  }, 'next');
  controls.append(previous, count, next);
  header.append(controls);
  return header;
}

function createActiveGameRow(game: PublicGame, currentUserId: string, actions: GamesViewActions): HTMLElement {
  const item = ytcqCreateElement('div');
  item.className = 'ytcq-games-active-row';
  const copy = ytcqCreateElement('span');
  copy.className = 'ytcq-games-section-copy';
  const title = ytcqCreateElement('span');
  title.className = 'ytcq-games-row-title';
  title.textContent = getGameLabel(game.gameType);
  const helper = ytcqCreateElement('span');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = getGameOpponentLabel(game, currentUserId);
  copy.append(title, helper);

  const actionsWrap = ytcqCreateElement('span');
  actionsWrap.className = 'ytcq-games-row-actions';
  const isPanelOpen = getActiveGamePanelId() === game.gameId;
  const togglePanel = createSmallActionButton(t(isPanelOpen ? 'gamesHide' : 'gamesResume'));
  togglePanel.addEventListener('click', () => actions.onToggleActiveGame(game));
  const leave = createSmallActionButton(t('gamesLeave'));
  leave.addEventListener('click', () => actions.onLeaveGame(game));
  actionsWrap.append(togglePanel, leave);
  item.append(copy, actionsWrap);
  return item;
}

function getActiveGameControlLabel(game: PublicGame, currentUserId: string): string {
  return `${getGameLabel(game.gameType)} - ${getGameOpponentLabel(game, currentUserId)}`;
}

function createInvitesSection(state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const section = createGamesSection(t('gamesInvites'));
  const invites = getPendingInvites(state);
  if (!invites.length) {
    const empty = createGamesEmpty(t('gamesNoInvites'));
    section.append(empty);
    return section;
  }

  invites.forEach((invite) => {
    section.append(createInviteRow(invite, actions));
  });
  return section;
}

function createInviteRow(invite: PublicInvite, actions: GamesViewActions): HTMLElement {
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

  const actionsWrap = ytcqCreateElement('span');
  actionsWrap.className = 'ytcq-games-row-actions';
  const accept = createSmallActionButton(t('gamesAccept'));
  accept.addEventListener('click', () => actions.onAcceptInvite(invite));
  const ignore = createSmallActionButton(t('gamesIgnore'));
  ignore.addEventListener('click', () => actions.onIgnoreInvite(invite));
  actionsWrap.append(accept, ignore);
  item.append(copy, actionsWrap);
  return item;
}

function createGamesGrid(
  actions: GamesViewActions,
  { includeRealtime = true }: { includeRealtime?: boolean } = {}
): HTMLElement {
  const section = createGamesSection(t('gamesStartGame'));
  const grid = ytcqCreateElement('div');
  grid.className = 'ytcq-games-grid';

  getGamePickerCards({ includeRealtime }).forEach((game) => {
    const card = ytcqCreateElement('button');
    card.type = 'button';
    card.className = 'ytcq-games-game-card';
    card.classList.toggle('ytcq-games-game-card-disabled', game.disabled);
    card.setAttribute('aria-disabled', String(game.disabled));
    if (game.disabled && game.disabledReason) {
      card.title = game.disabledReason;
      card.setAttribute('aria-label', `${game.label}. ${game.disabledReason}`);
    }
    card.append(createGamePreview(game.id, game.renderPreview), createGameCardLabel(game.label));
    if (!game.disabled) {
      card.addEventListener('click', () => actions.onSelectGame(game.id));
    }
    grid.append(card);
  });

  section.append(grid);
  return section;
}

function renderPlayWithView(body: HTMLElement, state: GamesPanelState, actions: GamesViewActions): void {
  const nav = ytcqCreateElement('div');
  nav.className = 'ytcq-games-detail-nav';
  const back = createSmallActionButton(t('gamesBack'));
  back.addEventListener('click', actions.onBackToLobby);
  nav.append(back);

  const section = createGamesSection(t('gamesPlayers'));
  const list = ytcqCreateElement('div');
  list.className = 'ytcq-games-player-list';
  const players = state.selectedGameId ? getAvailablePlayers(state, state.selectedGameId) : [];
  if (!players.length) {
    list.append(createGamesEmpty(t('gamesNoPlayersAvailable')));
  }
  players.forEach((player) => {
    list.append(createPlayerRow(player, state, actions));
  });
  section.append(list);
  body.append(nav, section);
}

function createPlayerRow(player: PresenceUser, state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const row = ytcqCreateElement('div');
  row.className = 'ytcq-games-player-row';

  const avatar = ytcqCreateElement('span');
  avatar.className = 'ytcq-games-player-avatar';
  const avatarPresentation = getPlaygroundAvatarPresentation(player);
  avatar.textContent = avatarPresentation.initial;
  avatar.style.setProperty('--ytcq-games-player-avatar-bg', avatarPresentation.backgroundColor);
  avatar.style.setProperty('--ytcq-games-player-avatar-fg', avatarPresentation.foregroundColor);

  const copy = ytcqCreateElement('span');
  copy.className = 'ytcq-games-section-copy';
  const title = ytcqCreateElement('span');
  title.className = 'ytcq-games-row-title';
  title.textContent = player.displayName;
  const helper = ytcqCreateElement('span');
  helper.className = 'ytcq-games-row-helper';
  helper.textContent = state.invitedPlayer === player.userId
    ? t('gamesWaitingForReply')
    : t('gamesAvailableNow');
  copy.append(title, helper);

  const actionsWrap = ytcqCreateElement('span');
  actionsWrap.className = 'ytcq-games-row-actions';
  const action = createSmallActionButton(state.invitedPlayer === player.userId ? t('gamesCancelInvite') : t('gamesInvite'));
  action.addEventListener('click', () => {
    if (state.invitedPlayer === player.userId) {
      actions.onCancelInvite(player);
      return;
    }

    actions.onInvitePlayer(player);
  });
  actionsWrap.append(action);
  row.append(avatar, copy, actionsWrap);
  return row;
}

function createGamesSection(titleText?: string): HTMLElement {
  const section = ytcqCreateElement('section');
  section.className = 'ytcq-games-section';
  if (titleText) section.append(createGamesSectionTitle(titleText));
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

function createCycleButton(
  targetLabel: string,
  onClick: () => void,
  direction: 'next' | 'previous' = 'previous'
): HTMLButtonElement {
  const button = createSmallActionButton('');
  button.classList.add('ytcq-games-cycle-action');
  if (direction === 'next') button.classList.add('ytcq-games-cycle-action-next');
  button.setAttribute('aria-label', targetLabel);
  button.title = targetLabel;
  button.append(createChevronBackwardIcon());
  button.addEventListener('click', onClick);
  return button;
}

function getClampedActiveGameIndex(index: number, length: number): number {
  if (length <= 1) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function getWrappedIndex(index: number, length: number): number {
  return (index + length) % length;
}

function createGameCardLabel(label: string): HTMLElement {
  const text = ytcqCreateElement('span');
  text.className = 'ytcq-games-game-label';
  text.textContent = label;
  return text;
}

function createGamePreview(gameId: string, renderPreview: (container: HTMLElement) => void): HTMLElement {
  const preview = ytcqCreateElement('span');
  preview.className = `ytcq-games-preview ytcq-games-preview-${gameId}`;
  renderPreview(preview);
  return preview;
}
