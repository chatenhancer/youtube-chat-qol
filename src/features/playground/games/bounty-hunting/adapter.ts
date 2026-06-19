/**
 * Bounty Hunting game adapter.
 *
 * Connects the generic Games lobby to the bounty-hunt canvas panel and keeps
 * live-chat-only availability separate from Replay Trivia's replay-only flow.
 */
import { isLiveChatReplayUrl } from '../../../../youtube/timestamps';
import type {
  EnabledGame,
  GameDefinition,
  GamePanelAdapter,
  GamePanelMount,
  GamePanelMountContext,
  GamePanelUpdateContext
} from '../adapter';
import { renderBountyHuntingPreview } from './preview';
import {
  closeBountyHuntingGamePanel,
  openBountyHuntingGamePanel,
  setBountyHuntingCompactMode,
  updateBountyHuntingGamePanel
} from './panel';
import type { PublicBountyHuntingGame } from './types';

export const bountyHuntingGameDefinition: GameDefinition = {
  classNamePrefix: 'ytcq-bounty-hunting-game',
  disabledReasonKey: 'gamesBountyHuntingLiveOnly',
  id: 'bounty-hunting',
  isPlayable: () => !isLiveChatReplayUrl(),
  labelKey: 'gamesBountyHunting',
  renderPreview: renderBountyHuntingPreview
};

export const bountyHuntingGameAdapter: GamePanelAdapter<PublicBountyHuntingGame> = {
  mountPanel: mountBountyHuntingPanel,
  updatePanel: updateBountyHuntingPanel
};

export const bountyHuntingGame: EnabledGame<PublicBountyHuntingGame> = {
  adapter: bountyHuntingGameAdapter,
  definition: bountyHuntingGameDefinition,
  getOpponentLabel: getBountyHuntingOpponentLabel
};

function mountBountyHuntingPanel(game: PublicBountyHuntingGame, context: GamePanelMountContext): GamePanelMount {
  const { closePanel, controls, currentUserId, onPanelChange, sendGameAction, shell } = context;
  openBountyHuntingGamePanel(shell, game, currentUserId, sendGameAction, onPanelChange, closePanel, controls);
  return {
    close: closeBountyHuntingGamePanel,
    gameId: game.gameId,
    setCompactMode: setBountyHuntingCompactMode
  };
}

function updateBountyHuntingPanel(game: PublicBountyHuntingGame, context: GamePanelUpdateContext): void {
  updateBountyHuntingGamePanel(game, context.currentUserId);
}

function getBountyHuntingOpponentLabel(game: PublicBountyHuntingGame, currentUserId: string): string {
  const opponent = game.players.host.userId === currentUserId
    ? game.players.guest
    : game.players.host;
  return opponent.displayName || 'Player';
}
