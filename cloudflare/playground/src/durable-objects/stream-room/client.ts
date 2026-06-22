import type { Env } from '../../types';

const GAME_GENERATION_TOKEN_CONSUME_URL =
  'https://stream-room.internal/internal/games/generation-token/consume';
const STREAM_ROOM_STREAM_KEY_HEADER = 'X-Chat-Enhancer-Stream-Key';

export interface GameGenerationTokenInput {
  gameId: string;
  generationToken: string;
}

export function forwardStreamRoomRequest(
  env: Pick<Env, 'STREAM_ROOMS'>,
  streamKey: string,
  request: Request
): Promise<Response> {
  const headers = new Headers(request.headers);
  headers.set(STREAM_ROOM_STREAM_KEY_HEADER, streamKey);
  return getStreamRoom(env, streamKey).fetch(new Request(request, { headers }));
}

export function consumeStreamRoomGenerationToken(
  env: Pick<Env, 'STREAM_ROOMS'>,
  streamKey: string,
  input: GameGenerationTokenInput
): Promise<Response> {
  return getStreamRoom(env, streamKey).fetch(new Request(GAME_GENERATION_TOKEN_CONSUME_URL, {
    body: JSON.stringify({
      gameId: input.gameId,
      generationToken: input.generationToken
    }),
    headers: {
      'Content-Type': 'application/json',
      [STREAM_ROOM_STREAM_KEY_HEADER]: streamKey
    },
    method: 'POST'
  }));
}

function getStreamRoom(env: Pick<Env, 'STREAM_ROOMS'>, streamKey: string): { fetch: typeof fetch } {
  const durableObjectId = env.STREAM_ROOMS.idFromName(streamKey);
  return env.STREAM_ROOMS.get(durableObjectId);
}
