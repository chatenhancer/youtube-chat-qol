import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
} from '../../../../shared/playground-trivia';
import { generateReplayTriviaQuestions, requestReplayTriviaQuestions } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Replay Trivia client', () => {
  it('requests question generation through the extension background bridge by default', async () => {
    const request = createQuestionsRequest();
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      callback?.({
        ok: true,
        response: createQuestionsResponse()
      });
    }) as typeof chrome.runtime.sendMessage);

    await expect(requestReplayTriviaQuestions('SHt3FyE-VIQ', request)).resolves.toEqual(createQuestionsResponse());

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      request,
      streamKey: 'SHt3FyE-VIQ',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, expect.any(Function));
  });

  it('generates questions through the background bridge after fetching transcript data', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('https://www.youtube.com/watch')) {
        return new Response(`
          <script>
            var ytInitialPlayerResponse = ${JSON.stringify({
              captions: {
                playerCaptionsTracklistRenderer: {
                  captionTracks: [
                    {
                      baseUrl: 'https://www.youtube.com/api/timedtext?v=SHt3FyE-VIQ&lang=en',
                      languageCode: 'en'
                    }
                  ]
                }
              }
            })};
          </script>
        `);
      }
      if (url.startsWith('https://www.youtube.com/api/timedtext')) {
        return new Response(JSON.stringify({
          events: [
            { dDurationMs: 2000, segs: [{ utf8: 'The winner is announced.' }], tStartMs: 1000 }
          ]
        }));
      }
      throw new Error(`Unexpected direct fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((message: unknown, callback?: (response: unknown) => void) => {
      callback?.({
        ok: true,
        response: createQuestionsResponse()
      });
    }) as typeof chrome.runtime.sendMessage);

    await expect(generateReplayTriviaQuestions({
      endSeconds: 10,
      gameId: 'game-replay-trivia',
      generationToken: 'rtg_1234567890abcdef',
      questionCount: 10,
      startSeconds: 0,
      streamKey: 'SHt3FyE-VIQ',
      videoId: 'SHt3FyE-VIQ'
    })).resolves.toEqual(createQuestionsResponse());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      request: {
        ...createQuestionsRequest(),
        questionCount: 10
      },
      streamKey: 'SHt3FyE-VIQ',
      type: REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
    }, expect.any(Function));
  });

  it('rejects with the background bridge error', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({
        error: 'Replay Trivia question generation is not configured.',
        ok: false
      });
    }) as typeof chrome.runtime.sendMessage);

    await expect(requestReplayTriviaQuestions('SHt3FyE-VIQ', createQuestionsRequest()))
      .rejects.toThrow('Replay Trivia question generation is not configured.');
  });

  it('rejects an incomplete generated question pack before room submission', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      const response = createQuestionsResponse();
      callback?.({
        ok: true,
        response: {
          ...response,
          questions: response.questions.map(({ friendIntro: _friendIntro, ...question }) => question)
        }
      });
    }) as typeof chrome.runtime.sendMessage);

    await expect(requestReplayTriviaQuestions('SHt3FyE-VIQ', createQuestionsRequest()))
      .rejects.toThrow('Replay Trivia question generation returned an incomplete question pack.');
  });

  it('requires room generation authorization before fetching transcript data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateReplayTriviaQuestions({
      streamKey: 'SHt3FyE-VIQ',
      videoId: 'SHt3FyE-VIQ'
    })).rejects.toThrow('Replay Trivia generation authorization is required.');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createQuestionsRequest() {
  return {
    endSeconds: 10,
    gameId: 'game-replay-trivia',
    generationToken: 'rtg_1234567890abcdef',
    languageCode: 'en',
    segments: [
      {
        durationSeconds: 2,
        startSeconds: 1,
        text: 'The winner is announced.'
      }
    ],
    startSeconds: 0,
    videoId: 'SHt3FyE-VIQ'
  };
}

function createQuestionsResponse() {
  return {
    generatedAt: '2026-06-12T00:00:00.000Z',
    languageCode: 'en',
    model: 'gpt-test',
    questions: [
      {
        choices: ['The Last of Us', 'God of War', 'Yandere Simulator', 'The Sims 4'],
        correctChoiceIndex: 0,
        difficulty: 'easy',
        explanation: 'The transcript says The Last of Us won.',
        friendIntro: 'quick, which game took the trophy here?',
        id: 'q_1',
        prompt: 'Who won the award mentioned in the replay?',
        rightReply: 'wow, you remembered the trophy.',
        sourceEndSeconds: 8,
        sourceStartSeconds: 1,
        wrongReply: 'you missed it. it was The Last of Us.'
      }
    ],
    transcriptWindow: {
      endSeconds: 10,
      segmentCount: 1,
      startSeconds: 0,
      videoId: 'SHt3FyE-VIQ'
    }
  };
}
