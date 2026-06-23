import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initChatInputDrafts,
  resetChatInputDrafts,
  restoreChatInputDraft,
  saveCurrentChatInputDraft,
  scheduleChatInputDraftRestore
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
    window.history.replaceState({}, '', '/');
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

  it('waits for the composer to appear before restoring a draft', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, textDraft('saved draft'));

    await expect(restoreChatInputDraft(sourceUrl)).resolves.toBe(false);

    const input = createContentEditable();
    document.body.append(input);
    await vi.advanceTimersByTimeAsync(100);

    expect(input.textContent).toBe('saved draft');
  });

  it('does not restore blank or sourceless drafts', async () => {
    const input = createContentEditable();
    document.body.append(input);

    await expect(restoreChatInputDraft('')).resolves.toBe(false);
    await expect(restoreChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toBe(false);

    expect(input.textContent).toBe('');
  });

  it('keeps retrying when no stored draft is available yet', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    const input = createContentEditable();
    document.body.append(input);

    await expect(restoreChatInputDraft()).resolves.toBe(false);
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('late draft'));
    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();

    expect(input.textContent).toBe('late draft');
  });

  it('reapplies a restored draft if YouTube clears the composer during setup', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, textDraft('saved draft'));
    const input = createContentEditable();
    document.body.append(input);

    await expect(restoreChatInputDraft(sourceUrl)).resolves.toBe(true);
    expect(input.textContent).toBe('saved draft');

    input.replaceChildren();
    await vi.advanceTimersByTimeAsync(500);

    expect(input.textContent).toBe('saved draft');
  });

  it('stops retrying restore after the configured delays are exhausted', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    scheduleChatInputDraftRestore();

    for (const delay of [100, 300, 800, 1500, 3000, 5000]) {
      await vi.advanceTimersByTimeAsync(delay);
      await flushPromises();
    }

    const input = createContentEditable();
    document.body.append(input);
    await vi.advanceTimersByTimeAsync(6000);

    expect(input.textContent).toBe('');
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

  it('does not save drafts without a stream source', async () => {
    const input = createContentEditable();
    input.textContent = 'orphan draft';
    document.body.append(input);

    await saveCurrentChatInputDraft('');

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: ''
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

  it('debounces draft saves after composer input', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    initChatInputDrafts();
    const input = createContentEditable();
    input.textContent = 'typed draft';
    document.body.append(input);

    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(249);
    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: ''
    });

    await vi.advanceTimersByTimeAsync(1);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: 'typed draft'
    });
  });

  it('ignores input events outside the chat composer', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    initChatInputDrafts();
    const input = createContentEditable();
    const unrelated = document.createElement('div');
    unrelated.textContent = 'outside draft';
    input.textContent = 'inside draft';
    document.body.append(input, unrelated);

    unrelated.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: ''
    });
  });

  it('does not save while restoring draft content into the composer', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('saved draft'));
    initChatInputDrafts();
    const input = createContentEditable();
    document.body.append(input);

    await restoreChatInputDraft('https://www.youtube.com/watch?v=stream-a');
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: 'saved draft'
    });
  });

  it('flushes a pending draft save on pagehide', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    initChatInputDrafts();
    const input = createContentEditable();
    input.textContent = 'leaving soon';
    document.body.append(input);

    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
    await flushPromises();

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: 'leaving soon'
    });
  });

  it('saves after Enter send behavior has had time to clear the composer', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('old draft'));
    initChatInputDrafts();
    const input = createContentEditable();
    input.textContent = 'message being sent';
    document.body.append(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    input.textContent = '';
    await vi.advanceTimersByTimeAsync(500);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: ''
    });
  });

  it('does not treat Shift Enter as send behavior', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('old draft'));
    initChatInputDrafts();
    const input = createContentEditable();
    input.textContent = 'multiline draft';
    document.body.append(input);

    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', shiftKey: true }));
    input.textContent = '';
    await vi.advanceTimersByTimeAsync(500);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: 'old draft'
    });
  });

  it('saves after the send button is clicked', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('old draft'));
    initChatInputDrafts();
    const input = createContentEditable();
    const sendButton = document.createElement('button');
    sendButton.id = 'send-button';
    input.textContent = 'clicked send';
    document.body.append(input, sendButton);

    sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    input.textContent = '';
    await vi.advanceTimersByTimeAsync(500);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: ''
    });
  });

  it('ignores clicks outside YouTube send buttons', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('old draft'));
    initChatInputDrafts();
    const input = createContentEditable();
    const unrelated = document.createElement('button');
    input.textContent = 'clicked elsewhere';
    document.body.append(input, unrelated);

    unrelated.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    input.textContent = '';
    await vi.advanceTimersByTimeAsync(500);

    await expect(loadChatInputDraft('https://www.youtube.com/watch?v=stream-a')).resolves.toMatchObject({
      text: 'old draft'
    });
  });

  it('schedules restore only once while a restore timer is pending', async () => {
    window.history.replaceState({}, '', '/watch?v=stream-a');
    await saveChatInputDraft('https://www.youtube.com/watch?v=stream-a', textDraft('saved draft'));
    scheduleChatInputDraftRestore();
    scheduleChatInputDraftRestore();

    const input = createContentEditable();
    document.body.append(input);
    await vi.advanceTimersByTimeAsync(100);

    expect(input.textContent).toBe('saved draft');
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
