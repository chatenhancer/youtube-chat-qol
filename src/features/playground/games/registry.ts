/**
 * Playground game registry.
 *
 * Provides game-agnostic lookup helpers for the Games lobby by delegating to
 * the adapters listed in `enabled-games.ts`. This file should stay generic as
 * more games are added.
 */
import { t } from '../../../shared/i18n';
import type { GameId, PublicGame } from '../../../shared/playground-protocol';
import type { PlaygroundClientState } from './client';
import { GAME_ADAPTERS } from './enabled-games';
import type { GameDefinition, GamePanelAdapter, SendGameAction } from './adapter';

export const GAMES: readonly GameDefinition[] = GAME_ADAPTERS.map((adapter) => adapter.definition);

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
  GAME_ADAPTERS.forEach((adapter) => adapter.closePanel(options));
}

export function isActiveGamePanelOpen(): boolean {
  return GAME_ADAPTERS.some((adapter) => adapter.isPanelOpen());
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
  GAME_ADAPTERS.forEach((adapter) => adapter.updatePanel(nextState));
}

function getGameAdapter(game: PublicGame | undefined): GamePanelAdapter | null {
  return GAME_ADAPTERS.find((adapter) => adapter.isGame(game)) || null;
}

function getActiveGameAdapter(): GamePanelAdapter | null {
  return GAME_ADAPTERS.find((adapter) => adapter.getActiveGameId()) || null;
}
