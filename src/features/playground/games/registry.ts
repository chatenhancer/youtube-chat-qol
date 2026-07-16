/**
 * Playground game registry.
 *
 * Provides game-agnostic lookup helpers for the Games lobby. Add a game
 * adapter to `enabled-games.ts` when that game should be offered by the
 * extension.
 */
import { createGamesIcon } from '../../../shared/icons';
import { t } from '../../../shared/i18n';
import type { GameId, PublicGame, ServerMessage } from '../../../shared/playground/protocol';
import type { PlaygroundClientState } from './client';
import { ENABLED_GAMES } from './enabled-games';
import type { AnyEnabledGame, AnyGamePanelAdapter, GameDefinition, GamePanelMount, SendGameAction } from './adapter';
import { createGamePanelShell, type GamePanelShell, type GamePanelShellPosition } from './panel-shell';
import { animateGameSurfaceToGamesButton } from './minimize-animation';

const ENABLED_GAME_LIST: readonly AnyEnabledGame[] = ENABLED_GAMES;
let activeGamePanel: ActiveGamePanel | null = null;
const gamePanelPreferences = new Map<GameId, GamePanelPreferences>();

interface ActiveGamePanel {
  adapter: AnyGamePanelAdapter;
  gameType: GameId;
  mount: GamePanelMount;
  shell?: GamePanelShell;
  shellController?: AbortController;
}

interface GamePanelPreferences {
  compactMode?: boolean;
}

interface CloseActiveGamePanelOptions {
  animateToGamesButton?: boolean;
  notify?: boolean;
}

export interface OpenSupportedGamePanelOptions {
  initialPosition?: GamePanelShellPosition;
  restoreCompactPreference?: boolean;
}

export const GAMES: readonly GameDefinition[] = ENABLED_GAME_LIST.map((game) => game.definition);

export type GamePickerCard = RealtimeGamePickerCard;

interface RealtimeGamePickerCard {
  disabled: boolean;
  disabledReason: string;
  id: GameId;
  label: string;
  renderPreview: (container: HTMLElement) => void;
  tagline: string;
  type: 'realtime';
}

export function getAvailableGameIds(): GameId[] {
  return GAMES
    .filter(isGameDefinitionPlayable)
    .map((game) => game.id);
}

export function getGameLabel(gameId: GameId): string {
  return t(GAMES.find((game) => game.id === gameId)?.labelKey || 'games');
}

export function getGamePickerCards({ includeRealtime = true }: { includeRealtime?: boolean } = {}): GamePickerCard[] {
  return includeRealtime
    ? GAMES.map((game) => ({
      disabled: !isGameDefinitionPlayable(game),
      disabledReason: game.disabledReasonKey ? t(game.disabledReasonKey) : '',
      id: game.id,
      label: getGameLabel(game.id),
      renderPreview: game.renderPreview,
      tagline: t(game.taglineKey),
      type: 'realtime' as const
    }))
    : [];
}

export function renderGamePreview(gameId: GameId, container: HTMLElement): void {
  GAMES.find((game) => game.id === gameId)?.renderPreview(container);
}

export function notifyGameClientReset(): void {
  ENABLED_GAME_LIST.forEach((game) => game.onClientReset?.());
}

export function notifyGameEnded(gameId: string): void {
  ENABLED_GAME_LIST.forEach((game) => game.onGameEnded?.(gameId));
}

export function handleGameServerMessage(message: ServerMessage): boolean {
  return ENABLED_GAME_LIST.some((game) => game.handleServerMessage?.(message));
}

export function isSupportedGameId(gameId: GameId): boolean {
  return GAMES.some((game) => game.id === gameId);
}

export function isPlayableGameId(gameId: GameId): boolean {
  const game = GAMES.find((candidate) => candidate.id === gameId);
  return Boolean(game && isGameDefinitionPlayable(game));
}

export function getActiveGamePanelId(): string {
  return getConnectedActiveGamePanel()?.mount.gameId || '';
}

