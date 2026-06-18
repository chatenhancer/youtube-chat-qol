import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';
import { generateReplayTriviaQuestions } from './openai';

describe('Replay Trivia OpenAI adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests conversational Replay Trivia copy from OpenAI', async () => {
    let openAIRequest: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      openAIRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return createOpenAIResponse({
        friendIntro: 'chat, actor check',
        prompt: 'who won best performance for playing Arthur Morgan?'
      });
    }));

    const response = await generateReplayTriviaQuestions(createEnv(), createRequest());

    expect(openAIRequest).toEqual(expect.objectContaining({
      max_output_tokens: 5000,
      model: 'gpt-5.4-mini',
      reasoning: {
        effort: 'low'
      },
      store: false,
      text: expect.objectContaining({
        verbosity: 'medium'
      })
    }));
    expect(getSystemPrompt(openAIRequest)).toContain('friendIntro must not include the trivia question');
    expect(getSystemPrompt(openAIRequest)).toContain('Answer choices must be clean standalone answers.');
    expect(getSystemPrompt(openAIRequest)).toContain('About half of friendIntro lines can be lightly humorous');
    expect(getSystemPrompt(openAIRequest)).toContain('Do not put the correct answer first every time.');
    expect(getSystemPrompt(openAIRequest)).toContain('The game is called HELP-A-FRIEND! Trivia.');
    expect(getSystemPrompt(openAIRequest)).toContain('one friend clearly did not pay attention');
    expect(getSystemPrompt(openAIRequest)).toContain('roast or judgment');
    expect(getSystemPrompt(openAIRequest)).toContain('must be valid for any wrong choice');
    expect(getSystemPrompt(openAIRequest)).toContain('Write prompt like a real person asking in chat');
    expect(getSystemPrompt(openAIRequest)).toContain('Use plain "you"');
    expect(response.questions[0].friendIntro).toBe('chat, actor check');
    expect(response.questions[0].prompt).toBe('who won best performance for playing Arthur Morgan?');
    expect(response.questions[0].rightReply).toBe('thank you, Arthur would tip his hat to that one.');
    expect(response.questions[0].wrongReply).toBe('you missed it. it was Roger Clark.');
  });

  it('adds the correct answer to wrong replies when OpenAI omits it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createOpenAIResponse({
      friendIntro: 'actor check, chat',
      prompt: 'who won best performance for playing Arthur Morgan?',
      wrongReply: 'wow. thanks for nothing'
    })));

    const response = await generateReplayTriviaQuestions(createEnv(), createRequest());

    expect(response.questions[0].wrongReply).toBe('wow. thanks for nothing. it was Roger Clark.');
  });

  it('balances correct answer positions even when OpenAI puts every answer first', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createOpenAIOutputResponse({
      questions: Array.from({ length: 8 }, (_value, index) => createGeneratedQuestion({
        explanation: `The transcript says Roger Clark won best performance. ${index + 1}`,
        prompt: `which q${index + 1} answer was Roger Clark?`
      }))
    })));

    const response = await generateReplayTriviaQuestions(createEnv(), createRequest());
    const correctIndexes = response.questions.map((question) => question.correctChoiceIndex);
    const countsByIndex = [0, 1, 2, 3].map((index) => correctIndexes.filter((answerIndex) => answerIndex === index).length);

    expect(countsByIndex).toEqual([2, 2, 2, 2]);
    expect(response.questions[0].correctChoiceIndex).not.toBe(0);
    expect(response.questions.every((question) => question.choices[question.correctChoiceIndex] === 'Roger Clark')).toBe(true);
  });

  it('requests target languages and preserves localized answer order when balancing choices', async () => {
    let openAIRequest: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      openAIRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return createOpenAIOutputResponse({
        questions: [
          createGeneratedQuestion({
            localizations: [
              {
                choices: ['Roger Clark ES', 'Christopher Judge ES', 'Nolan North ES', 'Troy Baker ES'],
                friendIntro: 'actor check en es',
                languageCode: 'es',
                prompt: 'quien gano best performance?',
                rightReply: 'gracias por salvar esto.',
                wrongReply: 'fallaste. era Roger Clark ES.'
              }
            ]
          })
        ]
      });
    }));

    const response = await generateReplayTriviaQuestions(createEnv(), {
      ...createRequest(),
      targetLanguages: [
        { languageCode: 'en', locale: 'en-US' },
        { languageCode: 'es', locale: 'es' }
      ]
    });

    expect(getUserPayload(openAIRequest)?.targetLanguages).toEqual([
      { languageCode: 'en', locale: 'en-US' },
      { languageCode: 'es', locale: 'es' }
    ]);
    expect(response.questions[0].choices[response.questions[0].correctChoiceIndex]).toBe('Roger Clark');
    expect(response.questions[0].localizations?.[0]?.choices[response.questions[0].correctChoiceIndex])
      .toBe('Roger Clark ES');
  });

  it('uses nested output text and request defaults when optional request fields are omitted', async () => {
    let openAIRequest: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      openAIRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return createNestedOpenAIResponse({
        questions: [createGeneratedQuestion({
          choices: ['  Roger Clark  ', 'Christopher Judge', 'Nolan North', 'Troy Baker'],
          difficulty: 'medium'
        })]
      });
    }));

    const response = await generateReplayTriviaQuestions({
      ...createEnv(),
      OPENAI_MODEL: 'gpt-test'
    }, {
      ...createRequest(),
      languageCode: '',
      locale: '',
      questionCount: undefined
    });

    expect(getUserPayload(openAIRequest)).toEqual(expect.objectContaining({
      languageCode: 'en',
      locale: 'en',
      questionCount: 10,
      transcript: '[0:10] Roger Clark won best performance for Red Dead Redemption 2.'
    }));
    expect(response.languageCode).toBe('en');
    expect(response.model).toBe('gpt-test');
    expect(response.questions[0]).toEqual(expect.objectContaining({
      difficulty: 'medium',
      id: 'q_1'
    }));
    expect([...response.questions[0].choices].sort()).toEqual([
      'Christopher Judge',
      'Nolan North',
      'Roger Clark',
      'Troy Baker'
    ]);
    expect(response.questions[0].choices[response.questions[0].correctChoiceIndex]).toBe('Roger Clark');
  });

  it('formats transcript timestamps with hours in OpenAI requests', async () => {
    let openAIRequest: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      openAIRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return createOpenAIOutputResponse({
        questions: [createGeneratedQuestion()]
      });
    }));

    await generateReplayTriviaQuestions(createEnv(), {
      ...createRequest(),
      endSeconds: 3_721,
      segments: [
        {
          durationSeconds: 4,
          startSeconds: 3_661.9,
          text: 'A late stream segment mentions Roger Clark.'
        },
        {
          durationSeconds: 2,
          startSeconds: -2,
          text: 'A clipped segment starts before zero.'
        }
      ],
      startSeconds: 3_600
    });

    expect(getUserPayload(openAIRequest)?.transcript).toBe([
      '[1:01:01] A late stream segment mentions Roger Clark.',
      '[0:00] A clipped segment starts before zero.'
    ].join('\n'));
  });

  it('rejects OpenAI requests when the backend is not configured or unreachable', async () => {
    await expect(generateReplayTriviaQuestions({
      ...createEnv(),
      OPENAI_API_KEY: ''
    }, createRequest())).rejects.toThrow('Replay Trivia question generation is not configured.');

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network down');
    }));

    await expect(generateReplayTriviaQuestions(createEnv(), createRequest()))
      .rejects.toMatchObject({
        code: 'openai_unreachable',
        details: {
          provider: 'openai',
          providerErrorMessage: 'network down',
          providerErrorType: 'Error'
        },
        message: 'Replay Trivia is temporarily unavailable. Try again later.'
      });
  });

  it('hides OpenAI error responses behind a public service message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      error: {
        code: 'insufficient_quota',
        message: 'You exceeded your current quota.'
      }
    }, { status: 429 })));

    await expect(generateReplayTriviaQuestions(createEnv(), createRequest()))
      .rejects.toMatchObject({
        code: 'openai_request_failed',
        details: {
          provider: 'openai',
          providerCode: 'insufficient_quota',
          providerMessage: 'You exceeded your current quota.',
          providerStatus: 429
        },
        message: 'Replay Trivia is temporarily unavailable. Try again later.'
      });

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 500 })));

    await expect(generateReplayTriviaQuestions(createEnv(), createRequest()))
      .rejects.toMatchObject({
        code: 'openai_request_failed',
        details: {
          provider: 'openai',
          providerCode: '',
          providerMessage: '',
          providerStatus: 500
        },
        message: 'Replay Trivia is temporarily unavailable. Try again later.'
      });
  });

  it('rejects empty or invalid OpenAI output text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ output: [{ content: [{ type: 'refusal', text: '' }] }] })));
    await expect(generateReplayTriviaQuestions(createEnv(), createRequest()))
      .rejects.toThrow('Replay Trivia question generation returned no output.');

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ output_text: '{not-json' })));
    await expect(generateReplayTriviaQuestions(createEnv(), createRequest()))
      .rejects.toThrow('Replay Trivia question generation returned invalid JSON.');
  });

  it.each([
    ['missing questions array', {}, 'Replay Trivia question generation returned malformed output.'],
    ['empty question list', { questions: [] }, 'Replay Trivia question generation returned no questions.'],
    ['non-object question', { questions: [null] }, 'Replay Trivia question generation returned an invalid question.'],
    ['invalid answer index', { questions: [createGeneratedQuestion({ correctChoiceIndex: 4 })] }, 'Replay Trivia question generation returned an invalid answer.'],
    ['invalid difficulty', { questions: [createGeneratedQuestion({ difficulty: 'hard' })] }, 'Replay Trivia question generation returned invalid difficulty.'],
    ['invalid choices', { questions: [createGeneratedQuestion({ choices: ['Roger Clark', 'Christopher Judge', 'Nolan North'] })] }, 'Replay Trivia question generation returned invalid choices.'],
    ['empty choice after trim', { questions: [createGeneratedQuestion({ choices: ['Roger Clark', ' ', 'Nolan North', 'Troy Baker'] })] }, 'Replay Trivia question generation returned invalid choices.'],
    ['missing prompt', { questions: [createGeneratedQuestion({ prompt: ' ' })] }, 'Replay Trivia question generation omitted prompt.'],
    ['missing explanation', { questions: [createGeneratedQuestion({ explanation: undefined })] }, 'Replay Trivia question generation omitted explanation.'],
    ['missing source start', { questions: [createGeneratedQuestion({ sourceStartSeconds: Number.NaN })] }, 'Replay Trivia question generation omitted sourceStartSeconds.'],
    ['missing source end', { questions: [createGeneratedQuestion({ sourceEndSeconds: '13' })] }, 'Replay Trivia question generation omitted sourceEndSeconds.']
  ])('rejects malformed generated question payloads: %s', async (_name, payload, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => createOpenAIOutputResponse(payload)));

    await expect(generateReplayTriviaQuestions(createEnv(), createRequest())).rejects.toThrow(message);
  });
});

