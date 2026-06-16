import { describe, expect, it } from 'vitest';
import { ReplayTriviaError } from './errors';
import {
  getTranscriptCharLength,
  parseReplayTriviaQuestionsRequest
} from './validation';

describe('Replay Trivia request validation', () => {
  it('normalizes a valid generation request', () => {
    expect(parseReplayTriviaQuestionsRequest({
      endSeconds: 20,
      gameId: 'game-replay-trivia',
      generationToken: 'rtg_1234567890abcdef',
      languageCode: 'EN_us',
      locale: 'es_MX',
      questionCount: 3,
      segments: [
        {
          durationSeconds: 2,
          startSeconds: 9,
          text: '  First   line  '
        },
        {
          startSeconds: 25,
          text: 'outside window'
        }
      ],
      startSeconds: 10,
      videoId: 'SHt3FyE-VIQ'
    })).toEqual({
      endSeconds: 20,
      gameId: 'game-replay-trivia',
      generationToken: 'rtg_1234567890abcdef',
      languageCode: 'EN-us',
      locale: 'es-MX',
      questionCount: 3,
      segments: [
        {
          durationSeconds: 2,
          startSeconds: 9,
          text: 'First line'
        }
      ],
      startSeconds: 10,
      videoId: 'SHt3FyE-VIQ'
    });
  });

  it('defaults optional fields and counts transcript characters', () => {
    const request = parseReplayTriviaQuestionsRequest({
      endSeconds: 20,
      gameId: 'game-replay-trivia',
      generationToken: 'rtg_1234567890abcdef',
      languageCode: '',
      locale: '',
      segments: [
        {
          startSeconds: 10,
          text: 'abc'
        },
        {
          durationSeconds: 1,
          startSeconds: 12,
          text: 'defg'
        }
      ],
      startSeconds: 10,
      videoId: 'SHt3FyE-VIQ'
    });

    expect(request.languageCode).toBe('en');
    expect(request.locale).toBeUndefined();
    expect(request.questionCount).toBe(10);
    expect(getTranscriptCharLength(request.segments)).toBe(7);
  });

  it.each([
    ['invalid_request', null],
    ['invalid_video_id', { ...baseRequest(), videoId: 'bad' }],
    ['invalid_game_id', { ...baseRequest(), gameId: 'bad id' }],
    ['invalid_generation_token', { ...baseRequest(), generationToken: 'short' }],
    ['invalid_window', { ...baseRequest(), startSeconds: -1 }],
    ['invalid_window', { ...baseRequest(), endSeconds: 10, startSeconds: 10 }],
    ['invalid_window', { ...baseRequest(), endSeconds: 90_001, startSeconds: 0 }],
    ['invalid_field', { ...baseRequest(), questionCount: 1.5 }],
    ['invalid_field', { ...baseRequest(), questionCount: 11 }],
    ['invalid_field', { ...baseRequest(), languageCode: 123 }],
    ['invalid_field', { ...baseRequest(), locale: 'not a locale' }],
    ['missing_segments', { ...baseRequest(), segments: [] }],
    ['too_many_segments', { ...baseRequest(), segments: new Array(5_001).fill({ startSeconds: 10, text: 'line' }) }],
    ['invalid_segment', { ...baseRequest(), segments: [null] }],
    ['invalid_field', { ...baseRequest(), segments: [{ startSeconds: '10', text: 'line' }] }],
    ['invalid_segment_start', { ...baseRequest(), segments: [{ startSeconds: -1, text: 'line' }] }],
    ['invalid_field', { ...baseRequest(), segments: [{ startSeconds: 10, text: '' }] }],
    ['segment_too_large', { ...baseRequest(), segments: [{ startSeconds: 10, text: 'x'.repeat(501) }] }],
    ['invalid_field', { ...baseRequest(), segments: [{ durationSeconds: Number.NaN, startSeconds: 10, text: 'line' }] }],
    ['invalid_segment_duration', { ...baseRequest(), segments: [{ durationSeconds: -1, startSeconds: 10, text: 'line' }] }],
    ['invalid_segment_duration', { ...baseRequest(), segments: [{ durationSeconds: 90_000, startSeconds: 10, text: 'line' }] }],
    ['empty_window', { ...baseRequest(), segments: [{ durationSeconds: 1, startSeconds: 30, text: 'outside' }] }],
    ['transcript_too_large', { ...baseRequest(), segments: new Array(801).fill({ startSeconds: 10, text: 'x'.repeat(500) }) }]
  ] as const)('rejects %s requests', (code, request) => {
    expect(() => parseReplayTriviaQuestionsRequest(request)).toThrowError(ReplayTriviaError);
    try {
      parseReplayTriviaQuestionsRequest(request);
    } catch (error) {
      expect(error).toBeInstanceOf(ReplayTriviaError);
      expect((error as ReplayTriviaError).code).toBe(code);
    }
  });
});

function baseRequest() {
  return {
    endSeconds: 20,
    gameId: 'game-replay-trivia',
    generationToken: 'rtg_1234567890abcdef',
    segments: [
      {
        startSeconds: 10,
        text: 'line'
      }
    ],
    startSeconds: 10,
    videoId: 'SHt3FyE-VIQ'
  };
}
