/**
 * Replay Trivia game adapter.
 *
 * Connects the generic Games lobby to the HELP-A-FRIEND! Trivia canvas panel
 * and translates panel intents into room actions.
 */
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
  handleReplayTriviaPanelActionError,
  openReplayTriviaGamePanel,
  resetReplayTriviaGamePanelClientState,
  updateReplayTriviaGamePanel
} from './panel';
import { renderReplayTriviaPreview } from './preview';
import {
  handleReplayTriviaActionError,
  handleReplayTriviaGameEnded,
  handleReplayTriviaServerMessage,
  resetReplayTriviaClientData,
  takeReplayTriviaPreparationError,
  takeReplayTriviaGenerationToken
} from './client-data';
import type { PublicReplayTriviaGame } from './types';

export const replayTriviaGameDefinition: GameDefinition = {
  availability: 'replay',
  classNamePrefix: 'ytcq-replay-trivia-game',
  id: 'replay-trivia',
  labelKey: 'gamesReplayTrivia',
  renderPreview: renderReplayTriviaPreview,
  taglineKey: 'gamesReplayTriviaTagline'
};

export const replayTriviaGameAdapter: GamePanelAdapter<PublicReplayTriviaGame> = {
  mountPanel: mountReplayTriviaPanel,
  updatePanel: updateReplayTriviaPanel
};

export const replayTriviaGame: EnabledGame<PublicReplayTriviaGame> = {
  adapter: replayTriviaGameAdapter,
  definition: replayTriviaGameDefinition,
  getOpponentLabel: getReplayTriviaOpponentLabel,
  handleActionError: (error) =>
    handleReplayTriviaPanelActionError(error) || handleReplayTriviaActionError(error),
  handleServerMessage: handleReplayTriviaServerMessage,
  onClientReset: resetReplayTriviaGameClientState,
  onGameEnded: handleReplayTriviaGameEnded
};

function resetReplayTriviaGameClientState(): void {
  resetReplayTriviaClientData();
  resetReplayTriviaGamePanelClientState();
}

function mountReplayTriviaPanel(game: PublicReplayTriviaGame, context: GamePanelMountContext): GamePanelMount {
  const { closePanel, currentUserId, onPanelChange, sendGameAction, shell } = context;

  openReplayTriviaGamePanel(
    shell,
    game,
    currentUserId,
    sendGameAction,
    onPanelChange,
    closePanel,
    {
      generationToken: takeReplayTriviaGenerationToken(game.gameId),
      preparationError: takeReplayTriviaPreparationError(game.gameId)
    }
  );

  return {
    close: closeReplayTriviaGamePanel,
    gameId: game.gameId
  };
}

function updateReplayTriviaPanel(game: PublicReplayTriviaGame, context: GamePanelUpdateContext): void {
  const { currentUserId } = context;

  updateReplayTriviaGamePanel(
    game,
    currentUserId,
    takeReplayTriviaGenerationToken(game.gameId),
    takeReplayTriviaPreparationError(game.gameId)
  );
}

function getReplayTriviaOpponentLabel(game: PublicReplayTriviaGame, currentUserId: string): string {
  const opponent = game.players.host.userId === currentUserId
    ? game.players.guest
    : game.players.host;
  return opponent.displayName || 'Player';
}
