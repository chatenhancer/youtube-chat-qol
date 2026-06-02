import { describe, expect, it } from 'vitest';
import {
  formatCommandList,
  formatUnwatchKeywordResult,
  formatWatchKeywordResult,
  parseKeywordCommandArguments
} from './keywords';

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

  it('reports missing keyword arguments for empty or quote-only input', () => {
    expect(parseKeywordCommandArguments('   ')).toEqual({
      ok: false,
      error: 'Add a keyword or phrase.'
    });
    expect(parseKeywordCommandArguments('""')).toEqual({
      ok: false,
      error: 'Add a keyword or phrase.'
    });
  });

  it('formats watched keyword lists for command feedback', () => {
    expect(formatCommandList(['hello world', 'stream'])).toBe('"hello world", "stream"');
  });

  it('formats watch command results for added, duplicate, mixed, and empty outcomes', () => {
    expect(formatWatchKeywordResult(['launch'], [])).toBe('Watching: "launch".');
    expect(formatWatchKeywordResult([], ['launch'])).toBe('Already watching: "launch".');
    expect(formatWatchKeywordResult(['launch'], ['status'])).toBe(
      'Watching: "launch". Already had: "status".'
    );
    expect(formatWatchKeywordResult([], [])).toBe('No keywords were added.');
  });

  it('formats unwatch command results for removed, missing, mixed, and empty outcomes', () => {
    expect(formatUnwatchKeywordResult(['launch'], [])).toBe('Removed: "launch".');
    expect(formatUnwatchKeywordResult([], ['launch'])).toBe('Keyword not found: "launch".');
    expect(formatUnwatchKeywordResult(['launch'], ['status'])).toBe(
      'Removed: "launch". Not found: "status".'
    );
    expect(formatUnwatchKeywordResult([], [])).toBe('No keywords were removed.');
  });
});