export function closeActiveGamePanel({
  animateToGamesButton = false,
  notify
}: CloseActiveGamePanelOptions = {}): void {
  const panel = activeGamePanel;
  if (!panel) return;

  activeGamePanel = null;
  const surface = panel.shell?.panel || panel.mount.surface;
  if (animateToGamesButton && surface) animateGameSurfaceToGamesButton(surface);
  disposeGamePanel(panel, { notify });
}

export function isActiveGamePanelOpen(): boolean {
  return Boolean(getConnectedActiveGamePanel());
}

export function isSupportedPublicGame(game: PublicGame): boolean {
  return Boolean(getEnabledGame(game));
}

export function getGameOpponentLabel(game: PublicGame, currentUserId: string): string {
  return getEnabledGame(game)?.getOpponentLabel?.(game, currentUserId) ||
    getGenericGameOpponentLabel(game, currentUserId);
}

export function openSupportedGamePanel(
  game: PublicGame,
  currentUserId: string,
  sendGameAction: SendGameAction,
  onPanelChange: () => void,
  options: OpenSupportedGamePanelOptions = {}
): void {
  const enabledGame = getEnabledGame(game);
  if (!enabledGame) return;
  const { initialPosition, restoreCompactPreference = true } = options;

  closeActiveGamePanel({ notify: false });
  const { adapter, definition } = enabledGame;
  if (definition.surface === 'chat-overlay') {
    if (!adapter.mountOverlay) return;
    const mount = adapter.mountOverlay(game, {
      closePanel: (closeOptions) => closeActiveGamePanel({
        ...closeOptions,
        animateToGamesButton: true
      }),
      currentUserId,
      onPanelChange: () => {
        closeDisconnectedActiveGamePanel();
        onPanelChange();
      },
      sendGameAction
    });
    if (!mount) return;
    activeGamePanel = {
      adapter,
      gameType: game.gameType,
      mount
    };
    return;
  }

  const shellController = new AbortController();
  const title = t(definition.labelKey);
  const shell = createGamePanelShell({
    ariaLabel: title,
    classNamePrefix: definition.classNamePrefix,
    closeLabel: t('gamesHide'),
    icon: createGamesIcon(),
    onClose: () => closeActiveGamePanel({ animateToGamesButton: true }),
    signal: shellController.signal,
    subtitle: getGameOpponentLabel(game, currentUserId),
    title
  });
  let mount: GamePanelMount | null = null;
  const setPanelCompactMode = (
    compact: boolean,
    { syncShell = true }: { syncShell?: boolean } = {}
  ): void => {
    gamePanelPreferences.set(definition.id, {
      ...gamePanelPreferences.get(definition.id),
      compactMode: compact
    });
    if (syncShell && shell.isCompactMode() !== compact) shell.setCompactMode(compact);
    mount?.setCompactMode?.(compact);
  };
  try {
    mount = adapter.mountPanel(game, {
      closePanel: closeActiveGamePanel,
      controls: {
        setCompactMode: (compact) => setPanelCompactMode(compact),
        setPosition: (position) => shell.setPosition(position)
      },
      currentUserId,
      onPanelChange: () => {
        closeDisconnectedActiveGamePanel();
        onPanelChange();
      },
      sendGameAction,
      shell
    });
  } catch (error) {
    releaseGamePanelShell({ shell, shellController });
    throw error;
  }
  if (!mount) {
    releaseGamePanelShell({ shell, shellController });
    return;
  }

  if (initialPosition) shell.setPosition(initialPosition, { animate: false });

  if (mount.setCompactMode) {
    shell.setCompactModeEnabled({
      compactLabel: t('gamesMinimize'),
      expandLabel: t('gamesExpand'),
      onChange: (compact) => setPanelCompactMode(compact, { syncShell: false })
    });
    const preferredCompactMode = gamePanelPreferences.get(definition.id)?.compactMode;
    if (restoreCompactPreference) {
      if (preferredCompactMode !== undefined) setPanelCompactMode(preferredCompactMode);
    } else {
      setPanelCompactMode(false);
    }
  }
  activeGamePanel = {
    adapter,
    gameType: game.gameType,
    mount,
    shell,
    shellController
  };
}

