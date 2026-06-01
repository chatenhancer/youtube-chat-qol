import { describe, expect, it } from 'vitest';
import {
  appendRichMessageText,
  normalizeRichTextSegments,
  serializeRichMessageNodes
} from './rich-text';

describe('YouTube rich text helpers', () => {
  it('serializes visible text, line breaks, and emoji nodes for stored cards', () => {
    const wrapper = document.createElement('span');
    wrapper.innerHTML = 'hello<br><img class="emoji" alt=":rocket:" data-emoji-id="rocket" src="https://example.test/rocket.png"><tp-yt-paper-tooltip>ignored</tp-yt-paper-tooltip>';

    expect(serializeRichMessageNodes(Array.from(wrapper.childNodes))).toEqual([
      { type: 'text', text: 'hello\n' },
      {
        type: 'emoji',
        alt: ':rocket:',
        className: 'emoji',
        emojiId: 'rocket',
        src: 'https://example.test/rocket.png',
        tooltip: ''
      }
    ]);
  });

  it('appends cloned live nodes before falling back to serialized segments', () => {
    const container = document.createElement('span');
    const sourceNode = document.createElement('strong');
    sourceNode.textContent = 'live text';

    appendRichMessageText(container, 'fallback', [sourceNode], [
      { type: 'text', text: 'stored text' }
    ]);

    expect(container.innerHTML).toBe('<strong>live text</strong>');
  });

  it('renders serialized emoji segments when live nodes are unavailable', () => {
    const container = document.createElement('span');

    appendRichMessageText(container, 'fallback', [], [
      {
        type: 'text',
        text: 'hello '
      },
      {
        type: 'emoji',
        alt: ':wave:',
        className: 'custom-emoji',
        emojiId: 'wave',
        src: 'https://example.test/wave.png',
        tooltip: ''
      }
    ]);

    expect(container.textContent).toBe('hello ');
    expect(container.querySelector('img')?.alt).toBe(':wave:');
    expect(container.querySelector('img')?.getAttribute('data-emoji-id')).toBe('wave');
  });

  it('normalizes stored segment data defensively', () => {
    expect(normalizeRichTextSegments([
      null,
      { type: 'text', text: '' },
      { type: 'text', text: 'hello' },
      { type: 'emoji', src: '', alt: ':bad:' },
      { type: 'emoji', src: 'https://example.test/good.png', alt: ':good:', emojiId: 'good' }
    ])).toEqual([
      { type: 'text', text: 'hello' },
      {
        type: 'emoji',
        alt: ':good:',
        className: '',
        emojiId: 'good',
        src: 'https://example.test/good.png',
        tooltip: ''
      }
    ]);
  });
});
