/**
 * Replay Trivia game adapter.
 *
 * Connects the generic Games lobby to the HELP-A-FRIEND! Trivia canvas panel
 * and translates panel intents into room actions.
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
import {
  closeReplayTriviaGamePanel,
  openReplayTriviaGamePanel,
  updateReplayTriviaGamePanel
} from './panel';
import { renderReplayTriviaPreview } from './preview';
import {
  getReplayTriviaGenerationToken,
  handleReplayTriviaGameEnded,
  handleReplayTriviaServerMessage,
  resetReplayTriviaClientData
} from './client-data';
import type { PublicReplayTriviaGame } from './types';

export const replayTriviaGameDefinition: GameDefinition = {
  classNamePrefix: 'ytcq-replay-trivia-game',
  disabledReasonKey: 'gamesReplayTriviaReplayOnly',
  id: 'replay-trivia',
  isPlayable: isLiveChatReplayUrl,
  labelKey: 'gamesReplayTrivia',
  renderPreview: renderReplayTriviaPreview
};

export const replayTriviaGameAdapter: GamePanelAdapter<PublicReplayTriviaGame> = {
  mountPanel: mountReplayTriviaPanel,
  updatePanel: updateReplayTriviaPanel
};

export const replayTriviaGame: EnabledGame<PublicReplayTriviaGame> = {
  adapter: replayTriviaGameAdapter,
  definition: replayTriviaGameDefinition,
  getOpponentLabel: getReplayTriviaOpponentLabel,
  handleServerMessage: handleReplayTriviaServerMessage,
  onClientReset: resetReplayTriviaClientData,
  onGameEnded: handleReplayTriviaGameEnded
};

function mountReplayTriviaPanel(game: PublicReplayTriviaGame, context: GamePanelMountContext): GamePanelMount {
  const { closePanel, currentUserId, onPanelChange, sendGameAction, shell } = context;

  openReplayTriviaGamePanel(shell, game, currentUserId, sendGameAction, onPanelChange, closePanel);

  return {
    close: closeReplayTriviaGamePanel,
    gameId: game.gameId
  };
}

function updateReplayTriviaPanel(game: PublicReplayTriviaGame, context: GamePanelUpdateContext): void {
  const { clientState, currentUserId } = context;

  updateReplayTriviaGamePanel(
    game,
    currentUserId,
    getReplayTriviaGenerationToken(game.gameId),
    clientState.error
  );
}

function getReplayTriviaOpponentLabel(game: PublicReplayTriviaGame, currentUserId: string): string {
  const opponent = game.players.host.userId === currentUserId
    ? game.players.guest
    : game.players.host;
  return opponent.displayName || 'Player';
}
