/**
 * Games lobby view rendering.
 *
 * Builds the availability, invite, active-game, game-picker, and player-list
 * DOM for the Games panel. All mutations that affect network or panel state are
 * delegated through `GamesViewActions`.
 */
import { createChevronBackwardIcon, createLockIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import { jsx, el } from '../../../shared/jsx-dom';
import { createLoadingSpinner } from '../../../shared/loading-spinner';
import { getPlaygroundAvatarPresentation } from '../../../shared/playground/identity';
import type {
  GameId,
  IncompatibleActiveGame,
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
  isGameVersionIncompatible,
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
  onLeaveGame: (gameId: string) => void;
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
  const unavailableGamesOpen =
    body.querySelector<HTMLDetailsElement>('.ytcq-games-unavailable-section')?.open ?? false;
  body.replaceChildren();
  if (shouldShowTransportNotice(state)) {
    body.append(createTransportNotice(state, actions));
    return;
  }

  if (state.mode === 'players') {
    renderPlayWithView(body, state, actions);
    return;
  }

  renderLobbyView(body, state, actions, unavailableGamesOpen);
}

function renderLobbyView(
  body: HTMLElement,
  state: GamesPanelState,
  actions: GamesViewActions,
  unavailableGamesOpen: boolean
): void {
  body.append(
    createAvailabilitySection(state, actions),
    createActiveGameSection(state, actions),
    createInvitesSection(state, actions),
    ...createGameSections(state, actions, unavailableGamesOpen)
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
  const error = state.transport.connectionError.trim();
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
  const incompatibleGames = state.transport.incompatibleActiveGames;
  if ((!games.length && !incompatibleGames.length) || !state.transport.userId) {
    section.hidden = true;
    return section;
  }

  if (games.length) {
    const gameIndex = getClampedActiveGameIndex(state.activeGameIndex, games.length);
    const game = games[gameIndex];
    section.append(
      createActiveGameHeader(games, gameIndex, state.transport.userId, actions),
      createActiveGameRow(game, state, actions)
    );
  } else {
    section.append(
      el<HTMLDivElement>(
        <div class="ytcq-games-section-header">{createGamesSectionTitle(t('gamesActiveGame'))}</div>
      )
    );
  }
  incompatibleGames.forEach((game) => {
    section.append(createIncompatibleActiveGameRow(game, state, actions));
  });
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
      <span class="ytcq-games-active-controls" role="group" aria-label={t('gamesActiveGame')}>
        {previous}
        <span class="ytcq-games-active-position" aria-hidden="true">
          {games.map((_, index) => (
            <span
              class={`ytcq-games-active-dot${index === gameIndex ? ' ytcq-games-active-dot-current' : ''}`}
            ></span>
          ))}
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
    onClick: () => actions.onLeaveGame(game.gameId)
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

function createIncompatibleActiveGameRow(
  game: IncompatibleActiveGame,
  state: GamesPanelState,
  actions: GamesViewActions
): HTMLElement {
  const isLeaving = state.leavingGameId === game.gameId;
  const leave = createSmallActionButton(t('gamesLeave'), {
    busy: isLeaving,
    disabled: isLeaving,
    onClick: () => actions.onLeaveGame(game.gameId)
  });
  return el<HTMLDivElement>(
    <div class="ytcq-games-active-row ytcq-games-incompatible-active-row">
      <span class="ytcq-games-section-copy">
        <span class="ytcq-games-row-title">{getGameLabel(game.gameType)}</span>
        <span class="ytcq-games-row-helper">{t('gamesVersionMismatchActiveHelper')}</span>
      </span>
      <span class="ytcq-games-row-actions">{leave}</span>
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

function createGameSections(
  state: GamesPanelState,
  actions: GamesViewActions,
  unavailableGamesOpen: boolean
): HTMLElement[] {
  const availableSection = createGamesSection(t('gamesStartGame'));
  const availableGrid = el<HTMLDivElement>(<div class="ytcq-games-grid" />);
  const unavailableGrid = el<HTMLDivElement>(<div class="ytcq-games-grid" />);

  getGamePickerCards().forEach((game) => {
    const contextDisabled = game.disabled;
    const versionIncompatible =
      !contextDisabled && isGameVersionIncompatible(state.transport, game.id);
    const disabled = contextDisabled || versionIncompatible;
    let badgeLabel = '';
    let disabledReason = '';
    let restriction: 'context' | 'version' | null = null;
    if (contextDisabled) {
      disabledReason = game.disabledReason;
      if (game.disabledBadge) {
        badgeLabel = game.disabledBadge;
        restriction = 'context';
      }
    } else if (versionIncompatible) {
      badgeLabel = t('gamesUpdateRequired');
      disabledReason = t('gamesVersionMismatchHelper', { game: game.label });
      restriction = 'version';
    }
    const card = el<HTMLButtonElement>(
      <button
        type="button"
        class={`ytcq-games-game-card${disabled ? ' ytcq-games-game-card-disabled' : ''}`}
        aria-disabled={String(disabled)}
        aria-label={getGameCardAriaLabel(game, disabledReason)}
        title={disabledReason || undefined}
        onClick={disabled ? undefined : () => actions.onSelectGame(game.id)}
      >
        {createGamePreview(
          game.id,
          game.renderPreview,
          restriction ? createGameRestrictionBadge(badgeLabel, restriction) : null
        )}
        {createGameCardCopy(game.label, game.tagline)}
      </button>
    );
    (disabled ? unavailableGrid : availableGrid).append(card);
  });

  availableSection.append(availableGrid);
  if (!unavailableGrid.childElementCount) return [availableSection];

  const unavailableSection = el<HTMLDetailsElement>(
    <details class="ytcq-games-section ytcq-games-unavailable-section" open={unavailableGamesOpen}>
      <summary class="ytcq-games-section-title ytcq-games-unavailable-summary">
        {t('gamesUnavailableGames')}
      </summary>
      {unavailableGrid}
    </details>
  );
  return [availableSection, unavailableSection];
}

function getGameCardAriaLabel(
  game: ReturnType<typeof getGamePickerCards>[number],
  disabledReason: string
): string {
  return [game.label, game.tagline, disabledReason].filter(Boolean).join('. ');
}

function renderPlayWithView(
  body: HTMLElement,
  state: GamesPanelState,
  actions: GamesViewActions
): void {
  const cancel = el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-profile-card-open ytcq-games-detail-cancel"
      onClick={actions.onBackToLobby}
    >
      {t('gamesCancelInvite')}
    </button>
  );
  const detailActions = el<HTMLDivElement>(
    <div class="ytcq-profile-card-actions ytcq-games-detail-actions">{cancel}</div>
  );

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
  body.append(section, detailActions);
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
  return el<HTMLButtonElement>(
    <button
      type="button"
      class={`ytcq-games-cycle-action ytcq-games-cycle-action-${direction}`}
      aria-label={targetLabel}
      title={targetLabel}
      onClick={onClick}
    >
      {createChevronBackwardIcon()}
    </button>
  );
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

function createGameRestrictionBadge(
  label: string,
  restriction: 'context' | 'version'
): HTMLElement {
  return el<HTMLSpanElement>(
    <span class={`ytcq-games-restriction-badge ytcq-games-${restriction}-badge`}>
      {createLockIcon()}
      <span>{label}</span>
    </span>
  );
}

function createGamePreview(
  gameId: string,
  renderPreview: (container: HTMLElement) => void,
  restrictionBadge: HTMLElement | null
): HTMLElement {
  const preview = el<HTMLSpanElement>(
    <span class={`ytcq-games-preview ytcq-games-preview-${gameId}`} />
  );
  renderPreview(preview);
  if (restrictionBadge) preview.append(restrictionBadge);
  return preview;
}
