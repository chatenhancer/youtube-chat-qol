/**
 * Chess game adapter.
 *
 * Translates the generic Games lobby contract into the chess panel API,
 * including move payloads sent to the Playground backend.
 */
import {
  closeChessGamePanel,
  openChessGamePanel,
  updateChessGamePanel
} from './panel';
import { renderChessPreview } from './preview';
import type { PublicChessGame } from './types';
import type {
  EnabledGame,
  GameDefinition,
  GamePanelAdapter,
  GamePanelMount,
  GamePanelMountContext,
  GamePanelUpdateContext
} from '../adapter';

export const chessGameDefinition: GameDefinition = {
  classNamePrefix: 'ytcq-chess-game',
  id: 'chess',
  labelKey: 'gamesChess',
  renderPreview: renderChessPreview,
  taglineKey: 'gamesChessTagline'
};

export const chessGameAdapter: GamePanelAdapter<PublicChessGame> = {
  mountPanel: mountChessPanel,
  updatePanel: updateChessPanel
};

export const chessGame: EnabledGame<PublicChessGame> = {
  adapter: chessGameAdapter,
  definition: chessGameDefinition,
  getOpponentLabel: getChessOpponentLabel
};

function mountChessPanel(game: PublicChessGame, context: GamePanelMountContext): GamePanelMount {
  const { currentUserId, onPanelChange, sendGameAction, shell } = context;

  openChessGamePanel(shell, game, currentUserId, (gameId, from, to, promotion) => {
    sendGameAction(gameId, 'move', promotion ? { from, promotion, to } : { from, to });
  }, onPanelChange);

  return {
    close: closeChessGamePanel,
    gameId: game.gameId
  };
}

function updateChessPanel(game: PublicChessGame, context: GamePanelUpdateContext): void {
  const { currentUserId } = context;

  updateChessGamePanel(game, currentUserId);
}

function getChessOpponentLabel(game: PublicChessGame, currentUserId: string): string {
  const currentUserColor = game.players.white.userId === currentUserId
    ? 'white'
    : game.players.black.userId === currentUserId
      ? 'black'
      : null;
  const opponent = currentUserColor === 'white'
    ? game.players.black
    : game.players.white;
  return opponent.displayName || 'Player';
}
