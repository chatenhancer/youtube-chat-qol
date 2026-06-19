/**
 * Generic Playground game adapter contract.
 *
 * The Games lobby talks to this interface instead of individual games. Game
 * definitions own catalog and shell metadata; panel adapters mount game
 * content into the shared panel shell and translate game actions.
 */
import type { MessageKey } from '../../../shared/i18n';
import type { GameId, PublicGame, ServerMessage } from '../../../shared/playground-protocol';
import type { PlaygroundClientState } from './client';
import type { GamePanelShell } from './panel-shell';

export interface GameDefinition {
  classNamePrefix: string;
  disabledReasonKey?: MessageKey;
  id: GameId;
  isPlayable?: () => boolean;
  labelKey: MessageKey;
  panelTitleKey?: MessageKey;
  renderPreview: (container: HTMLElement) => void;
}

export type SendGameAction = (gameId: string, action: string, payload?: Record<string, unknown>) => void;

export type CloseGamePanel = (options?: { notify?: boolean }) => void;

export interface GamePanelMountContext {
  closePanel: CloseGamePanel;
  currentUserId: string;
  onPanelChange: () => void;
  sendGameAction: SendGameAction;
  shell: GamePanelShell;
}

export interface GamePanelMount {
  close(options?: { notify?: boolean }): void;
  gameId: string;
  setCompactMode?(compact: boolean): void;
}

export interface GamePanelUpdateContext {
  clientState: PlaygroundClientState;
  currentUserId: string;
}

export interface GamePanelAdapter<TGame extends PublicGame = PublicGame> {
  mountPanel(
    game: TGame,
    context: GamePanelMountContext
  ): GamePanelMount;
  updatePanel(game: TGame, context: GamePanelUpdateContext): void;
}

export type AnyGamePanelAdapter = GamePanelAdapter<PublicGame>;

export interface EnabledGame<TGame extends PublicGame = PublicGame> {
  adapter: GamePanelAdapter<TGame>;
  definition: GameDefinition;
  getOpponentLabel?(game: TGame, currentUserId: string): string;
  handleServerMessage?: (message: ServerMessage) => boolean;
  onClientReset?: () => void;
  onGameEnded?: (gameId: string) => void;
}

export type AnyEnabledGame = EnabledGame<PublicGame>;
