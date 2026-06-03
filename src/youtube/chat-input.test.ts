import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  findChatInput,
  getChatInputNodesText,
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

  it('ignores matching non-HTMLElement contenteditable candidates', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('contenteditable', 'true');
    const visible = createContentEditable();
    document.body.append(svg, visible);

    expect(findChatInput()).toBe(visible);
  });

  it('returns empty/null values when no chat input is visible', () => {
    expect(findChatInput()).toBeNull();
    expect(getChatInputSnapshot()).toBeNull();
    expect(getChatInputText()).toBe('');
    expect(getChatInputTextSelection()).toBeNull();
    expect(insertIntoChatInput('hello')).toBe(false);
    expect(insertNodeIntoChatInput(document.createElement('img'), ':emoji:')).toBe(false);
    expect(insertNodesIntoChatInput([document.createTextNode('hello')], 'hello')).toBe(false);
    expect(replaceChatInputTextRange(0, 1, 'x')).toBe(false);
    expect(replaceChatInput('hello')).toBe(false);
    expect(replaceChatInputSnapshot({ childNodes: [], text: 'hello' })).toBe(false);
    expect(replaceNodesInChatInput([document.createTextNode('hello')], 'hello')).toBe(false);
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

  it('reads contenteditable selection offsets from element containers', () => {
    const input = createContentEditable();
    const first = document.createElement('span');
    first.textContent = 'one';
    const image = document.createElement('img');
    image.alt = ':wave:';
    const second = document.createElement('span');
    second.textContent = 'two';
    input.append(first, image, second);
    document.body.append(input);
    const range = document.createRange();
    range.setStart(input, 1);
    range.setEnd(input, 2);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(getChatInputTextSelection()).toEqual({
      selectionEnd: 'one:wave:'.length,
      selectionStart: 'one'.length,
      text: 'one:wave:two'
    });
  });

  it('uses the end of contenteditable text when the selection is outside the input', () => {
    const input = createContentEditable();
    input.append('hello');
    const outside = document.createElement('p');
    outside.textContent = 'outside';
    document.body.append(input, outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(getChatInputTextSelection()).toEqual({
      selectionEnd: 5,
      selectionStart: 5,
      text: 'hello'
    });
  });

  it('reads textarea snapshots and selection offsets', () => {
    const textarea = createTextArea('hello world');
    document.body.append(textarea);
    textarea.selectionStart = 2;
    textarea.selectionEnd = 7;

    expect(getChatInputSnapshot()).toEqual({
      childNodes: [],
      text: 'hello world'
    });
    expect(getChatInputText()).toBe('hello world');
    expect(getChatInputTextSelection()).toEqual({
      selectionEnd: 7,
      selectionStart: 2,
      text: 'hello world'
    });
  });

  it('falls back to textarea length when selection offsets are unavailable', () => {
    const textarea = createTextArea('hello');
    document.body.append(textarea);
    Object.defineProperty(textarea, 'selectionStart', {
      configurable: true,
      get: () => null,
      set: () => undefined
    });
    Object.defineProperty(textarea, 'selectionEnd', {
      configurable: true,
      get: () => null,
      set: () => undefined
    });

    expect(getChatInputTextSelection()).toEqual({
      selectionEnd: 5,
      selectionStart: 5,
      text: 'hello'
    });
    expect(insertIntoChatInput(' world')).toBe(true);
    expect(textarea.value).toBe('hello world');
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

  it('appends textarea text when the input is not focused', () => {
    const textarea = createTextArea('hello');
    const other = document.createElement('button');
    document.body.append(textarea, other);
    other.focus();
    textarea.selectionStart = 0;
    textarea.selectionEnd = 0;

    expect(insertIntoChatInput(' world')).toBe(true);

    expect(textarea.value).toBe('hello world');
    expect(textarea.selectionStart).toBe(11);
  });

  it('clamps textarea text range replacements to safe bounds', () => {
    const textarea = createTextArea('hello');
    document.body.append(textarea);

    expect(replaceChatInputTextRange(-10, 99, 'done')).toBe(true);

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

  it('appends contenteditable text when the editor is not focused or selection is outside', () => {
    const input = createContentEditable();
    input.append('hello');
    const outside = document.createElement('button');
    document.body.append(input, outside);
    outside.focus();
    const range = document.createRange();
    range.selectNodeContents(outside);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(insertIntoChatInput(' world')).toBe(true);

    expect(getChatInputText()).toBe('hello world');
  });

  it('returns contenteditable text presence when execCommand reports failed insertion', () => {
    vi.mocked(document.execCommand).mockReturnValue(false);
    const input = createContentEditable();
    input.append('hello');
    document.body.append(input);

    expect(insertIntoChatInput(' world')).toBe(true);
  });

  it('creates insertion ranges for contenteditable node insertion when selection is missing or outside', () => {
    const input = createContentEditable();
    input.append('hello');
    document.body.append(input);
    document.getSelection()?.removeAllRanges();
    const image = document.createElement('img');
    image.alt = ':wave:';

    expect(insertNodeIntoChatInput(image, ':wave:')).toBe(true);
    expect(input.querySelector('img')?.alt).toBe(':wave:');

    const outside = document.createElement('button');
    document.body.append(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    const strong = document.createElement('strong');
    strong.textContent = 'tail';

    expect(insertNodesIntoChatInput([strong], 'tail')).toBe(true);
    expect(input.textContent).toContain('tail');
  });

  it('inserts nodes into the current contenteditable selection', () => {
    const input = createContentEditable();
    input.append('hello world');
    document.body.append(input);
    input.focus();
    const range = document.createRange();
    range.setStart(input.firstChild!, 6);
    range.setEnd(input.firstChild!, 11);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    const strong = document.createElement('strong');
    strong.textContent = 'chat';
    expect(insertNodeIntoChatInput(strong, 'chat')).toBe(true);

    expect(input.textContent).toBe('hello chat');
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

  it('inserts trailing text after contenteditable node groups', () => {
    const input = createContentEditable();
    input.append('hello');
    document.body.append(input);
    const strong = document.createElement('strong');
    strong.textContent = ' quote';

    expect(insertNodesIntoChatInput([strong], ' quote', ' ')).toBe(true);

    expect(input.textContent).toBe('hello quote ');
  });

  it('replaces nested contenteditable ranges by plain-text offsets', () => {
    const input = createContentEditable();
    const first = document.createElement('span');
    first.textContent = 'alpha';
    const second = document.createElement('span');
    second.textContent = 'beta';
    input.append(first, ' ', second, ' gamma');
    document.body.append(input);

    expect(replaceChatInputTextRange(2, 12, 'X')).toBe(true);

    expect(getChatInputText()).toBe('alXamma');
  });

  it('replaces ranges around plain-text leaf nodes by plain-text offsets', () => {
    const input = createContentEditable();
    const image = document.createElement('img');
    image.alt = ':wave:';
    input.append('hello ', image, ' world');
    document.body.append(input);

    expect(replaceChatInputTextRange(6, 12, 'emoji')).toBe(true);

    expect(getChatInputText()).toBe('hello emoji world');
  });

  it('falls back when contenteditable execCommand insertion fails', () => {
    vi.mocked(document.execCommand).mockReturnValue(false);
    const input = createContentEditable();
    input.append('hello world');
    document.body.append(input);

    expect(replaceChatInputTextRange(6, 11, 'chat')).toBe(true);
    expect(input.textContent).toBe('hello chat');

    expect(replaceChatInput('done')).toBe(true);
    expect(input.textContent).toBe('done');
  });

  it('falls back to plain text for textarea node insertion and empty node groups', () => {
    const textarea = createTextArea('hello');
    document.body.append(textarea);

    expect(insertNodeIntoChatInput(document.createElement('img'), ':emoji:')).toBe(true);
    expect(textarea.value).toBe('hello:emoji:');
    expect(insertNodesIntoChatInput([], ' fallback')).toBe(true);
    expect(textarea.value).toBe('hello:emoji: fallback');
    expect(insertNodeIntoChatInput(document.createElement('img'))).toBe(false);
    expect(insertNodesIntoChatInput([document.createElement('img')])).toBe(false);
    expect(insertNodesIntoChatInput([])).toBe(false);
  });

  it('uses fallback text for textarea node groups with nodes', () => {
    const textarea = createTextArea('hello');
    document.body.append(textarea);

    expect(insertNodesIntoChatInput([document.createElement('img')], ':emoji:')).toBe(true);

    expect(textarea.value).toBe('hello:emoji:');
  });

  it('replaces textarea content from snapshots and node groups using fallback text', () => {
    const textarea = createTextArea('hello');
    document.body.append(textarea);

    expect(replaceChatInputSnapshot({
      childNodes: [document.createTextNode('rich')],
      text: 'snapshot'
    })).toBe(true);
    expect(textarea.value).toBe('snapshot');

    expect(replaceNodesInChatInput([document.createElement('img')], ':emoji:')).toBe(true);
    expect(textarea.value).toBe(':emoji:');
  });

  it('reads visible fallback text from rich input leaves while ignoring hidden UI text', () => {
    const input = createContentEditable();
    const lineBreak = document.createElement('br');
    const ariaEmoji = document.createElement('span');
    ariaEmoji.setAttribute('role', 'img');
    ariaEmoji.setAttribute('aria-label', ':party:');
    const titleEmoji = document.createElement('span');
    titleEmoji.setAttribute('role', 'img');
    titleEmoji.setAttribute('title', ':sparkles:');
    const emptyLeaf = document.createElement('span');
    const ariaHidden = document.createElement('span');
    ariaHidden.setAttribute('aria-hidden', 'true');
    ariaHidden.textContent = 'hidden';
    const hiddenElement = document.createElement('span');
    hiddenElement.hidden = true;
    hiddenElement.textContent = 'hidden';
    const menuText = document.createElement('span');
    menuText.setAttribute('role', 'menuitem');
    menuText.textContent = 'menu';
    const textEmoji = document.createElement('span');
    textEmoji.setAttribute('role', 'img');
    textEmoji.textContent = ':text-emoji:';
    const displayNone = document.createElement('span');
    displayNone.style.display = 'none';
    displayNone.textContent = 'display none';
    const invisible = document.createElement('span');
    invisible.style.visibility = 'hidden';
    invisible.textContent = 'invisible';
    input.append(
      'hello',
      lineBreak,
      ariaEmoji,
      titleEmoji,
      textEmoji,
      emptyLeaf,
      ariaHidden,
      hiddenElement,
      menuText,
      displayNone,
      invisible
    );
    document.body.append(input);

    expect(getChatInputText()).toBe('hello\n:party::sparkles::text-emoji:');
    expect(getChatInputNodesText(Array.from(input.childNodes))).toBe('hello\n:party::sparkles::text-emoji:');
  });

  it('reads comments and non-HTMLElement nodes without treating them as hidden UI', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.textContent = 'svg text';
    expect(getChatInputNodesText([
      document.createTextNode('hello'),
      document.createComment('ignored'),
      svg
    ])).toBe('hellosvg text');
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
