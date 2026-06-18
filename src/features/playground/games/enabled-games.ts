import { chessGame } from './chess/adapter';
import { replayTriviaGame } from './replay-trivia/adapter';
import type { AnyEnabledGame } from './adapter';

export const ENABLED_GAMES: readonly AnyEnabledGame[] = [
  chessGame,
  replayTriviaGame
];
