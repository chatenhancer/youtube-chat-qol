/**
 * Replay Trivia HTTP routes.
 *
 * Replay Trivia is a Playground game, but question generation is a request/
 * response job rather than realtime room state. The route also owns the small
 * request handler because this game currently has only one support route.
 */
import { REPLAY_TRIVIA_QUESTIONS_ROUTE } from '../../../../../src/shared/playground-trivia';
import { createErrorResponse, createJsonResponse } from '../../http';
import { getLogErrorType, hashLogValue, logPlaygroundEvent } from '../../logging';
import { createRouteResult, type RouteModule, type RouteResult, type StreamRouteContext } from '../../routes/types';
import type { Env } from '../../types';
import { ReplayTriviaError } from './errors';
import { generateReplayTriviaQuestions } from './openai';
import { getTranscriptCharLength, parseReplayTriviaQuestionsRequest } from './validation';

const MAX_REQUEST_BYTES = 512_000;

export const replayTriviaRouteModule = {
  streamRoutes: [
    {
      handle: handleReplayTriviaQuestionsRoute,
      name: 'replay_trivia_questions',
      path: REPLAY_TRIVIA_QUESTIONS_ROUTE
    }
  ]
} satisfies RouteModule;

async function handleReplayTriviaQuestionsRoute(
  { env, request, streamKey }: StreamRouteContext
): Promise<RouteResult> {
  return createRouteResult(await handleReplayTriviaQuestionsRequest(request, env, streamKey));
}

async function handleReplayTriviaQuestionsRequest(
  request: Request,
  env: Env,
  streamKey: string
): Promise<Response> {
  if (request.method !== 'POST') {
    return createErrorResponse('method_not_allowed', 'Only POST is supported.', 405);
  }

  const contentLength = Number(request.headers.get('Content-Length') || '0');
  if (contentLength > MAX_REQUEST_BYTES) {
    logPlaygroundEvent('replay_trivia_request_too_large', {
      bytes: contentLength,
      maxBytes: MAX_REQUEST_BYTES,
      room: hashLogValue(streamKey)
    }, 'warn');
    return createErrorResponse('request_too_large', `Request body must be ${MAX_REQUEST_BYTES} bytes or less.`, 413);
  }

  try {
    const requestBody = parseReplayTriviaQuestionsRequest(await request.json());
    logPlaygroundEvent('replay_trivia_requested', {
      bytes: contentLength || undefined,
      chars: getTranscriptCharLength(requestBody.segments),
      game: hashLogValue(requestBody.gameId),
      questionCount: requestBody.questionCount,
      room: hashLogValue(streamKey),
      segments: requestBody.segments.length,
      video: hashLogValue(requestBody.videoId)
    });

    const tokenError = await consumeReplayTriviaGenerationToken(env, streamKey, requestBody);
    if (tokenError) return tokenError;

    const response = await generateReplayTriviaQuestions(env, requestBody);
    logPlaygroundEvent('replay_trivia_generated', {
      game: hashLogValue(requestBody.gameId),
      model: response.model,
      questionCount: response.questions.length,
      room: hashLogValue(streamKey),
      video: hashLogValue(requestBody.videoId)
    });
    return createJsonResponse(response);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createErrorResponse('invalid_json', 'Request body must be valid JSON.', 400);
    }
    if (error instanceof ReplayTriviaError) {
      logPlaygroundEvent('replay_trivia_failed', {
        code: error.code,
        errorType: getLogErrorType(error),
        room: hashLogValue(streamKey),
        status: error.status
      }, error.status >= 500 ? 'error' : 'warn');
      return createErrorResponse(error.code, error.message, error.status);
    }

    logPlaygroundEvent('replay_trivia_failed', {
      errorType: getLogErrorType(error),
      room: hashLogValue(streamKey)
    }, 'error');
    return createErrorResponse('trivia_generation_failed', 'Replay Trivia question generation failed.', 500);
  }
}

async function consumeReplayTriviaGenerationToken(
  env: Env,
  streamKey: string,
  requestBody: {
    gameId: string;
    generationToken: string;
  }
): Promise<Response | null> {
  const durableObjectId = env.STREAM_ROOMS.idFromName(streamKey);
  const room = env.STREAM_ROOMS.get(durableObjectId);
  const response = await room.fetch(new Request(
    'https://internal.chat-enhancer.local/internal/replay-trivia/generation-token/consume',
    {
      body: JSON.stringify({
        gameId: requestBody.gameId,
        generationToken: requestBody.generationToken
      }),
      headers: {
        'Content-Type': 'application/json',
        'X-Chat-Enhancer-Stream-Key': streamKey
      },
      method: 'POST'
    }
  ));
  if (response.ok) return null;

  let code = 'invalid_generation_token';
  let message = 'Replay Trivia generation token is invalid or expired.';
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    code = body.error?.code || code;
    message = body.error?.message || message;
  } catch {
    // Preserve the generic token failure for malformed internal responses.
  }

  logPlaygroundEvent('replay_trivia_token_rejected', {
    code,
    game: hashLogValue(requestBody.gameId),
    room: hashLogValue(streamKey),
    status: response.status
  }, 'warn');
  return createErrorResponse(code, message, response.status);
}
