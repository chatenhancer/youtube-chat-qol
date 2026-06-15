import type { Env } from '../../types';

export const COMPUTER_PLAYER_STREAM_KEY_HEADER = 'X-Chat-Enhancer-Stream-Key';

export function connectComputerPlayer(
  env: Pick<Env, 'COMPUTER_PLAYERS'>,
  streamKey: string
): Promise<Response> {
  if (!env.COMPUTER_PLAYERS) throw new Error('Computer player binding is not configured.');

  const computerPlayerId = env.COMPUTER_PLAYERS.idFromName(streamKey);
  return env.COMPUTER_PLAYERS.get(computerPlayerId).fetch(new Request('https://computer-player.internal/connect', {
    headers: {
      [COMPUTER_PLAYER_STREAM_KEY_HEADER]: streamKey
    },
    method: 'POST'
  }));
}
