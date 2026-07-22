/**
 * Playground Games.
 *
 * Owns the chat header Games entry point and coordinates the lobby surface.
 * Rendering, state selectors, and game-specific panel adapters live in nearby
 * modules so future games can be added without growing this file into a second
 * application entry point.
 */
import { registerFeature, type FeatureMutationBatch } from '../../../content/dispatcher';
import type { Options } from '../../../shared/options';
import type {
  GameId,
  PlaygroundActionError,
  PlaygroundFailedRequest,
  PresenceUser,
  PublicGame,
  PublicInvite
} from '../../../shared/playground/protocol';
import { playAlertSound } from '../../../shared/sounds/alert-sounds';
import { getOptions } from '../../../shared/state';
import { updateScrollEdgeFades, wireScrollEdgeFades } from '../../../shared/scroll';
import {
  closeActiveGamePanel,
  getActiveGamePanelId,
  isActiveGamePanelOpen,
  isSupportedPublicGame,
  openSupportedGamePanel,
  type OpenSupportedGamePanelOptions,
  updateOpenGamePanel
} from './registry';
import {
  createGamesButton,
  findGamesHeader,
  getGamesHeaderAnchor,
  moveGamesButton,
  positionGamesCard,
  setGamesButtonExpanded,
  shouldWireGamesButton,
  updateGamesButtonStatus
} from './button';
import { createGamesCard, installGamesCardListeners } from './card';
import {
  createInitialGamesPanelState,
  getActiveGameCount,
  getGamesPanelViewKey,
  getPendingInviteCount,
  getSupportedGames,
  isPlayerInvitePending,
  type GamesPanelState
} from './state';
import { renderGamesPanelBody, updateGamesCardHeader, type GamesViewActions } from './view';
import {
  cancelPlaygroundInvite,
  getPlaygroundClientState,
  getPlaygroundAvailability,
  respondToPlaygroundInvite,
  sendPlaygroundGameAction,
  sendPlaygroundInvite,
  setPlaygroundAvailability,
  startPlaygroundClient,
  stopPlaygroundClient,
  subscribePlaygroundActionErrors,
  subscribePlaygroundClient,
  type PlaygroundClientState
} from './client';

const GAMES_BUTTON_OWNER_ID = `${Date.now()}-${Math.random()}`;

let gamesWireTimer: number | null = null;
let activeGamesCard: HTMLElement | null = null;
let activeGamesAnchor: HTMLElement | null = null;
let activeGamesCardCleanup: (() => void) | null = null;
let activeGamesClientCleanup: (() => void) | null = null;
let activeGamesPointerCleanup: (() => void) | null = null;
let gamesPanelState: GamesPanelState | null = null;
let lastGamesPanelRenderKey = '';
let lastGamesPointerPosition: GamesPointerPosition | null = null;
let knownIncomingInviteIds: Set<string> | null = null;
let incomingInviteAlertsPrimed = false;
let pendingStartedGameOpen: PendingStartedGameOpen | null = null;

interface GamesPointerPosition {
  x: number;
  y: number;
}

interface PendingStartedGameOpen {
  gameType: GameId;
  knownGameIds: Set<string>;
  request: GameStartRequest;
}

type GameStartRequest = Extract<
  PlaygroundFailedRequest,
  { type: 'invite' | 'respondInvite' }
>;

registerFeature({
  page: {
    boot: refreshGamesButton,
    cleanup: cleanupStaleGamesUi,
    reset: cleanupStaleGamesUi,
    optionsChanged: handlePlaygroundOptionsChanged
  },
  mutation: handlePlaygroundMutations
});

export function refreshGamesButton(): void {
  if (!getOptions().playgroundEnabled) {
    cleanupStaleGamesUi();
    return;
  }

  if (getOptions().playgroundGamesAvailable) {
    ensureGamesClientSubscription();
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
    cleanupStaleGamesUi();
    return;
  }

  const header = findGamesHeader();
  if (!header) return;

  const anchor = getGamesHeaderAnchor(header);
  const existing = header.querySelector<HTMLButtonElement>('.ytcq-games-button');
  if (existing?.dataset.ytcqGamesOwner === GAMES_BUTTON_OWNER_ID) {
    moveGamesButton(existing, header, anchor);
    refreshGamesButtonStatus(existing);
    return;
  }

  existing?.remove();
  const button = createGamesButton(GAMES_BUTTON_OWNER_ID, toggleGamesCard);
  moveGamesButton(button, header, anchor);
  refreshGamesButtonStatus(button);
}