export function updateOpenGamePanel(nextState: PlaygroundClientState): void {
  const panel = getConnectedActiveGamePanel();
  if (!panel) return;

  const { adapter, gameType, mount, shell } = panel;
  const overlay = mount.statusOverlay || shell?.statusOverlay;
  if (!shell && !overlay) {
    if (nextState.status === 'disconnected') {
      closeActiveGamePanel({ notify: false });
      return;
    }
    if (nextState.status === 'connecting') return;
  }
  const activeGameId = mount.gameId;
  if (nextState.status === 'connecting') {
    overlay?.show({
      key: `connection:reconnecting:${activeGameId}`,
      message: t('gamesConnectionLost'),
      owner: 'system',
      temporary: false
    });
    return;
  }

  if (nextState.status === 'disconnected') {
    overlay?.show({
      key: `connection:failed:${activeGameId}`,
      message: t('gamesReconnectFailed'),
      owner: 'system',
      temporary: false
    });
    return;
  }

  const currentUserId = nextState.userId;
  if (!currentUserId) return;

  if (nextState.endedGame?.gameId === activeGameId) {
    if (nextState.endedGame.userId === currentUserId) {
      closeActiveGamePanel({ notify: false });
      return;
    }

    overlay?.show({
      key: `game-ended:opponent-left:${activeGameId}`,
      message: t('gamesOpponentLeft'),
      owner: 'system',
      temporary: false
    });
    return;
  }

  const game = nextState.games.find((candidate) => candidate.gameId === activeGameId);
  if (!game || game.gameType !== gameType) {
    if (overlay?.has({ keyPrefix: 'game-ended:', owner: 'system' })) return;

    overlay?.show({
      key: `game-unavailable:${activeGameId}`,
      message: t('gamesGameCouldNotRestore'),
      owner: 'system',
      temporary: false
    });
    return;
  }

  overlay?.clear({ owner: 'system' });
  adapter.updatePanel(game, {
    clientState: nextState,
    currentUserId,
  });
}

function getEnabledGame(game: PublicGame | undefined): AnyEnabledGame | null {
  return ENABLED_GAME_LIST.find(({ definition }) => definition.id === game?.gameType) || null;
}

function getGenericGameOpponentLabel(game: PublicGame, currentUserId: string): string {
  const opponent = Object.values(game.players || {})
    .find((player) => player?.userId && player.userId !== currentUserId);
  return opponent?.displayName || 'Player';
}

function getConnectedActiveGamePanel(): ActiveGamePanel | null {
  closeDisconnectedActiveGamePanel();
  return activeGamePanel;
}

function closeDisconnectedActiveGamePanel(): void {
  const panel = activeGamePanel;
  if (!panel) return;
  const shellDisconnected = Boolean(panel.shell && !panel.shell.panel.isConnected);
  const mountDisconnected = panel.mount.isConnected?.() === false;
  if (!shellDisconnected && !mountDisconnected) return;

  activeGamePanel = null;
  disposeGamePanel(panel, { notify: false });
}

function disposeGamePanel(panel: ActiveGamePanel, options?: { notify?: boolean }): void {
  if (panel.shell && panel.shellController) releaseGamePanelShell({ shell: panel.shell, shellController: panel.shellController });
  if (!panel.shell) panel.mount.statusOverlay?.clear();
  panel.mount.close(options);
}

function releaseGamePanelShell({
  shell,
  shellController
}: {
  shell: GamePanelShell;
  shellController: AbortController;
}): void {
  shell.statusOverlay.clear();
  shellController.abort();
  shell.panel.remove();
}

function isGameDefinitionPlayable(game: GameDefinition): boolean {
  return game.isPlayable ? game.isPlayable() : true;
}
