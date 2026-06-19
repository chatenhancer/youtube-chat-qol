/**
 * Enabled realtime Playground games.
 *
 * Add a game module here when the Durable Object should allow users to invite,
 * start, and exchange actions for that game. HTTP-only game features can expose
 * routes separately without appearing in this list yet.
 */
import { chessGameModule } from './chess';
import { replayTriviaGameModule } from './replay-trivia';
import { bountyHuntingGameModule } from './bounty-hunting';

export const ENABLED_GAME_MODULES = [
  {
    gameId: 'chess',
    module: chessGameModule
  },
  {
    gameId: 'bounty-hunting',
    module: bountyHuntingGameModule
  },
  {
    gameId: 'replay-trivia',
    module: replayTriviaGameModule
  }
] as const;
