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
    await saveChatInputDraft(sourceUrl, 'saved draft');
    const input = createContentEditable();
    document.body.append(input);

    await expect(restoreChatInputDraft(sourceUrl)).resolves.toBe(true);

    expect(input.textContent).toBe('saved draft');
  });

  it('does not overwrite existing composer text during restore', async () => {
    const sourceUrl = 'https://www.youtube.com/watch?v=stream-a';
    await saveChatInputDraft(sourceUrl, 'saved draft');
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

    await expect(loadChatInputDraft(sourceUrl)).resolves.toBe('typed draft');
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
