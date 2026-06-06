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

  it('preserves line breaks and ignores invisible or unsupported nodes', () => {
    const hidden = document.createElement('tp-yt-paper-tooltip');
    hidden.textContent = 'hidden';
    const lineBreak = document.createElement('br');
    const comment = document.createComment('ignored');

    const result = createQuoteContentNodes({
      nodes: [
        document.createTextNode('first\u200B'),
        lineBreak,
        hidden,
        comment,
        document.createTextNode('second')
      ]
    }, 'fallback');

    expect(result.nodes.map((node) => node.textContent).join('')).toBe('first\nsecond');
  });

  it('falls back to emoji text when an emoji-like node cannot become an input image', () => {
    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.setAttribute('title', ':party:');

    const result = createQuoteContentNodes({ nodes: [emoji] }, 'fallback');

    expect(result.truncated).toBe(false);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].textContent).toBe(':party:');
  });

  it('falls back to emoji text when the emoji image source is not HTTPS', () => {
    const emoji = document.createElement('img');
    emoji.className = 'emoji';
    emoji.setAttribute('src', 'javascript:alert(1)');
    emoji.alt = ':party:';

    const result = createQuoteContentNodes({ nodes: [emoji] }, 'fallback');

    expect(result.truncated).toBe(false);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).not.toBeInstanceOf(HTMLImageElement);
    expect(result.nodes[0].textContent).toBe(':party:');
  });

  it('does not append emoji segments that have no usable fallback text', () => {
    const result = createQuoteContentNodes({
      segments: [
        { type: 'emoji', alt: '', className: 'emoji', emojiId: '', src: '', tooltip: '' }
      ]
    }, 'fallback');

    expect(result.truncated).toBe(false);
    expect(result.nodes[0].textContent).toBe('fallback');
  });

  it('marks quote content truncated when the remaining budget is exhausted before later nodes', () => {
    const result = createQuoteContentNodes({
      nodes: [
        document.createTextNode('x'.repeat(QUOTE_MAX_LENGTH)),
        document.createTextNode('extra')
      ]
    }, 'fallback');

    expect(result.truncated).toBe(true);
    expect(result.nodes.map((node) => node.textContent).join('')).toHaveLength(QUOTE_MAX_LENGTH);
  });

  it('marks oversized emoji segments truncated without appending them', () => {
    const result = createQuoteContentNodes({
      segments: [
        { type: 'text', text: 'x'.repeat(QUOTE_MAX_LENGTH - 1) },
        {
          type: 'emoji',
          alt: ':very-long-emoji-name:',
          className: 'emoji',
          emojiId: 'long',
          src: 'https://example.test/long.png',
          tooltip: 'Long'
        }
      ]
    }, 'fallback');

    expect(result.truncated).toBe(true);
    expect(result.nodes).toHaveLength(1);
  });
});
