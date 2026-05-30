import { describe, expect, it } from 'vitest';
import {
  getMatchedMentionHandles,
  getMatchingKeywords,
  keywordsEqual,
  mergeStrings,
  normalizeStoredKeywords
} from './matching';

describe('inbox keyword and mention matching', () => {
  it('normalizes stored keywords without duplicates', () => {
    expect(normalizeStoredKeywords([' Robot ', 'robot', '', 'Stream topic'])).toEqual(['Robot', 'Stream topic']);
  });

  it('matches keywords against message text and author names case-insensitively', () => {
    expect(getMatchingKeywords(['@RobotFan', 'hello stream'], ['robot', 'HELLO STREAM'])).toEqual([
      'robot',
      'HELLO STREAM'
    ]);
  });

  it('matches mention handles at handle boundaries only', () => {
    expect(getMatchedMentionHandles('hello @ExampleUser!', ['@exampleuser'])).toEqual(['@exampleuser']);
    expect(getMatchedMentionHandles('hello @ExampleUsername', ['@exampleuser'])).toEqual([]);
  });

  it('compares and merges strings with normalized casing', () => {
    expect(keywordsEqual('Stream Topic', 'stream topic')).toBe(true);
    expect(mergeStrings(['Alpha'], ['alpha', 'Beta'])).toEqual(['Alpha', 'Beta']);
  });
});
