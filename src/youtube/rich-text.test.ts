import { describe, expect, it } from 'vitest';
import {
  appendRichMessageText,
  createRichTextSegmentNodes,
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

  it('serializes nested wrappers while ignoring non-rendered nodes', () => {
    const wrapper = document.createElement('span');
    const nested = document.createElement('span');
    nested.append('nested ', document.createComment('ignored'), 'text');
    wrapper.append(document.createTextNode('hello '), nested, document.createTextNode(''));

    expect(serializeRichMessageNodes(Array.from(wrapper.childNodes))).toEqual([
      { type: 'text', text: 'hello nested text' }
    ]);
  });

  it('serializes emoji-like elements using title and text fallbacks', () => {
    const titleEmoji = document.createElement('span');
    titleEmoji.setAttribute('role', 'img');
    titleEmoji.setAttribute('src', 'https://example.test/title.png');
    titleEmoji.setAttribute('title', ':title-emoji:');
    titleEmoji.id = 'title-emoji-id';

    const textEmoji = document.createElement('span');
    textEmoji.className = 'yt-emoji';
    textEmoji.setAttribute('src', 'https://example.test/text.png');
    textEmoji.textContent = ':text-emoji:';

    expect(serializeRichMessageNodes([titleEmoji, textEmoji])).toEqual([
      {
        type: 'emoji',
        alt: ':title-emoji:',
        className: '',
        emojiId: 'title-emoji-id',
        src: 'https://example.test/title.png',
        tooltip: ':title-emoji:'
      },
      {
        type: 'emoji',
        alt: ':text-emoji:',
        className: 'yt-emoji',
        emojiId: '',
        src: 'https://example.test/text.png',
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

  it('falls back to plain text when no rich source is available', () => {
    const container = document.createElement('span');

    appendRichMessageText(container, 'fallback text');

    expect(container.textContent).toBe('fallback text');
  });

  it('renders emoji segment nodes with default classes and optional element ids', () => {
    const nodes = createRichTextSegmentNodes([
      {
        type: 'emoji',
        alt: ':wave:',
        className: '',
        emojiId: 'wave-id',
        src: 'https://example.test/wave.png',
        tooltip: ''
      },
      {
        type: 'emoji',
        alt: ':missing-src:',
        className: '',
        emojiId: '',
        src: '',
        tooltip: ''
      },
      {
        type: 'emoji',
        alt: '',
        className: '',
        emojiId: '',
        src: '',
        tooltip: ''
      }
    ], {
      includeEmojiIdAsElementId: true
    });

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toBeInstanceOf(HTMLImageElement);
    expect((nodes[0] as HTMLImageElement).id).toBe('wave-id');
    expect((nodes[0] as HTMLImageElement).className).toContain('yt-live-chat-text-message-renderer');
    expect(nodes[1].textContent).toBe(':missing-src:');
  });

  it('normalizes stored segment data defensively', () => {
    expect(normalizeRichTextSegments('bad')).toEqual([]);
    expect(normalizeRichTextSegments([
      null,
      { type: 'text', text: '' },
      { type: 'bad', text: 'bad' },
      { type: 'text', text: 'hello' },
      { type: 'emoji', src: '', alt: ':bad:' },
      { type: 'emoji', src: 'https://example.test/good.png', alt: ':good:', emojiId: 'good' },
      { type: 'emoji', src: 'https://example.test/minimal.png', alt: ':minimal:' }
    ])).toEqual([
      { type: 'text', text: 'hello' },
      {
        type: 'emoji',
        alt: ':good:',
        className: '',
        emojiId: 'good',
        src: 'https://example.test/good.png',
        tooltip: ''
      },
      {
        type: 'emoji',
        alt: ':minimal:',
        className: '',
        emojiId: '',
        src: 'https://example.test/minimal.png',
        tooltip: ''
      }
    ]);
  });
});
