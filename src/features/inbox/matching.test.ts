import { describe, expect, it } from 'vitest';
import {
  MAX_INBOX_KEYWORDS,
  MAX_KEYWORD_LENGTH,
  getKeywordCheckKey,
  getKeywordValuesKey,
  getMatchedMentionHandles,
  getMatchingKeywords,
  getPreparedKeywordsKey,
  keywordsEqual,
  mergeStrings,
  normalizeMentionHandles,
  normalizeKeyword,
  prepareKeywords,
  normalizeStoredKeywords
} from './matching';

describe('inbox keyword and mention matching', () => {
  it('normalizes stored keywords without duplicates', () => {
    expect(normalizeStoredKeywords([' Robot ', 'robot', '', 'Stream topic'])).toEqual(['Robot', 'Stream topic']);
    expect(normalizeStoredKeywords('not an array')).toEqual([]);
    expect(normalizeKeyword('a'.repeat(MAX_KEYWORD_LENGTH + 5))).toHaveLength(MAX_KEYWORD_LENGTH);
    expect(normalizeStoredKeywords(Array.from({ length: MAX_INBOX_KEYWORDS + 2 }, (_, index) => `keyword-${index}`)))
      .toEqual(Array.from({ length: MAX_INBOX_KEYWORDS }, (_, index) => `keyword-${index + 2}`));
  });

  it('normalizes mention handles from stored values', () => {
    expect(normalizeMentionHandles([' @ExampleUser ', '@exampleuser', '', '@OtherUser'])).toEqual([
      '@ExampleUser',
      '@OtherUser'
    ]);
    expect(normalizeMentionHandles('not an array')).toEqual([]);
  });

  it('matches keywords against message text and author names case-insensitively', () => {
    expect(getMatchingKeywords(['@RobotFan', 'hello stream'], ['robot', 'HELLO STREAM'])).toEqual([
      'robot',
      'HELLO STREAM'
    ]);
    expect(getMatchingKeywords('@RobotFan', ['robot'])).toEqual(['robot']);
    expect(getMatchingKeywords(['', '   '], ['robot'])).toEqual([]);
  });

  it('matches mention handles at handle boundaries only', () => {
    expect(getMatchedMentionHandles('hello @ExampleUser!', ['@exampleuser'])).toEqual(['@exampleuser']);
    expect(getMatchedMentionHandles('@ExampleUser joined', ['@exampleuser'])).toEqual(['@exampleuser']);
    expect(getMatchedMentionHandles('hello @ExampleUser', ['@exampleuser'])).toEqual(['@exampleuser']);
    expect(getMatchedMentionHandles('hello @ExampleUsername', ['@exampleuser'])).toEqual([]);
    expect(getMatchedMentionHandles('hello @ExampleUser_name', ['@exampleuser'])).toEqual([]);
    expect(getMatchedMentionHandles('hello @ExampleUser', [''])).toEqual([]);
  });

  it('compares and merges strings with normalized casing', () => {
    expect(keywordsEqual('Stream Topic', 'stream topic')).toBe(true);
    expect(mergeStrings(['Alpha'], ['alpha', 'Beta'])).toEqual(['Alpha', 'Beta']);
  });

  it('creates stable keyword cache keys for prepared keywords and scalar values', () => {
    const prepared = prepareKeywords([' Stream Topic ', '', 'Robot']);

    expect(getPreparedKeywordsKey(prepared)).toBe('stream topic\nrobot');
    expect(getKeywordValuesKey('Hello ROBOT')).toBe('hello robot');
    expect(getKeywordCheckKey(['Robot'], 'Hello ROBOT')).toBe('robot\nhello robot');
  });
});
