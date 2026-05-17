/**
 * YouTube chat input adapter.
 *
 * All text insertion flows go through this module because YouTube can render
 * the input as different editable elements. The adapter dispatches input events
 * after mutation so YouTube's own send button state updates.
 */
export interface ChatInputSnapshot {
  childNodes: Node[];
  text: string;
}

export function findChatInput(): HTMLElement | HTMLTextAreaElement | HTMLInputElement | null {
  const candidates = Array.from(document.querySelectorAll([
    'yt-live-chat-text-input-field-renderer #input[contenteditable]',
    'yt-live-chat-text-input-field-renderer [contenteditable]',
    'yt-live-chat-message-input-renderer [contenteditable]',
    '#input[contenteditable]',
    '#textarea[contenteditable]',
    '[contenteditable]:not([contenteditable="false"])',
    'textarea:not([disabled])',
    'input[type="text"]:not([disabled])'
  ].join(',')));

  return candidates.find((candidate): candidate is HTMLElement | HTMLTextAreaElement | HTMLInputElement => {
    if (!(candidate instanceof HTMLElement)) return false;
    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || null;
}

export function getChatInputSnapshot(): ChatInputSnapshot | null {
  const input = findChatInput();
  if (!input) return null;

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return {
      childNodes: [],
      text: input.value
    };
  }

  return {
    childNodes: Array.from(input.childNodes).map((node) => node.cloneNode(true)),
    text: getInputPlainText(input)
  };
}

export function getChatInputText(): string {
  const input = findChatInput();
  if (!input) return '';

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return input.value;
  }

  return getInputPlainText(input);
}

export function insertIntoChatInput(text: string): boolean {
  const input = findChatInput();
  if (!input) return false;

  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    input.selectionStart = input.selectionEnd = start + text.length;
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text
    }));
    return true;
  }

  const selection = document.getSelection();
  const selectionNode = selection?.anchorNode || null;
  if (selection && (!selectionNode || !input.contains(selectionNode))) {
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  const inserted = document.execCommand('insertText', false, text);
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: text
  }));
  return inserted || Boolean(input.textContent);
}

export function replaceChatInput(text: string): boolean {
  const input = findChatInput();
  if (!input) return false;

  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    input.value = text;
    input.selectionStart = input.selectionEnd = text.length;
    dispatchInputReplacement(input);
    return true;
  }

  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const inserted = document.execCommand('insertText', false, text);
  if (!inserted) {
    input.textContent = text;
  }

  const endRange = document.createRange();
  endRange.selectNodeContents(input);
  endRange.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(endRange);

  dispatchInputReplacement(input);
  return true;
}

export function replaceChatInputSnapshot(snapshot: ChatInputSnapshot): boolean {
  const input = findChatInput();
  if (!input) return false;

  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement || !snapshot.childNodes.length) {
    return replaceChatInput(snapshot.text);
  }

  input.replaceChildren(...snapshot.childNodes.map((node) => node.cloneNode(true)));
  moveCaretToEnd(input);
  dispatchInputReplacement(input);
  return true;
}

function moveCaretToEnd(input: HTMLElement): void {
  const selection = document.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function dispatchInputReplacement(input: HTMLElement | HTMLTextAreaElement | HTMLInputElement): void {
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertReplacementText'
  }));
}

function getInputPlainText(input: HTMLElement): string {
  return Array.from(input.childNodes).map(getNodePlainText).join('') || input.textContent || '';
}

function getNodePlainText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof Element)) return '';

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') return '\n';
  if (tagName === 'img' || node.getAttribute('role') === 'img') {
    return node.getAttribute('alt') ||
      node.getAttribute('aria-label') ||
      node.getAttribute('title') ||
      node.textContent ||
      '';
  }

  return Array.from(node.childNodes).map(getNodePlainText).join('') || node.textContent || '';
}
