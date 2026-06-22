import { chessGame } from './chess/adapter';
import { replayTriviaGame } from './replay-trivia/adapter';
import { bountyHuntingGame } from './bounty-hunting/adapter';
import { stickAroundGame } from './stick-around/adapter';
import type { AnyEnabledGame } from './adapter';

export const ENABLED_GAMES: readonly AnyEnabledGame[] = [
  chessGame,
  bountyHuntingGame,
  replayTriviaGame,
  stickAroundGame
];
