/**
 * Playground game registry.
 *
 * Provides game-agnostic lookup helpers for the Games lobby. Add a game
 * adapter to `enabled-games.ts` when that game should be offered by the
 * extension.
 */
import { t } from '../../../shared/i18n';
import type { GameId, PublicGame } from '../../../shared/playground-protocol';
import type { PlaygroundClientState } from './client';
import { ENABLED_GAME_ADAPTERS } from './enabled-games';
import type { GameDefinition, GamePanelAdapter, SendGameAction } from './adapter';

const GAME_ADAPTER_LIST: readonly GamePanelAdapter[] = ENABLED_GAME_ADAPTERS;

export const GAMES: readonly GameDefinition[] = GAME_ADAPTER_LIST.map((adapter) => adapter.definition);

export type GamePickerCard = RealtimeGamePickerCard;

interface RealtimeGamePickerCard {
  disabled: boolean;
  disabledReason: string;
  id: GameId;
  label: string;
  renderPreview: (container: HTMLElement) => void;
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
      type: 'realtime' as const
    }))
    : [];
}

export function renderGamePreview(gameId: GameId, container: HTMLElement): void {
  GAMES.find((game) => game.id === gameId)?.renderPreview(container);
}

export function isSupportedGameId(gameId: GameId): boolean {
  return GAMES.some((game) => game.id === gameId);
}

export function isPlayableGameId(gameId: GameId): boolean {
  const game = GAMES.find((candidate) => candidate.id === gameId);
  return Boolean(game && isGameDefinitionPlayable(game));
}

export function getActiveGamePanelId(): string {
  return getActiveGameAdapter()?.getActiveGameId() || '';
}

export function closeActiveGamePanel(options?: { notify?: boolean }): void {
  GAME_ADAPTER_LIST.forEach((adapter) => adapter.closePanel(options));
}

export function isActiveGamePanelOpen(): boolean {
  return GAME_ADAPTER_LIST.some((adapter) => adapter.isPanelOpen());
}

export function isSupportedPublicGame(game: PublicGame): boolean {
  return Boolean(getGameAdapter(game));
}

export function getGameOpponentLabel(game: PublicGame, currentUserId: string): string {
  return getGameAdapter(game)?.getOpponentLabel(game, currentUserId) || 'Player';
}

export function openSupportedGamePanel(
  game: PublicGame,
  currentUserId: string,
  sendGameAction: SendGameAction,
  onPanelChange: () => void
): void {
  const adapter = getGameAdapter(game);
  if (!adapter) return;

  closeActiveGamePanel({ notify: false });
  adapter.openPanel(game, currentUserId, sendGameAction, onPanelChange);
}

export function updateOpenGamePanel(nextState: PlaygroundClientState): void {
  const adapter = getActiveGameAdapter();
  if (!adapter) return;

  const activeGameId = adapter.getActiveGameId();
  if (!activeGameId) return;

  const overlay = adapter.getPanelOverlay();
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

  if (nextState.endedGame?.gameId === activeGameId) {
    if (nextState.endedGame.userId === nextState.userId) {
      adapter.closePanel({ notify: false });
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
  if (!game || !adapter.isGame(game)) {
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
  adapter.updatePanel(nextState);
}

function getGameAdapter(game: PublicGame | undefined): GamePanelAdapter | null {
  return GAME_ADAPTER_LIST.find((adapter) => adapter.isGame(game)) || null;
}

function getActiveGameAdapter(): GamePanelAdapter | null {
  return GAME_ADAPTER_LIST.find((adapter) => adapter.getActiveGameId()) || null;
}

function isGameDefinitionPlayable(game: GameDefinition): boolean {
  return game.isPlayable ? game.isPlayable() : true;
}
