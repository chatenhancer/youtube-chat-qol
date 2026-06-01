import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findChatInput,
  getChatInputSnapshot,
  getChatInputText,
  getChatInputTextSelection,
  insertIntoChatInput,
  insertNodesIntoChatInput,
  insertNodeIntoChatInput,
  replaceChatInput,
  replaceChatInputSnapshot,
  replaceChatInputTextRange,
  replaceNodesInChatInput,
  returnToChatInputPanel
} from './chat-input';

describe('YouTube chat input adapter', () => {
  beforeEach(() => {
    document.body.replaceChildren();
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

  it('finds only visible chat inputs', () => {
    const hidden = createContentEditable({ visible: false });
    const visible = createContentEditable();
    document.body.append(hidden, visible);

    expect(findChatInput()).toBe(visible);
  });

  it('reads snapshots and text selection from contenteditable input', () => {
    const input = createContentEditable();
    const emoji = document.createElement('img');
    emoji.alt = ':wave:';
    const hiddenTooltip = document.createElement('span');
    hiddenTooltip.setAttribute('role', 'tooltip');
    hiddenTooltip.textContent = 'tooltip text';
    input.append('Hello ', emoji, hiddenTooltip);
    document.body.append(input);

    expect(getChatInputText()).toBe('Hello :wave:');
    expect(getChatInputSnapshot()).toMatchObject({
      text: 'Hello :wave:'
    });
    expect(getChatInputTextSelection()).toEqual({
      selectionEnd: 'Hello :wave:'.length,
      selectionStart: 'Hello :wave:'.length,
      text: 'Hello :wave:'
    });
  });

  it('reads contenteditable selection offsets from nested nodes', () => {
    const input = createContentEditable();
    const bold = document.createElement('strong');
    bold.textContent = 'bold';
    input.append('hello ', bold, ' world');
    document.body.append(input);
    const range = document.createRange();
    range.setStart(bold.firstChild!, 1);
    range.setEnd(input.lastChild!, 3);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(getChatInputTextSelection()).toEqual({
      selectionEnd: 13,
      selectionStart: 7,
      text: 'hello bold world'
    });
  });

  it('inserts and replaces textarea text with selection preservation', () => {
    const textarea = createTextArea('hello world');
    document.body.append(textarea);
    textarea.focus();
    textarea.selectionStart = 6;
    textarea.selectionEnd = 11;

    expect(insertIntoChatInput('chat')).toBe(true);
    expect(textarea.value).toBe('hello chat');

    expect(replaceChatInputTextRange(6, 10, 'stream')).toBe(true);
    expect(textarea.value).toBe('hello stream');

    expect(replaceChatInput('done')).toBe(true);
    expect(textarea.value).toBe('done');
    expect(textarea.selectionStart).toBe(4);
  });

  it('inserts nodes and snapshots into contenteditable input', () => {
    const input = createContentEditable();
    input.append('hello');
    document.body.append(input);

    const image = document.createElement('img');
    image.alt = ':custom:';
    expect(insertNodeIntoChatInput(image, ':custom:')).toBe(true);
    expect(input.querySelector('img')?.alt).toBe(':custom:');

    const strong = document.createElement('strong');
    strong.textContent = 'quote';
    expect(replaceNodesInChatInput([strong], 'quote', ' ')).toBe(true);
    expect(input.textContent).toBe('quote ');

    expect(replaceChatInputSnapshot({
      childNodes: [document.createTextNode('snapshot')],
      text: 'snapshot'
    })).toBe(true);
    expect(input.textContent).toBe('snapshot');
  });

  it('replaces contenteditable text ranges and inserts node groups', () => {
    const input = createContentEditable();
    input.append('hello world');
    document.body.append(input);

    expect(replaceChatInputTextRange(6, 11, 'chat')).toBe(true);
    expect(input.textContent).toBe('hello chat');

    const first = document.createElement('span');
    first.textContent = 'A';
    const second = document.createElement('span');
    second.textContent = 'B';
    expect(insertNodesIntoChatInput([first, second], 'AB')).toBe(true);
    expect(input.textContent).toBe('hello chatAB');
  });

  it('falls back to plain text for textarea node insertion and empty node groups', () => {
    const textarea = createTextArea('hello');
    document.body.append(textarea);

    expect(insertNodeIntoChatInput(document.createElement('img'), ':emoji:')).toBe(true);
    expect(textarea.value).toBe('hello:emoji:');
    expect(insertNodesIntoChatInput([], ' fallback')).toBe(true);
    expect(textarea.value).toBe('hello:emoji: fallback');
  });

  it('clicks the visible participant back button before insertion recovery', () => {
    const backButton = document.createElement('button');
    backButton.setAttribute('aria-label', 'Back');
    backButton.click = vi.fn();
    backButton.getBoundingClientRect = () => visibleRect();
    const participantList = document.createElement('yt-live-chat-participant-list-renderer');
    participantList.append(backButton);
    document.body.append(participantList);

    expect(returnToChatInputPanel()).toBe(true);
    expect(backButton.click).toHaveBeenCalledOnce();
  });

  it('returns false when there is no visible participant back button', () => {
    expect(returnToChatInputPanel()).toBe(false);
  });
});

function createContentEditable({ visible = true } = {}): HTMLElement {
  const input = document.createElement('div');
  input.id = 'input';
  input.setAttribute('contenteditable', 'true');
  input.getBoundingClientRect = () => visible ? visibleRect() : zeroRect();
  return input;
}

function createTextArea(value: string): HTMLTextAreaElement {
  const input = document.createElement('textarea');
  input.value = value;
  input.getBoundingClientRect = () => visibleRect();
  return input;
}

function visibleRect(): DOMRect {
  return {
    bottom: 40,
    height: 40,
    left: 0,
    right: 320,
    top: 0,
    width: 320,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect;
}

function zeroRect(): DOMRect {
  return {
    bottom: 0,
    height: 0,
    left: 0,
    right: 0,
    top: 0,
    width: 0,
    x: 0,
    y: 0,
    toJSON: () => ({})
  } as DOMRect;
}
