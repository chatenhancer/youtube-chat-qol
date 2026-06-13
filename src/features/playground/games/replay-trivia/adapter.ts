/**
 * Replay Trivia game adapter.
 *
 * Connects the generic Games lobby to the HELP-A-FRIEND! Trivia canvas panel
 * and translates panel intents into room actions.
 */
import type { PublicGame } from '../../../../shared/playground-protocol';
import { isLiveChatReplayUrl } from '../../../../youtube/timestamps';
import type { GamePanelAdapter } from '../adapter';
import type { PlaygroundClientState } from '../client';
import {
  closeReplayTriviaGamePanel,
  getActiveReplayTriviaGameId,
  isPublicReplayTriviaGame,
  isReplayTriviaGamePanelOpen,
  openReplayTriviaGamePanel,
  updateReplayTriviaGamePanel
} from './panel';
import { renderReplayTriviaPreview } from './preview';

export const replayTriviaGameAdapter: GamePanelAdapter = {
  closePanel: closeReplayTriviaGamePanel,
  definition: {
    disabledReasonKey: 'gamesReplayTriviaReplayOnly',
    id: 'replay-trivia',
    isPlayable: isLiveChatReplayUrl,
    labelKey: 'gamesReplayTrivia',
    renderPreview: renderReplayTriviaPreview
  },
  getActiveGameId: getActiveReplayTriviaGameId,
  getOpponentLabel: getReplayTriviaOpponentLabel,
  isGame: isPublicReplayTriviaGame,
  isPanelOpen: isReplayTriviaGamePanelOpen,
  openPanel: openReplayTriviaPanel,
  updatePanel: updateReplayTriviaPanel
};

function getReplayTriviaOpponentLabel(game: PublicGame, currentUserId: string): string {
  if (!isPublicReplayTriviaGame(game)) return 'Player';
  const opponent = game.players.host.userId === currentUserId
    ? game.players.guest
    : game.players.host;
  return opponent.displayName || 'Player';
}

function openReplayTriviaPanel(
  game: PublicGame,
  currentUserId: string,
  sendGameAction: (gameId: string, action: string, payload?: Record<string, unknown>) => void,
  onPanelChange: () => void
): void {
  if (!isPublicReplayTriviaGame(game)) return;

  openReplayTriviaGamePanel(game, currentUserId, sendGameAction, onPanelChange);
}

function updateReplayTriviaPanel(nextState: PlaygroundClientState): void {
  const activeGameId = getActiveReplayTriviaGameId();
  if (!activeGameId || !nextState.userId) return;

  if (nextState.endedGame?.gameId === activeGameId) {
    closeReplayTriviaGamePanel({ notify: false });
    return;
  }

  const game = nextState.games.find((candidate) => candidate.gameId === activeGameId);
  if (isPublicReplayTriviaGame(game)) {
    updateReplayTriviaGamePanel(
      game,
      nextState.userId,
      nextState.replayTriviaGenerationTokens[activeGameId],
      nextState.error
    );
    return;
  }

  closeReplayTriviaGamePanel({ notify: false });
}
