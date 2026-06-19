import type { ServerMessage } from '../../../../shared/playground/protocol';
import type { ReplayTriviaGenerationToken } from '../../../../shared/playground/trivia';

let generationTokens: Record<string, ReplayTriviaGenerationToken> = {};

export function handleReplayTriviaGameEnded(gameId: string): void {
  const next = { ...generationTokens };
  delete next[gameId];
  generationTokens = next;
}

export function getReplayTriviaGenerationToken(gameId: string): ReplayTriviaGenerationToken | undefined {
  return generationTokens[gameId];
}

export function handleReplayTriviaServerMessage(message: ServerMessage): boolean {
  if (message.type !== 'replayTriviaGenerationToken') return false;

  generationTokens = {
    ...generationTokens,
    [message.gameId]: {
      expiresAt: message.expiresAt,
      gameId: message.gameId,
      generationToken: message.generationToken
    }
  };
  return true;
}

export function resetReplayTriviaClientData(): void {
  generationTokens = {};
}
