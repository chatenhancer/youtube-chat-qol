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

    expect(getSystemPrompt(openAIRequest)).toContain('friendIntro must not include the trivia question');
    expect(getSystemPrompt(openAIRequest)).toContain('Answer choices must be clean standalone answers.');
    expect(getSystemPrompt(openAIRequest)).toContain('About half of friendIntro lines can be lightly humorous');
    expect(getSystemPrompt(openAIRequest)).toContain('Write prompt like a real person asking in chat');
    expect(getSystemPrompt(openAIRequest)).toContain('Use plain "you"');
    expect(response.questions[0].friendIntro).toBe('chat, actor check');
    expect(response.questions[0].prompt).toBe('who won best performance for playing Arthur Morgan?');
    expect(response.questions[0].rightReply).toBe('thank you, Arthur would tip his hat to that one.');
    expect(response.questions[0].wrongReply).toBe('you missed it. it was Roger Clark.');
  });

  it('rejects wrong replies that do not include the correct answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => createOpenAIResponse({
      friendIntro: 'actor check, chat',
      prompt: 'who won best performance for playing Arthur Morgan?',
      wrongReply: 'you were so confident too.'
    })));

    await expect(generateReplayTriviaQuestions(createEnv(), createRequest()))
      .rejects.toThrow('Replay Trivia question generation returned a wrong reply without the correct answer.');
  });
});

function createRequest() {
  return {
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
  return new Response(JSON.stringify({
    output_text: JSON.stringify({
      questions: [
        {
          choices: overrides.choices || ['Roger Clark', 'Christopher Judge', 'Nolan North', 'Troy Baker'],
          correctChoiceIndex: 0,
          difficulty: 'easy',
          explanation: 'The transcript says Roger Clark won best performance.',
          friendIntro: overrides.friendIntro,
          prompt: overrides.prompt,
          rightReply: 'thank you, Arthur would tip his hat to that one.',
          sourceEndSeconds: 13,
          sourceStartSeconds: 10,
          wrongReply: overrides.wrongReply || 'you missed it. it was Roger Clark.'
        }
      ]
    })
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
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
