import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_SOURCE,
  REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_TYPE,
  REPLAY_TRIVIA_QUESTIONS_BACKGROUND_MESSAGE
} from '../../../../shared/playground-trivia';
import { PLAYGROUND_BACKEND_ORIGIN } from '../../../../shared/playground-protocol';
import {
  generateReplayTriviaQuestions,
  requestReplayTriviaCaptchaPass,
  requestReplayTriviaQuestions
} from './client';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(chrome.runtime, 'lastError', {
    configurable: true,
    value: undefined
  });
});

describe('Replay Trivia client', () => {
  it('requests question generation through the extension background bridge by default', async () => {
    const request = createQuestionsRequest();
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
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
    const popup = mockCaptchaPopup();
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
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
      userId: 'user-123',
      videoId: 'SHt3FyE-VIQ'
    })).resolves.toEqual(createQuestionsResponse());

    expect(popup.close).toHaveBeenCalled();
    const captchaFeatures = String(vi.mocked(window.open).mock.calls[0]?.[2]);
    expect(captchaFeatures).toContain('popup=yes');
    expect(captchaFeatures).toContain('width=420');
    expect(captchaFeatures).toContain('height=560');
    expect(captchaFeatures).toContain('left=');
    expect(captchaFeatures).toContain('top=');
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

  it('rejects when the background bridge does not answer or reports lastError', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.(undefined);
    }) as typeof chrome.runtime.sendMessage);

    await expect(requestReplayTriviaQuestions('SHt3FyE-VIQ', createQuestionsRequest()))
      .rejects.toThrow('Replay Trivia request failed.');

    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: { message: 'extension context invalidated' }
      });
      callback?.(undefined);
    }) as typeof chrome.runtime.sendMessage);

    await expect(requestReplayTriviaQuestions('SHt3FyE-VIQ', createQuestionsRequest()))
      .rejects.toThrow('extension context invalidated');
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

  it('requires a normalized stream key before fetching transcript data', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateReplayTriviaQuestions({
      gameId: 'game-replay-trivia',
      generationToken: 'rtg_1234567890abcdef',
      streamKey: 'bad stream!',
      userId: 'user-123',
      videoId: 'SHt3FyE-VIQ'
    })).rejects.toThrow('A YouTube stream key is required for Replay Trivia.');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a blocked Replay Trivia verification window', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    await expect(requestReplayTriviaCaptchaPass({
      gameId: 'game-replay-trivia',
      streamKey: 'SHt3FyE-VIQ',
      userId: 'user-123'
    })).rejects.toThrow('Verification window was blocked. Allow popups for this stream and try again.');
  });

  it.each([
    ['non-object response', null],
    ['invalid generatedAt', { ...createQuestionsResponse(), generatedAt: null }],
    ['invalid languageCode', { ...createQuestionsResponse(), languageCode: 12 }],
    ['invalid model', { ...createQuestionsResponse(), model: false }],
    ['empty questions', { ...createQuestionsResponse(), questions: [] }],
    ['missing transcript window', { ...createQuestionsResponse(), transcriptWindow: null }],
    ['non-object question', { ...createQuestionsResponse(), questions: [null] }],
    ['invalid choices', mutateFirstQuestion({ choices: ['A', 'B', 'C'] })],
    ['blank choice', mutateFirstQuestion({ choices: ['A', 'B', ' ', 'D'] })],
    ['invalid answer index', mutateFirstQuestion({ correctChoiceIndex: 9 })],
    ['invalid difficulty', mutateFirstQuestion({ difficulty: 'hard' })],
    ['blank explanation', mutateFirstQuestion({ explanation: '' })],
    ['blank friend intro', mutateFirstQuestion({ friendIntro: ' ' })],
    ['blank id', mutateFirstQuestion({ id: '' })],
    ['blank prompt', mutateFirstQuestion({ prompt: '' })],
    ['blank right reply', mutateFirstQuestion({ rightReply: '' })],
    ['invalid source end', mutateFirstQuestion({ sourceEndSeconds: Number.POSITIVE_INFINITY })],
    ['invalid source start', mutateFirstQuestion({ sourceStartSeconds: '1' })],
    ['blank wrong reply', mutateFirstQuestion({ wrongReply: '' })]
  ])('rejects malformed background question responses: %s', async (_name, response) => {
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((_message: unknown, callback?: (response: unknown) => void) => {
      callback?.({
        ok: true,
        response
      });
    }) as typeof chrome.runtime.sendMessage);

    await expect(requestReplayTriviaQuestions('SHt3FyE-VIQ', createQuestionsRequest()))
      .rejects.toThrow('Replay Trivia question generation returned an incomplete question pack.');
  });
});

function createQuestionsRequest() {
  return {
    captchaPass: 'cap_1234567890abcdef',
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

function mockCaptchaPopup() {
  const popup = {
    closed: false,
    close: vi.fn(() => {
      popup.closed = true;
    })
  };
  vi.spyOn(window, 'open').mockImplementation((url) => {
    const requestId = new URL(String(url)).searchParams.get('requestId') || '';
    queueMicrotask(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: {
          captchaPass: 'cap_1234567890abcdef',
          requestId,
          source: REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_SOURCE,
          type: REPLAY_TRIVIA_CAPTCHA_POST_MESSAGE_TYPE
        },
        origin: PLAYGROUND_BACKEND_ORIGIN
      }));
    });
    return popup as unknown as Window;
  });
  return popup;
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

function mutateFirstQuestion(overrides: Record<string, unknown>) {
  const response = createQuestionsResponse();
  return {
    ...response,
    questions: [
      {
        ...response.questions[0],
        ...overrides
      }
    ]
  };
}
