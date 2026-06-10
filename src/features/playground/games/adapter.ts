/**
 * Generic Playground game adapter contract.
 *
 * The Games lobby talks to this interface instead of individual games. Each
 * game adapter owns its metadata, panel lifecycle, action translation, and
 * server game type checks.
 */
import type { MessageKey } from '../../../shared/i18n';
import type { GameId, PublicGame } from '../../../shared/playground-protocol';
import type { PlaygroundClientState } from './client';

export interface GameDefinition {
  id: GameId;
  labelKey: MessageKey;
  renderPreview: (container: HTMLElement) => void;
}

export type SendGameAction = (gameId: string, action: string, payload?: Record<string, unknown>) => void;

export interface GamePanelAdapter {
  closePanel: (options?: { notify?: boolean }) => void;
  definition: GameDefinition;
  getActiveGameId: () => string;
  getOpponentLabel: (game: PublicGame, currentUserId: string) => string;
  isGame: (game: PublicGame | undefined) => boolean;
  isPanelOpen: () => boolean;
  openPanel: (
    game: PublicGame,
    currentUserId: string,
    sendGameAction: SendGameAction,
    onPanelChange: () => void
  ) => void;
  updatePanel: (state: PlaygroundClientState) => void;
}