function createRequest() {
  return {
    captchaPass: 'cap_1234567890abcdef',
    endSeconds: 20,
    gameId: 'game-replay-trivia',
    generationToken: 'rtg_1234567890abcdef',
    languageCode: 'en',
    segments: [
      {
        durationSeconds: 3,
        startSeconds: 10,
        text: 'Roger Clark won best performance for Red Dead Redemption 2.'
      }
    ],
    startSeconds: 0,
    videoId: 'SHt3FyE-VIQ'
  };
}

function createOpenAIResponse(overrides: {
  choices?: [string, string, string, string];
  friendIntro: string;
  prompt: string;
  wrongReply?: string;
}): Response {
  const questionOverrides: Record<string, unknown> = {
    friendIntro: overrides.friendIntro,
    prompt: overrides.prompt
  };
  if (overrides.choices) questionOverrides.choices = overrides.choices;
  if (overrides.wrongReply !== undefined) questionOverrides.wrongReply = overrides.wrongReply;

  return createOpenAIOutputResponse({
    questions: [
      createGeneratedQuestion(questionOverrides)
    ]
  });
}

function createOpenAIOutputResponse(output: unknown): Response {
  return new Response(JSON.stringify({
    output_text: JSON.stringify(output)
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function createNestedOpenAIResponse(output: unknown): Response {
  return Response.json({
    output: [
      {
        content: [
          { text: 'ignored text', type: 'input_text' },
          { text: JSON.stringify(output), type: 'output_text' }
        ]
      }
    ]
  });
}

function createGeneratedQuestion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    choices: ['Roger Clark', 'Christopher Judge', 'Nolan North', 'Troy Baker'],
    correctChoiceIndex: 0,
    difficulty: 'easy',
    explanation: 'The transcript says Roger Clark won best performance.',
    friendIntro: 'actor check, chat',
    prompt: 'who won best performance for playing Arthur Morgan?',
    rightReply: 'thank you, Arthur would tip his hat to that one.',
    sourceEndSeconds: 13,
    sourceStartSeconds: 10,
    wrongReply: 'you missed it. it was Roger Clark.',
    ...overrides
  };
}

function createEnv(): Env {
  return {
    OPENAI_API_KEY: 'test-key',
    STREAM_ROOMS: {
      get: () => ({
        fetch: async () => new Response('{}')
      }),
      idFromName: () => ({
        equals: (other: DurableObjectId) => other.toString() === 'stream-id',
        toString: () => 'stream-id'
      })
    } as unknown as Env['STREAM_ROOMS']
  };
}

function getSystemPrompt(request: Record<string, unknown> | undefined): string {
  const input = request?.input;
  if (!Array.isArray(input)) return '';

  const firstMessage = input[0] as { content?: unknown } | undefined;
  return typeof firstMessage?.content === 'string' ? firstMessage.content : '';
}

function getUserPayload(request: Record<string, unknown> | undefined): Record<string, unknown> | null {
  const input = request?.input;
  if (!Array.isArray(input)) return null;

  const secondMessage = input[1] as { content?: unknown } | undefined;
  return typeof secondMessage?.content === 'string'
    ? JSON.parse(secondMessage.content) as Record<string, unknown>
    : null;
}
