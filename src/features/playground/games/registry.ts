/**
 * Playground game registry.
 *
 * Provides game-agnostic lookup helpers for the Games lobby. Add a game
 * adapter to `GAME_ADAPTERS` when that game should be offered by the extension.
 */
import { t } from '../../../shared/i18n';
import type { GameId, PublicGame } from '../../../shared/playground-protocol';
import type { PlaygroundClientState } from './client';
import { chessGameAdapter } from './chess/adapter';
import type { GameDefinition, GamePanelAdapter, SendGameAction } from './adapter';

const GAME_ADAPTERS: Record<GameId, GamePanelAdapter> = {
  chess: chessGameAdapter
};
const GAME_ADAPTER_LIST: readonly GamePanelAdapter[] = Object.values(GAME_ADAPTERS);

export const GAMES: readonly GameDefinition[] = GAME_ADAPTER_LIST.map((adapter) => adapter.definition);

export function getAvailableGameIds(): GameId[] {
  return GAMES.map((game) => game.id);
}

export function getGameLabel(gameId: GameId): string {
  return t(GAMES.find((game) => game.id === gameId)?.labelKey || 'games');
}

export function renderGamePreview(gameId: GameId, container: HTMLElement): void {
  GAMES.find((game) => game.id === gameId)?.renderPreview(container);
}

export function isSupportedGameId(gameId: GameId): boolean {
  return GAMES.some((game) => game.id === gameId);
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
  getGameAdapter(game)?.openPanel(game, currentUserId, sendGameAction, onPanelChange);
}

export function updateOpenGamePanel(nextState: PlaygroundClientState): void {
  GAME_ADAPTER_LIST.forEach((adapter) => adapter.updatePanel(nextState));
}

function getGameAdapter(game: PublicGame | undefined): GamePanelAdapter | null {
  return GAME_ADAPTER_LIST.find((adapter) => adapter.isGame(game)) || null;
}

function getActiveGameAdapter(): GamePanelAdapter | null {
  return GAME_ADAPTER_LIST.find((adapter) => adapter.getActiveGameId()) || null;
}
