import { chessGameAdapter } from './chess/adapter';
import { replayTriviaGameAdapter } from './replay-trivia/adapter';
import type { GamePanelAdapter } from './adapter';

export const ENABLED_GAME_ADAPTERS: readonly GamePanelAdapter[] = [
  chessGameAdapter,
  replayTriviaGameAdapter
];
