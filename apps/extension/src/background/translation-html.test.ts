import { describe, expect, it } from 'vitest';
import { decodeTranslationHtml, encodeTranslationHtml } from './translation-html';

describe('translation HTML text boundary', () => {
  it('escapes literal markup and wraps only canonical placeholders', () => {
    expect(encodeTranslationHtml('<img src=x> & §0§ [1]')).toBe('&lt;img src=x&gt; &amp; <span translate="no">[0]</span> [1]');
  });

  it('decodes entities once and preserves literal bracketed numbers', () => {
    expect(decodeTranslationHtml('&lt;b&gt; [1] &amp;lt; &#39; &#x1f44b;', '')).toBe('<b> [1] &lt; \' 👋');
  });

  it('restores placeholders after a valid grammatical reordering', () => {
    expect(decodeTranslationHtml('<span translate="no">[1]</span> hello <span translate="no">[0]</span>', '§0§ hello §1§'))
      .toBe('§1§ hello §0§');
  });

  it.each([
    'hello',
    'hello <span translate="no">[0]</span> <span translate="no">[0]</span>',
    'hello <span translate="no">[9]</span>',
    '<img src="https://example.com/">',
    '<script>untrusted()</script>'
  ])('rejects dropped, duplicated, unknown tokens and unexpected HTML: %s', (response) => {
    expect(() => decodeTranslationHtml(response, 'hello §0§')).toThrow();
  });
});
