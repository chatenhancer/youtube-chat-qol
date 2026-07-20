import { PLAYGROUND_BACKEND_ORIGIN } from '../shared/playground/protocol';
import {
  REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE,
  REPLAY_TRIVIA_QUESTIONS_ROUTE,
  type ReplayTriviaQuestionsBackgroundMessage,
  type ReplayTriviaQuestionsBackgroundResponse,
  type ReplayTriviaQuestionsResponse
} from '../shared/playground/trivia';

export function handleReplayTriviaBackgroundMessage(
  message: unknown,
  sendResponse: (response: ReplayTriviaQuestionsBackgroundResponse) => void
): boolean {
  if (!isReplayTriviaQuestionsBackgroundMessage(message)) return false;
  void requestReplayTriviaQuestions(message).then(sendResponse);
  return true;
}

async function requestReplayTriviaQuestions(
  message: ReplayTriviaQuestionsBackgroundMessage
): Promise<ReplayTriviaQuestionsBackgroundResponse> {
  const streamKey = normalizeStreamKey(message.streamKey);
  if (!streamKey) {
    return {
      error: 'A YouTube stream key is required for Replay Trivia.',
      ok: false
    };
  }

  const url = new URL(
    `/v1/streams/${encodeURIComponent(streamKey)}/${REPLAY_TRIVIA_QUESTIONS_ROUTE}`,
    PLAYGROUND_BACKEND_ORIGIN
  );

  try {
    const response = await fetch(url.toString(), {
      body: JSON.stringify(message.request),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });

    if (!response.ok) {
      return {
        ...await getReplayTriviaError(response),
        ok: false,
        status: response.status
      };
    }

    return {
      ok: true,
      response: await response.json() as ReplayTriviaQuestionsResponse
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Replay Trivia request failed.',
      ok: false
    };
  }
}

function isReplayTriviaQuestionsBackgroundMessage(value: unknown): value is ReplayTriviaQuestionsBackgroundMessage {
  if (!isRecord(value)) return false;
  return value.type === REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE &&
    typeof value.streamKey === 'string' &&
    isRecord(value.request);
}

function normalizeStreamKey(value: string): string {
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]{4,80}$/.test(trimmed) ? trimmed : '';
}

async function getReplayTriviaError(response: Response): Promise<{ code?: string; error: string }> {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string } };
    return {
      code: body.error?.code,
      error: body.error?.message || `Replay Trivia request failed with ${response.status}.`
    };
  } catch {
    return {
      error: `Replay Trivia request failed with ${response.status}.`
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
