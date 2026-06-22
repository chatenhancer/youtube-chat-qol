import { t } from '../../../../shared/i18n';
import { isLiveChatReplayUrl } from '../../../../youtube/timestamps';
import type {
  EnabledGame,
  GameDefinition,
  GameOverlayMountContext,
  GamePanelAdapter,
  GamePanelMount,
  GamePanelMountContext,
  GamePanelUpdateContext
} from '../adapter';
import {
  closeStickAroundOverlay,
  getStickAroundOverlayStatusOverlay,
  isStickAroundOverlayConnected,
  openStickAroundOverlay,
  updateStickAroundOverlay
} from './overlay';
import { renderStickAroundPreview } from './preview';
import type { PublicStickAroundGame } from './types';

export const stickAroundGameDefinition: GameDefinition = {
  classNamePrefix: 'ytcq-stick-around-game',
  disabledReasonKey: 'gamesStickAroundLiveOnly',
  id: 'stick-around',
  isPlayable: () => !isLiveChatReplayUrl(),
  labelKey: 'gamesStickAround',
  renderPreview: renderStickAroundPreview,
  surface: 'chat-overlay',
  taglineKey: 'gamesStickAroundTagline'
};

export const stickAroundGameAdapter: GamePanelAdapter<PublicStickAroundGame> = {
  mountOverlay: mountStickAroundOverlay,
  mountPanel: mountUnsupportedStickAroundPanel,
  updatePanel: updateStickAroundPanel
};

export const stickAroundGame: EnabledGame<PublicStickAroundGame> = {
  adapter: stickAroundGameAdapter,
  definition: stickAroundGameDefinition,
  getOpponentLabel: getStickAroundOpponentLabel
};

function mountStickAroundOverlay(game: PublicStickAroundGame, context: GameOverlayMountContext): GamePanelMount | null {
  const { closePanel, currentUserId, onPanelChange, sendGameAction } = context;
  const opened = openStickAroundOverlay(game, currentUserId, sendGameAction, onPanelChange, closePanel);
  if (!opened) return null;
  return {
    close: closeStickAroundOverlay,
    gameId: game.gameId,
    isConnected: isStickAroundOverlayConnected,
    statusOverlay: getStickAroundOverlayStatusOverlay()
  };
}

function mountUnsupportedStickAroundPanel(
  _game: PublicStickAroundGame,
  _context: GamePanelMountContext
): GamePanelMount {
  throw new Error('Stick Around uses a chat overlay surface.');
}

function updateStickAroundPanel(game: PublicStickAroundGame, context: GamePanelUpdateContext): void {
  updateStickAroundOverlay(game, context.currentUserId);
}

function getStickAroundOpponentLabel(game: PublicStickAroundGame, currentUserId: string): string {
  const opponent = game.players.host.userId === currentUserId
    ? game.players.guest
    : game.players.host;
  return opponent.displayName || t('gamesStickAroundPlayer');
}
