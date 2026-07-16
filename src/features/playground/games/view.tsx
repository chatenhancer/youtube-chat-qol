/**
 * Games lobby view rendering.
 *
 * Builds the availability, invite, active-game, game-picker, and player-list
 * DOM for the Games panel. All mutations that affect network or panel state are
 * delegated through `GamesViewActions`.
 */
import { createChevronBackwardIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { jsx, el } from '../../../shared/jsx-dom';
import { createLoadingSpinner } from '../../../shared/loading-spinner';
import { getPlaygroundAvatarPresentation } from '../../../shared/playground/identity';
import type {
  GameId,
  PresenceUser,
  PublicGame,
  PublicInvite
} from '../../../shared/playground/protocol';
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
  isPlayerInvitePending,
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
  if (!title || !subtitle) return;

  if (state.mode === 'players' && state.selectedGameId) {
    title.textContent = getGameLabel(state.selectedGameId);
    subtitle.textContent = t('gamesPlayWith');
    return;
  }

  title.textContent = t('games');
  if (shouldShowTransportNotice(state)) {
    subtitle.textContent =
      state.transport.status === 'connecting'
        ? t('gamesConnectingTitle')
        : t('gamesUnavailableTitle');
    return;
  }

  subtitle.textContent = t('gamesPlayersOnline', { count: getOnlinePlayerCount(state) });
}

export function renderGamesPanelBody(
  body: HTMLElement,
  state: GamesPanelState,
  actions: GamesViewActions
): void {
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

function renderLobbyView(
  body: HTMLElement,
  state: GamesPanelState,
  actions: GamesViewActions
): void {
  body.append(
    createAvailabilitySection(state, actions),
    createActiveGameSection(state, actions),
    createInvitesSection(state, actions),
    createGamesGrid(actions)
  );
}

function createTransportNotice(state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const title =
    state.transport.status === 'connecting'
      ? t('gamesConnectingNoticeTitle')
      : t('gamesUnavailableNoticeTitle');
  const helper =
    state.transport.status === 'connecting'
      ? t('gamesConnectingHelper')
      : getUnavailableNoticeHelper(state);

  if (state.transport.status === 'connecting') {
    return el<HTMLElement>(
      <section class="ytcq-games-connection-notice" role="status" aria-live="polite">
        <div class="ytcq-games-row-title">{title}</div>
        <div class="ytcq-games-row-helper">{helper}</div>
        {createSmallActionButton(t('gamesConnectingTitle'), {
          busy: true,
          disabled: true
        })}
      </section>
    );
  }

  const refresh = createSmallActionButton(t('gamesReconnect'), {
    onClick: actions.onReconnect
  });

  return el<HTMLElement>(
    <section class="ytcq-games-connection-notice" role="alert" aria-live="polite">
      <div class="ytcq-games-row-title">{title}</div>
      <div class="ytcq-games-row-helper">{helper}</div>
      {refresh}
    </section>
  );
}

function getUnavailableNoticeHelper(state: GamesPanelState): string {
  const helper = t('gamesUnavailableHelper');
  const error = state.transport.error.trim();
  return error ? `${error} ${helper}` : helper;
}

function createAvailabilitySection(state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const section = createGamesSection();
  const item = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-games-availability"
      role="switch"
      aria-label={`${t('gamesAvailableToPlay')}. ${t('gamesAvailableHelper')}`}
      aria-checked={String(state.available)}
      onClick={(event: MouseEvent) => {
        const nextAvailable = !state.available;
        state.available = nextAvailable;
        actions.onSetAvailability(nextAvailable);
        (event.currentTarget as HTMLButtonElement).setAttribute(
          'aria-checked',
          String(nextAvailable)
        );
      }}
    >
      <span class="ytcq-games-section-copy">
        <span class="ytcq-games-row-title">{t('gamesAvailableToPlay')}</span>
        <span class="ytcq-games-row-helper">{t('gamesAvailableHelper')}</span>
      </span>
      {createGamesAvailabilityToggle()}
    </button>
  );
  section.append(item);
  return section;
}

function createGamesAvailabilityToggle(): HTMLElement {
  return el<HTMLSpanElement>(
    <span class="ytcq-games-availability-toggle" aria-hidden="true">
      <span class="ytcq-menu-toggle" aria-hidden="true" />
    </span>
  );
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
    createActiveGameRow(game, state, actions)
  );
  return section;
}