export function cleanupStaleGamesUi(): void {
  if (gamesWireTimer !== null) {
    window.clearTimeout(gamesWireTimer);
    gamesWireTimer = null;
  }
  pendingStartedGameOpen = null;
  closeActiveGamePanel({ notify: false });
  closeGamesCard();
  removeOrphanedGameSurfaces();
  lastGamesPointerPosition = null;
  knownIncomingInviteIds = null;
  incomingInviteAlertsPrimed = false;
  activeGamesClientCleanup?.();
  activeGamesClientCleanup = null;
  stopPlaygroundClient();
  document.querySelectorAll<HTMLButtonElement>('.ytcq-games-button').forEach((button) => button.remove());
}

function removeOrphanedGameSurfaces(): void {
  document.querySelectorAll<HTMLElement>(
    '.ytcq-games-card, .ytcq-game-panel, .ytcq-game-minimize-ghost, .ytcq-bounty-hunting-miss-feedback'
  ).forEach((surface) => surface.remove());
}

function handlePlaygroundOptionsChanged(_previousOptions: Options, nextOptions: Options): void {
  if (!nextOptions.playgroundEnabled) {
    cleanupStaleGamesUi();
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

  const { body, card } = createGamesCard(closeGamesCard);
  const scrollFadeCleanup = wireScrollEdgeFades(body);
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
  const cardListenersCleanup = installGamesCardListeners({
    getAnchor: () => activeGamesAnchor,
    getCard: () => activeGamesCard,
    onClose: closeGamesCard
  });
  activeGamesCardCleanup = () => {
    cardListenersCleanup();
    scrollFadeCleanup();
  };
  activeGamesPointerCleanup = installGamesPointerTracking();
}

function closeGamesCard(): void {
  activeGamesCardCleanup?.();
  activeGamesCardCleanup = null;
  activeGamesPointerCleanup?.();
  activeGamesPointerCleanup = null;
  activeGamesCard?.remove();
  activeGamesCard = null;
  gamesPanelState = null;
  lastGamesPanelRenderKey = '';
  setGamesButtonExpanded(activeGamesAnchor, false);
  activeGamesAnchor = null;
}

function ensureGamesClientSubscription(): void {
  if (activeGamesClientCleanup) return;
  const clientCleanup = subscribePlaygroundClient(handlePlaygroundClientStateChanged);
  const errorCleanup = subscribePlaygroundActionErrors(handlePlaygroundActionError);
  activeGamesClientCleanup = () => {
    clientCleanup();
    errorCleanup();
  };
}

function handlePlaygroundActionError(error: PlaygroundActionError): void {
  const request = error.request;
  if (!request) return;

  if (pendingStartedGameOpen && isSameGameStartRequest(pendingStartedGameOpen.request, request)) {
    pendingStartedGameOpen = null;
  }

  const state = gamesPanelState;
  if (!state) return;
  if (state.pendingInvite && isSameGameStartRequest(state.pendingInvite, request)) {
    state.pendingInvite = null;
  } else if (
    request.type === 'gameAction' &&
    request.action === 'leave' &&
    state.leavingGameId === request.gameId
  ) {
    state.leavingGameId = '';
  } else return;

  renderGamesPanel();
}

function isSameGameStartRequest(
  expected: GameStartRequest,
  actual: PlaygroundFailedRequest
): boolean {
  if (expected.type === 'invite') {
    return actual.type === 'invite' &&
      expected.gameId === actual.gameId &&
      expected.toUserId === actual.toUserId;
  }
  return actual.type === 'respondInvite' &&
    expected.accept === actual.accept &&
    expected.inviteId === actual.inviteId;
}

function handlePlaygroundClientStateChanged(nextState: PlaygroundClientState): void {
  maybePlayIncomingInviteAlert(nextState);
  refreshGamesButtonStatuses(nextState);
  updateOpenGamePanel(nextState);
  openPendingStartedGame(nextState);

  if (!gamesPanelState) {
    return;
  }

  gamesPanelState.transport = nextState;
  gamesPanelState.available = nextState.available;
  clearPendingLobbyActions(gamesPanelState, nextState);
  if (getCurrentGamesPanelViewKey() !== lastGamesPanelRenderKey) {
    renderGamesPanel();
  }
}

function renderGamesPanel(): void {
  if (!activeGamesCard || !gamesPanelState) return;

  updateGamesCardHeader(activeGamesCard, gamesPanelState);
  const body = activeGamesCard.querySelector<HTMLElement>('.ytcq-games-card-body');
  if (!body) return;

  renderGamesPanelBody(body, gamesPanelState, createGamesViewActions());
  updateScrollEdgeFades(body);
  lastGamesPanelRenderKey = getCurrentGamesPanelViewKey();
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

function refreshGamesButtonStatuses(state = getPlaygroundClientState()): void {
  document.querySelectorAll<HTMLButtonElement>('.ytcq-games-button')
    .forEach((button) => refreshGamesButtonStatus(button, state));
}

function refreshGamesButtonStatus(button: HTMLButtonElement, state = getPlaygroundClientState()): void {
  updateGamesButtonStatus(button, {
    activeGames: getActiveGameCount(state),
    invites: getPendingInviteCount(state)
  });
}

function maybePlayIncomingInviteAlert(state: PlaygroundClientState): void {
  if (state.status !== 'connected' || !state.userId) return;

  const nextInviteIds = getIncomingPendingInviteIds(state);
  if (!incomingInviteAlertsPrimed || !knownIncomingInviteIds) {
    knownIncomingInviteIds = nextInviteIds;
    incomingInviteAlertsPrimed = true;
    return;
  }

  const hasNewInvite = [...nextInviteIds].some((inviteId) => !knownIncomingInviteIds?.has(inviteId));
  knownIncomingInviteIds = nextInviteIds;
  if (hasNewInvite) playAlertSound('gameInvite');
}

function getIncomingPendingInviteIds(state: PlaygroundClientState): Set<string> {
  const currentUserId = state.userId || '';
  return new Set(state.invites
    .filter((invite) => invite.status === 'pending' && invite.toUser.userId === currentUserId)
    .map((invite) => invite.inviteId));
}

function acceptInvite(invite: PublicInvite): void {
  queueStartedGameOpen(invite.gameId, {
    accept: true,
    inviteId: invite.inviteId,
    type: 'respondInvite'
  });
  respondToPlaygroundInvite(invite.inviteId, true);
}

function ignoreInvite(invite: PublicInvite): void {
  respondToPlaygroundInvite(invite.inviteId, false);
}

function showPlayersView(gameId: GameId): void {
  if (!gamesPanelState) return;
  gamesPanelState.mode = 'players';
  gamesPanelState.selectedGameId = gameId;
  renderGamesPanel();
}

function showLobbyView(): void {
  if (!gamesPanelState) return;
  gamesPanelState.mode = 'lobby';
  gamesPanelState.selectedGameId = null;
  renderGamesPanel();
}

function invitePlayer(player: PresenceUser): void {
  if (!gamesPanelState?.selectedGameId) return;
  const request = {
    gameId: gamesPanelState.selectedGameId,
    toUserId: player.userId,
    type: 'invite'
  } satisfies GameStartRequest;
  gamesPanelState.pendingInvite = request;
  queueStartedGameOpen(request.gameId, request);
  sendPlaygroundInvite(request.gameId, request.toUserId);
  renderGamesPanel();
}

function cancelPlayerInvite(player: PresenceUser): void {
  const gameId = gamesPanelState?.selectedGameId;
  if (!gamesPanelState || !gameId || !isPlayerInvitePending(gamesPanelState, gameId, player.userId)) return;
  cancelPlaygroundInvite(gameId, player.userId);
  const pendingInvite = gamesPanelState.pendingInvite;
  if (pendingInvite?.gameId === gameId && pendingInvite.toUserId === player.userId) {
    gamesPanelState.pendingInvite = null;
  }
  pendingStartedGameOpen = null;
  renderGamesPanel();
}

function toggleActiveGamePanel(game: PublicGame): void {
  if (!gamesPanelState?.transport.userId) return;
  if (isActiveGamePanelOpen() && getActiveGamePanelId() === game.gameId) {
    closeActiveGamePanel({ animateToGamesButton: true });
    return;
  }

  openGamePanel(game, gamesPanelState.transport.userId);
  renderGamesPanel();
  if (isActiveGamePanelOpen() && getActiveGamePanelId() === game.gameId) closeGamesCard();
}

function leaveGame(gameId: string): void {
  if (!gamesPanelState || gamesPanelState.leavingGameId === gameId) return;
  const isCurrentGame = gamesPanelState.transport.games.some((game) =>
    game.gameId === gameId && isSupportedPublicGame(game)
  ) || gamesPanelState.transport.incompatibleActiveGames.some((game) => game.gameId === gameId);
  if (!isCurrentGame) return;

  if (getActiveGamePanelId() === gameId) closeActiveGamePanel({ notify: false });
  gamesPanelState.leavingGameId = gameId;
  renderGamesPanel();
  sendPlaygroundGameAction(gameId, 'leave');
}

function clearPendingLobbyActions(state: GamesPanelState, transport: PlaygroundClientState): void {
  if (transport.status !== 'connected' || transport.connectionError) {
    state.pendingInvite = null;
    state.leavingGameId = '';
    pendingStartedGameOpen = null;
    return;
  }

  if (
    state.leavingGameId
    && !transport.games.some((game) => game.gameId === state.leavingGameId)
    && !transport.incompatibleActiveGames.some((game) => game.gameId === state.leavingGameId)
  ) {
    state.leavingGameId = '';
  }

  const pendingInvite = state.pendingInvite;
  if (
    pendingInvite &&
    transport.invites.some((invite) =>
      invite.status === 'pending' &&
      invite.gameId === pendingInvite.gameId &&
      invite.fromUser.userId === transport.userId &&
      invite.toUser.userId === pendingInvite.toUserId
    )
  ) {
    state.pendingInvite = null;
  }
}

function getCurrentGamesPanelViewKey(): string {
  return gamesPanelState ? getGamesPanelViewKey(gamesPanelState, getActiveGamePanelId()) : '';
}

function openGamePanel(
  game: PublicGame,
  currentUserId: string,
  options?: OpenSupportedGamePanelOptions
): void {
  openSupportedGamePanel(game, currentUserId, sendPlaygroundGameAction, renderGamesPanel, {
    ...options,
    initialPosition: options?.initialPosition || getInitialGamePanelPosition()
  });
}

function queueStartedGameOpen(
  gameType: GameId,
  request: PendingStartedGameOpen['request']
): void {
  const games = gamesPanelState?.transport.games || getPlaygroundClientState().games;
  pendingStartedGameOpen = {
    gameType,
    knownGameIds: new Set(games.map((game) => game.gameId)),
    request
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
  openGamePanel(game, nextState.userId, { restoreCompactPreference: false });
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

function installGamesPointerTracking(): () => void {
  const controller = new AbortController();
  const rememberPointerPosition = (event: PointerEvent): void => {
    lastGamesPointerPosition = {
      x: event.clientX,
      y: event.clientY
    };
  };
  document.addEventListener('pointerdown', rememberPointerPosition, {
    capture: true,
    passive: true,
    signal: controller.signal
  });
  document.addEventListener('pointermove', rememberPointerPosition, {
    capture: true,
    passive: true,
    signal: controller.signal
  });
  return () => controller.abort();
}

function getInitialGamePanelPosition(): OpenSupportedGamePanelOptions['initialPosition'] | undefined {
  if (!lastGamesPointerPosition) return undefined;
  return {
    placement: 'cursor',
    x: lastGamesPointerPosition.x,
    y: lastGamesPointerPosition.y
  };
}

function selectActiveGame(gameId: string, state: PlaygroundClientState): void {
  if (!gamesPanelState) return;
  const index = getSupportedGames(state.games).findIndex((game) => game.gameId === gameId);
  if (index >= 0) gamesPanelState.activeGameIndex = index;
}
