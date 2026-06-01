import { describe, expect, it } from 'vitest';
import { QUOTE_MAX_LENGTH } from './format';
import { createQuoteContentNodes } from './quote-content';

describe('rich quote content builder', () => {
  it('preserves emoji image nodes as chat-input-safe emoji nodes', () => {
    const text = document.createTextNode('hello ');
    const emoji = document.createElement('img');
    emoji.className = 'emoji';
    emoji.src = 'https://example.test/smile.png';
    emoji.alt = ':smile:';
    emoji.setAttribute('data-emoji-id', 'smile-id');
    emoji.setAttribute('shared-tooltip-text', 'Smile');

    const result = createQuoteContentNodes({ nodes: [text, emoji] }, 'fallback');

    expect(result.truncated).toBe(false);
    expect(result.nodes[0].textContent).toBe('hello ');
    expect(result.nodes[1]).toBeInstanceOf(HTMLImageElement);
    expect((result.nodes[1] as HTMLImageElement).alt).toBe(':smile:');
    expect((result.nodes[1] as HTMLImageElement).getAttribute('data-emoji-id')).toBe('smile-id');
    expect((result.nodes[1] as HTMLImageElement).getAttribute('shared-tooltip-text')).toBe('Smile');
  });

  it('uses serialized rich text segments when live nodes are unavailable', () => {
    const result = createQuoteContentNodes({
      segments: [
        { type: 'text', text: 'hello ' },
        {
          type: 'emoji',
          alt: ':rocket:',
          className: 'emoji',
          emojiId: 'rocket',
          src: 'https://example.test/rocket.png',
          tooltip: 'Rocket'
        }
      ]
    }, 'fallback');

    expect(result.nodes.map((node) => node.textContent || (node as HTMLImageElement).alt).join('')).toBe('hello :rocket:');
  });

  it('truncates visible quote text at the quote budget', () => {
    const result = createQuoteContentNodes({
      nodes: [document.createTextNode('x'.repeat(QUOTE_MAX_LENGTH + 10))]
    }, 'fallback');

    expect(result.truncated).toBe(true);
    expect(result.nodes.map((node) => node.textContent).join('')).toHaveLength(QUOTE_MAX_LENGTH - 3);
  });

  it('falls back to plain truncated text when no rich content is available', () => {
    const result = createQuoteContentNodes({}, 'fallback message');

    expect(result.truncated).toBe(false);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].textContent).toBe('fallback message');
  });
});
