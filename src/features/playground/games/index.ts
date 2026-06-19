/**
 * Playground Games experiment.
 *
 * Owns the chat header Games entry point and coordinates the lobby surface.
 * Rendering, state selectors, and game-specific panel adapters live in nearby
 * modules so future games can be added without growing this file into a second
 * application entry point.
 */
import { registerFeatureLifecycle, type FeatureMutationBatch } from '../../../content/lifecycle';
import type { Options } from '../../../shared/options';
import type { GameId, PresenceUser, PublicGame, PublicInvite } from '../../../shared/playground/protocol';
import { getOptions } from '../../../shared/state';
import {
  closeActiveGamePanel,
  getActiveGamePanelId,
  isActiveGamePanelOpen,
  isSupportedPublicGame,
  openSupportedGamePanel,
  updateOpenGamePanel
} from './registry';
import {
  createGamesButton,
  findGamesHeader,
  getGamesHeaderAnchor,
  moveGamesButton,
  positionGamesCard,
  setGamesButtonExpanded,
  shouldWireGamesButton
} from './button';
import { createGamesCard, installGamesCardListeners } from './card';
import {
  createInitialGamesPanelState,
  getSupportedGames,
  type GamesPanelState
} from './state';
import { renderGamesPanelBody, updateGamesCardHeader, type GamesViewActions } from './view';
import {
  getPlaygroundClientState,
  getPlaygroundAvailability,
  respondToPlaygroundInvite,
  sendPlaygroundGameAction,
  sendPlaygroundInvite,
  setPlaygroundAvailability,
  startPlaygroundClient,
  stopPlaygroundClient,
  subscribePlaygroundClient,
  type PlaygroundClientState
} from './client';

const GAMES_BUTTON_OWNER_ID = `${Date.now()}-${Math.random()}`;

let gamesWireTimer: number | null = null;
let activeGamesCard: HTMLElement | null = null;
let activeGamesAnchor: HTMLElement | null = null;
let activeGamesCardCleanup: (() => void) | null = null;
let activeGamesClientCleanup: (() => void) | null = null;
let gamesPanelState: GamesPanelState | null = null;
let pendingStartedGameOpen: PendingStartedGameOpen | null = null;

interface PendingStartedGameOpen {
  gameType: GameId;
  knownGameIds: Set<string>;
}

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

  const header = findGamesHeader();
  if (!header) return;

  const anchor = getGamesHeaderAnchor(header);
  const existing = header.querySelector<HTMLButtonElement>('.ytcq-games-button');
  if (existing?.dataset.ytcqGamesOwner === GAMES_BUTTON_OWNER_ID) {
    moveGamesButton(existing, header, anchor);
    return;
  }

  existing?.remove();
  const button = createGamesButton(GAMES_BUTTON_OWNER_ID, toggleGamesCard);
  moveGamesButton(button, header, anchor);
}

export function cleanupStaleGamesButtons(): void {
  if (gamesWireTimer !== null) {
    window.clearTimeout(gamesWireTimer);
    gamesWireTimer = null;
  }
  pendingStartedGameOpen = null;
  closeActiveGamePanel({ notify: false });
  closeGamesCard();
  activeGamesClientCleanup?.();
  activeGamesClientCleanup = null;
  stopPlaygroundClient();
  document.querySelectorAll<HTMLButtonElement>('.ytcq-games-button').forEach((button) => button.remove());
}

function handlePlaygroundOptionsChanged(_previousOptions: Options, nextOptions: Options): void {
  if (!nextOptions.playgroundEnabled) {
    cleanupStaleGamesButtons();
    return;
  }

  refreshGamesButton();
}