function createActiveGameHeader(
  games: PublicGame[],
  gameIndex: number,
  currentUserId: string,
  actions: GamesViewActions
): HTMLElement {
  const header = el<HTMLDivElement>(
    <div class="ytcq-games-section-header">{createGamesSectionTitle(t('gamesActiveGame'))}</div>
  );
  if (games.length <= 1) return header;

  const previousGame = games[getWrappedIndex(gameIndex - 1, games.length)];
  const nextGame = games[getWrappedIndex(gameIndex + 1, games.length)];
  const previous = createCycleButton(getActiveGameControlLabel(previousGame, currentUserId), () => {
    actions.onCycleActiveGame(-1);
  });
  const next = createCycleButton(
    getActiveGameControlLabel(nextGame, currentUserId),
    () => {
      actions.onCycleActiveGame(1);
    },
    'next'
  );
  header.append(
    el<HTMLSpanElement>(
      <span class="ytcq-games-active-controls">
        {previous}
        <span class="ytcq-games-active-count">
          {gameIndex + 1}/{games.length}
        </span>
        {next}
      </span>
    )
  );
  return header;
}

function createActiveGameRow(
  game: PublicGame,
  state: GamesPanelState,
  actions: GamesViewActions
): HTMLElement {
  const isPanelOpen = getActiveGamePanelId() === game.gameId;
  const togglePanel = createSmallActionButton(t(isPanelOpen ? 'gamesHide' : 'gamesResume'), {
    onClick: () => actions.onToggleActiveGame(game)
  });
  const isLeaving = state.leavingGameId === game.gameId;
  const leave = createSmallActionButton(t('gamesLeave'), {
    busy: isLeaving,
    disabled: isLeaving,
    onClick: () => actions.onLeaveGame(game)
  });
  return el<HTMLDivElement>(
    <div class="ytcq-games-active-row">
      <span class="ytcq-games-section-copy">
        <span class="ytcq-games-row-title">{getGameLabel(game.gameType)}</span>
        <span class="ytcq-games-row-helper">
          {getGameOpponentLabel(game, state.transport.userId)}
        </span>
      </span>
      <span class="ytcq-games-row-actions">
        {togglePanel}
        {leave}
      </span>
    </div>
  );
}

function getActiveGameControlLabel(game: PublicGame, currentUserId: string): string {
  return `${getGameLabel(game.gameType)} - ${getGameOpponentLabel(game, currentUserId)}`;
}

function createInvitesSection(state: GamesPanelState, actions: GamesViewActions): HTMLElement {
  const section = createGamesSection(t('gamesInvites'));
  const invites = getPendingInvites(state);
  if (!invites.length) {
    section.hidden = true;
    return section;
  }

  invites.forEach((invite) => {
    section.append(createInviteRow(invite, actions));
  });
  return section;
}

function createInviteRow(invite: PublicInvite, actions: GamesViewActions): HTMLElement {
  const accept = createSmallActionButton(t('gamesAccept'), {
    onClick: () => actions.onAcceptInvite(invite)
  });
  const ignore = createSmallActionButton(t('gamesIgnore'), {
    onClick: () => actions.onIgnoreInvite(invite)
  });
  return el<HTMLDivElement>(
    <div class="ytcq-games-invite-row">
      <span class="ytcq-games-section-copy">
        <span class="ytcq-games-row-title">
          {t('gamesInviteFrom', {
            game: getGameLabel(invite.gameId),
            user: invite.fromUser.displayName
          })}
        </span>
        <span class="ytcq-games-row-helper">{t('gamesInviteHelper')}</span>
      </span>
      <span class="ytcq-games-row-actions">
        {accept}
        {ignore}
      </span>
    </div>
  );
}

function createGamesGrid(
  actions: GamesViewActions,
  { includeRealtime = true }: { includeRealtime?: boolean } = {}
): HTMLElement {
  const section = createGamesSection(t('gamesStartGame'));
  const grid = el<HTMLDivElement>(<div class="ytcq-games-grid" />);

  getGamePickerCards({ includeRealtime }).forEach((game) => {
    const card = el<HTMLButtonElement>(
      <button
        type="button"
        class={['ytcq-games-game-card', game.disabled ? 'ytcq-games-game-card-disabled' : '']
          .filter(Boolean)
          .join(' ')}
        aria-disabled={String(game.disabled)}
        aria-label={getGameCardAriaLabel(game)}
        onClick={game.disabled ? undefined : () => actions.onSelectGame(game.id)}
      >
        {createGamePreview(game.id, game.renderPreview)}
        {createGameCardCopy(game.label, game.tagline)}
      </button>
    );
    if (game.disabled && game.disabledReason) {
      card.title = game.disabledReason;
    }
    grid.append(card);
  });

  section.append(grid);
  return section;
}

function getGameCardAriaLabel(game: ReturnType<typeof getGamePickerCards>[number]): string {
  if (game.disabled && game.disabledReason) {
    return `${game.label}. ${game.tagline}. ${game.disabledReason}`;
  }
  return `${game.label}. ${game.tagline}`;
}

