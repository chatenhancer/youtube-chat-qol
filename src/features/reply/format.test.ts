import { describe, expect, it } from 'vitest';
import { formatMentionText, formatQuoteText, QUOTE_MAX_LENGTH, truncateForQuote } from './format';

describe('reply text formatting', () => {
  it('formats mentions with a trailing space', () => {
    expect(formatMentionText('@ExampleUser Verified')).toBe('@ExampleUser ');
  });

  it('formats quotes with a trailing space after the closing quote', () => {
    expect(formatQuoteText('@ExampleUser', 'hello there')).toBe('@ExampleUser : "hello there" ');
  });

  it('falls back to a mention when quote text is empty', () => {
    expect(formatQuoteText('@ExampleUser', '')).toBe('@ExampleUser ');
  });

  it('truncates long quotes within the configured limit', () => {
    const longText = 'a'.repeat(QUOTE_MAX_LENGTH + 20);
    const result = truncateForQuote(longText);

    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(QUOTE_MAX_LENGTH);
  });
});