function handlePlaygroundMutations({ addedElements, mutations }: FeatureMutationBatch): void {
  if (!getOptions().playgroundEnabled) return;
  if (shouldWireGamesButton(addedElements, mutations)) scheduleGamesButtonWire();
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

  const { card } = createGamesCard(closeGamesCard);
  document.body.append(card);
  activeGamesCard = card;
  activeGamesAnchor = anchor;
  gamesPanelState = createInitialGamesPanelState(
    getPlaygroundAvailability(getOptions().playgroundGamesAvailable),
    getPlaygroundClientState()
  );
  startPlaygroundClient(gamesPanelState.available);
  ensureGamesClientSubscription();
  renderGamesPanel();
  setGamesButtonExpanded(anchor, true);
  positionGamesCard(card, anchor);
  activeGamesCardCleanup = installGamesCardListeners({
    getAnchor: () => activeGamesAnchor,
    getCard: () => activeGamesCard,
    onClose: closeGamesCard
  });
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

function handlePlaygroundClientStateChanged(nextState: PlaygroundClientState): void {
  updateOpenGamePanel(nextState);
  openPendingStartedGame(nextState);

  if (!gamesPanelState) {
    return;
  }

  gamesPanelState.transport = nextState;
  gamesPanelState.available = nextState.available;
  renderGamesPanel();
}

function renderGamesPanel(): void {
  if (!activeGamesCard || !gamesPanelState) return;

  updateGamesCardHeader(activeGamesCard, gamesPanelState);
  const body = activeGamesCard.querySelector<HTMLElement>('.ytcq-games-card-body');
  if (!body) return;

  renderGamesPanelBody(body, gamesPanelState, createGamesViewActions());
}

function createGamesViewActions(): GamesViewActions {
  return {
    onAcceptInvite: acceptInvite,
    onBackToLobby: showLobbyView,
    onCancelInvite: cancelPlayerInvite,
    onCycleActiveGame: cycleActiveGame,
    onIgnoreInvite: ignoreInvite,
    onInvitePlayer: invitePlayer,
    onLeaveGame: leaveGame,
    onReconnect: reconnectGamesClient,
    onSelectGame: showPlayersView,
    onSetAvailability: setPlaygroundAvailability,
    onToggleActiveGame: toggleActiveGamePanel
  };
}

function reconnectGamesClient(): void {
  if (!gamesPanelState || gamesPanelState.transport.status === 'connecting') return;
  startPlaygroundClient(gamesPanelState.available);
}

function acceptInvite(invite: PublicInvite): void {
  queueStartedGameOpen(invite.gameId);
  respondToPlaygroundInvite(invite.inviteId, true);
}

function ignoreInvite(invite: PublicInvite): void {
  respondToPlaygroundInvite(invite.inviteId, false);
}

function showPlayersView(gameId: GameId): void {
  if (!gamesPanelState) return;
  gamesPanelState.mode = 'players';
  gamesPanelState.selectedGameId = gameId;
  gamesPanelState.invitedPlayer = '';
  renderGamesPanel();
}

function showLobbyView(): void {
  if (!gamesPanelState) return;
  gamesPanelState.mode = 'lobby';
  gamesPanelState.selectedGameId = null;
  gamesPanelState.invitedPlayer = '';
  renderGamesPanel();
}

function invitePlayer(player: PresenceUser): void {
  if (!gamesPanelState?.selectedGameId) return;
  gamesPanelState.invitedPlayer = player.userId;
  queueStartedGameOpen(gamesPanelState.selectedGameId);
  sendPlaygroundInvite(gamesPanelState.selectedGameId, player.userId);
  renderGamesPanel();
}

function cancelPlayerInvite(player: PresenceUser): void {
  if (!gamesPanelState || gamesPanelState.invitedPlayer !== player.userId) return;
  gamesPanelState.invitedPlayer = '';
  pendingStartedGameOpen = null;
  renderGamesPanel();
}

function toggleActiveGamePanel(game: PublicGame): void {
  if (!gamesPanelState?.transport.userId) return;
  if (isActiveGamePanelOpen() && getActiveGamePanelId() === game.gameId) {
    closeActiveGamePanel();
    return;
  }

  openGamePanel(game, gamesPanelState.transport.userId);
  renderGamesPanel();
}

function leaveGame(game: PublicGame): void {
  if (!isSupportedPublicGame(game)) return;
  closeActiveGamePanel({ notify: false });
  sendPlaygroundGameAction(game.gameId, 'leave');
}

function openGamePanel(game: PublicGame, currentUserId: string): void {
  openSupportedGamePanel(game, currentUserId, sendPlaygroundGameAction, renderGamesPanel);
}

function queueStartedGameOpen(gameType: GameId): void {
  const games = gamesPanelState?.transport.games || getPlaygroundClientState().games;
  pendingStartedGameOpen = {
    gameType,
    knownGameIds: new Set(games.map((game) => game.gameId))
  };
}

function openPendingStartedGame(nextState: PlaygroundClientState): boolean {
  const pending = pendingStartedGameOpen;
  if (!pending || !nextState.userId) return false;

  const game = nextState.games.find((candidate) =>
    candidate.gameType === pending.gameType &&
    !pending.knownGameIds.has(candidate.gameId) &&
    isSupportedPublicGame(candidate)
  );
  if (!game) return false;

  pendingStartedGameOpen = null;
  showLobbyView();
  selectActiveGame(game.gameId, nextState);
  openGamePanel(game, nextState.userId);
  closeGamesCard();
  return true;
}

function cycleActiveGame(step: number): void {
  if (!gamesPanelState) return;
  const games = getSupportedGames(gamesPanelState.transport.games);
  if (games.length <= 1) return;
  gamesPanelState.activeGameIndex = (gamesPanelState.activeGameIndex + step + games.length) % games.length;
  renderGamesPanel();
}

function selectActiveGame(gameId: string, state: PlaygroundClientState): void {
  if (!gamesPanelState) return;
  const index = getSupportedGames(state.games).findIndex((game) => game.gameId === gameId);
  if (index >= 0) gamesPanelState.activeGameIndex = index;
}
