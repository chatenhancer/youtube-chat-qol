import type {
  PlaygroundActionError,
  ServerMessage
} from '../../../../shared/playground/protocol';
import type { ReplayTriviaGenerationToken } from '../../../../shared/playground/trivia';

const generationTokens = new Map<string, ReplayTriviaGenerationToken>();
const preparationErrors = new Map<string, string>();

export function handleReplayTriviaGameEnded(gameId: string): void {
  generationTokens.delete(gameId);
  preparationErrors.delete(gameId);
}

export function takeReplayTriviaGenerationToken(gameId: string): ReplayTriviaGenerationToken | undefined {
  const token = generationTokens.get(gameId);
  generationTokens.delete(gameId);
  return token;
}

export function takeReplayTriviaPreparationError(
  gameId: string
): string | undefined {
  const error = preparationErrors.get(gameId);
  preparationErrors.delete(gameId);
  return error;
}

export function handleReplayTriviaActionError(error: PlaygroundActionError): boolean {
  const request = error.request;
  if (
    error.code === 'game_version' ||
    request?.type !== 'gameAction' ||
    (request.action !== 'requestGenerationToken' && request.action !== 'submitQuestions')
  ) {
    return false;
  }

  preparationErrors.set(request.gameId, error.message);
  return true;
}

export function handleReplayTriviaServerMessage(message: ServerMessage): boolean {
  if (
    (message.type === 'gameStarted' || message.type === 'gameUpdated') &&
    message.game.gameType === 'replay-trivia' &&
    message.game.status !== 'preparing'
  ) {
    generationTokens.delete(message.game.gameId);
    preparationErrors.delete(message.game.gameId);
    return false;
  }
  if (message.type !== 'replayTriviaGenerationToken') return false;

  generationTokens.set(message.gameId, {
    expiresAt: message.expiresAt,
    gameId: message.gameId,
    generationToken: message.generationToken
  });
  preparationErrors.delete(message.gameId);
  return true;
}

export function resetReplayTriviaClientData(): void {
  generationTokens.clear();
  preparationErrors.clear();
}
