import { describe, expect, it } from 'vitest';
import { formatCommandList, parseKeywordCommandArguments } from './keywords';

describe('keyword command parsing', () => {
  it('splits unquoted words and preserves quoted phrases', () => {
    expect(parseKeywordCommandArguments('"hello world" stream topic')).toEqual({
      ok: true,
      values: ['hello world', 'stream', 'topic']
    });
  });

  it('reports unclosed quoted phrases', () => {
    const result = parseKeywordCommandArguments('"hello world');

    expect(result.ok).toBe(false);
  });

  it('formats watched keyword lists for command feedback', () => {
    expect(formatCommandList(['hello world', 'stream'])).toBe('"hello world", "stream"');
  });
});
