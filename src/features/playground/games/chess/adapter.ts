/**
 * Chess game adapter.
 *
 * Translates the generic Games lobby contract into the chess panel API,
 * including move payloads sent to the Playground backend.
 */
import { t } from '../../../../shared/i18n';
import type { PublicGame } from '../../../../shared/playground-protocol';
import {
  closeChessGamePanel,
  getActiveChessGameId,
  isChessGamePanelOpen,
  isPublicChessGame,
  openChessGamePanel,
  showChessGameEndedNotice,
  updateChessGamePanel
} from './panel';
import type { PlaygroundClientState } from '../client';
import type { GamePanelAdapter } from '../adapter';

export const chessGameAdapter: GamePanelAdapter = {
  closePanel: closeChessGamePanel,
  definition: {
    id: 'chess',
    labelKey: 'gamesChess',
    thumbnailPath: 'games/chess/thumbnail.png'
  },
  getActiveGameId: getActiveChessGameId,
  getOpponentLabel: getChessOpponentLabel,
  isGame: isPublicChessGame,
  isPanelOpen: isChessGamePanelOpen,
  openPanel: openChessPanel,
  updatePanel: updateChessPanel
};

function getChessOpponentLabel(game: PublicGame, currentUserId: string): string {
  if (!isPublicChessGame(game)) return 'Player';

  const opponent = game.players.white.userId === currentUserId
    ? game.players.black
    : game.players.white;
  return opponent.displayName || 'Player';
}

function openChessPanel(
  game: PublicGame,
  currentUserId: string,
  sendGameAction: (gameId: string, action: string, payload?: Record<string, unknown>) => void,
  onPanelChange: () => void
): void {
  if (!isPublicChessGame(game)) return;

  openChessGamePanel(game, currentUserId, (gameId, from, to, promotion) => {
    sendGameAction(gameId, 'move', promotion ? { from, promotion, to } : { from, to });
  }, onPanelChange);
}

function updateChessPanel(nextState: PlaygroundClientState): void {
  const activeChessGameId = getActiveChessGameId();
  if (!activeChessGameId || !nextState.userId) return;

  if (nextState.endedGame?.gameId === activeChessGameId) {
    if (nextState.endedGame.userId === nextState.userId) {
      closeChessGamePanel({ notify: false });
    } else {
      showChessGameEndedNotice(t('gamesOpponentLeft'));
    }
    return;
  }

  const game = nextState.games.find((candidate) => candidate.gameId === activeChessGameId);
  if (isPublicChessGame(game)) {
    updateChessGamePanel(game, nextState.userId);
  }
}