function renderPlayWithView(
  body: HTMLElement,
  state: GamesPanelState,
  actions: GamesViewActions
): void {
  const back = createSmallActionButton(t('gamesBack'), {
    onClick: actions.onBackToLobby
  });
  const nav = el<HTMLDivElement>(<div class="ytcq-games-detail-nav">{back}</div>);

  const section = createGamesSection(t('gamesPlayers'));
  const list = el<HTMLDivElement>(<div class="ytcq-games-player-list" />);
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

function createPlayerRow(
  player: PresenceUser,
  state: GamesPanelState,
  actions: GamesViewActions
): HTMLElement {
  const avatarPresentation = getPlaygroundAvatarPresentation(player);
  const isInviting = state.selectedGameId
    ? isPlayerInvitePending(state, state.selectedGameId, player.userId)
    : false;
  const action = createSmallActionButton(isInviting ? t('gamesCancelInvite') : t('gamesInvite'), {
    busy: isInviting,
    onClick: () => {
      if (isInviting) {
        actions.onCancelInvite(player);
        return;
      }

      actions.onInvitePlayer(player);
    }
  });
  return el<HTMLDivElement>(
    <div class="ytcq-games-player-row">
      <span
        class="ytcq-games-player-avatar"
        style={{
          '--ytcq-games-player-avatar-bg': avatarPresentation.backgroundColor,
          '--ytcq-games-player-avatar-fg': avatarPresentation.foregroundColor
        }}
      >
        {avatarPresentation.initial}
      </span>
      <span class="ytcq-games-section-copy">
        <span class="ytcq-games-row-title">{player.displayName}</span>
        <span class="ytcq-games-row-helper">
          {isInviting ? t('gamesWaitingForReply') : t('gamesAvailableNow')}
        </span>
      </span>
      <span class="ytcq-games-row-actions">{action}</span>
    </div>
  );
}

function createGamesSection(titleText?: string): HTMLElement {
  const section = el<HTMLElement>(<section class="ytcq-games-section" />);
  if (titleText) section.append(createGamesSectionTitle(titleText));
  return section;
}

function createGamesSectionTitle(titleText: string): HTMLElement {
  return el<HTMLDivElement>(<div class="ytcq-games-section-title">{titleText}</div>);
}

function createGamesEmpty(textContent: string): HTMLElement {
  return el<HTMLDivElement>(<div class="ytcq-games-section-empty">{textContent}</div>);
}

interface SmallActionButtonOptions {
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

function createSmallActionButton(
  label: string,
  options: SmallActionButtonOptions = {}
): HTMLButtonElement {
  return el<HTMLButtonElement>(
    <button
      type="button"
      class={['ytcq-games-small-action', options.busy ? 'ytcq-games-small-action-busy' : '']
        .filter(Boolean)
        .join(' ')}
      aria-busy={options.busy ? 'true' : undefined}
      disabled={options.disabled}
      onClick={options.onClick}
    >
      {options.busy
        ? createLoadingSpinner('ytcq-games-loading-spinner ytcq-games-action-spinner')
        : null}
      {label ? createTextSpan(options.busy ? getBusyActionLabel(label) : label) : null}
    </button>
  );
}

function getBusyActionLabel(label: string): string {
  return label.replace(/[.\u2026]+$/u, '');
}

function createTextSpan(textContent: string): HTMLElement {
  return el<HTMLSpanElement>(<span>{textContent}</span>);
}

function createCycleButton(
  targetLabel: string,
  onClick: () => void,
  direction: 'next' | 'previous' = 'previous'
): HTMLButtonElement {
  const button = createSmallActionButton('', { onClick });
  button.classList.add('ytcq-games-cycle-action');
  if (direction === 'next') button.classList.add('ytcq-games-cycle-action-next');
  button.setAttribute('aria-label', targetLabel);
  button.title = targetLabel;
  button.append(createChevronBackwardIcon());
  return button;
}

function getClampedActiveGameIndex(index: number, length: number): number {
  if (length <= 1) return 0;
  return Math.min(Math.max(index, 0), length - 1);
}

function getWrappedIndex(index: number, length: number): number {
  return (index + length) % length;
}

function createGameCardCopy(label: string, helperText: string): HTMLElement {
  return el<HTMLSpanElement>(
    <span class="ytcq-games-game-copy">
      <span class="ytcq-games-game-label">{label}</span>
      {helperText ? <span class="ytcq-games-game-helper">{helperText}</span> : null}
    </span>
  );
}

function createGamePreview(
  gameId: string,
  renderPreview: (container: HTMLElement) => void
): HTMLElement {
  const preview = el<HTMLSpanElement>(
    <span class={`ytcq-games-preview ytcq-games-preview-${gameId}`} />
  );
  renderPreview(preview);
  return preview;
}
