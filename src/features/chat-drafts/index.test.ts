import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetChatInputDrafts,
  restoreChatInputDraft,
  saveCurrentChatInputDraft
} from './index';
import { loadChatInputDraft, saveChatInputDraft } from './storage';

describe('chat input draft recovery', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    document.body.replaceChildren();
    resetChatInputDrafts();
    await chrome.storage.local.clear();
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn((_command: string, _showUi?: boolean, value?: string) => {
        const selection = document.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (!range) return false;
        range.deleteContents();
        const node = document.createTextNode(String(value || ''));
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        selection?.removeAllRanges();
        selection?.addRange(range);
        return true;
      })
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('restores the stream draft into an empty composer', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, textDraft('saved draft'));
    const input = createContentEditable();
    document.body.append(input);

    await expect(restoreChatInputDraft(sourceUrl)).resolves.toBe(true);

    expect(input.textContent).toBe('saved draft');
  });

  it('restores rich draft emoji nodes into an empty composer', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, {
      contentParts: [
        { text: 'saved ', type: 'text' },
        {
          alt: ':custom-wave:',
          className: '',
          emojiId: 'custom-wave-id',
          src: 'https://example.test/custom-wave.png',
          tooltip: ':custom-wave:',
          type: 'emoji'
        },
        { text: ' draft', type: 'text' }
      ],
      text: 'saved :custom-wave: draft'
    });
    const input = createContentEditable();
    document.body.append(input);

    await expect(restoreChatInputDraft(sourceUrl)).resolves.toBe(true);

    const image = input.querySelector('img');
    expect(input.childNodes).toHaveLength(3);
    expect(image).toBeInstanceOf(HTMLImageElement);
    expect(image?.alt).toBe(':custom-wave:');
    expect(image?.id).toBe('custom-wave-id');
    expect(image?.className).toBe('emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer');
    expect(image?.getAttribute('data-emoji-id')).toBe('custom-wave-id');
  });

  it('does not overwrite existing composer text during restore', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, textDraft('saved draft'));
    const input = createContentEditable();
    input.textContent = 'current draft';
    document.body.append(input);

    await expect(restoreChatInputDraft(sourceUrl)).resolves.toBe(false);

    expect(input.textContent).toBe('current draft');
  });

  it('saves the current composer text for the stream', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    const input = createContentEditable();
    input.textContent = 'typed draft';
    document.body.append(input);

    await saveCurrentChatInputDraft(sourceUrl);

    await expect(loadChatInputDraft(sourceUrl)).resolves.toMatchObject({
      text: 'typed draft'
    });
  });

  it('saves rich composer emoji nodes for the stream', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    const input = createContentEditable();
    const emoji = document.createElement('img');
    emoji.className = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
    emoji.src = 'https://example.test/custom-smile.png';
    emoji.alt = ':custom-smile:';
    emoji.id = 'custom-smile-id';
    emoji.setAttribute('data-emoji-id', 'custom-smile-id');
    emoji.setAttribute('shared-tooltip-text', ':custom-smile:');
    input.append('typed ', emoji, ' draft');
    document.body.append(input);

    await saveCurrentChatInputDraft(sourceUrl);

    await expect(loadChatInputDraft(sourceUrl)).resolves.toMatchObject({
      contentParts: [
        { text: 'typed ', type: 'text' },
        {
          alt: ':custom-smile:',
          emojiId: 'custom-smile-id',
          src: 'https://example.test/custom-smile.png',
          type: 'emoji'
        },
        { text: ' draft', type: 'text' }
      ],
      text: 'typed :custom-smile: draft'
    });
  });
});

function createContentEditable(): HTMLElement {
  const input = document.createElement('div');
  input.id = 'input';
  input.setAttribute('contenteditable', 'true');
  input.getBoundingClientRect = () => ({
    bottom: 40,
    height: 40,
    left: 0,
    right: 320,
    top: 0,
    width: 320,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect);
  return input;
}

function textDraft(text: string) {
  return {
    contentParts: text ? [{ text, type: 'text' as const }] : [],
    text
  };
}
