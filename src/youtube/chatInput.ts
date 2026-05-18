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

export interface ChatInputTextSelection {
  selectionEnd: number;
  selectionStart: number;
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

export function getChatInputTextSelection(): ChatInputTextSelection | null {
  const input = findChatInput();
  if (!input) return null;

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return {
      selectionEnd: input.selectionEnd ?? input.value.length,
      selectionStart: input.selectionStart ?? input.value.length,
      text: input.value
    };
  }

  const text = getInputPlainText(input);
  const selection = document.getSelection();
  if (!selection?.rangeCount) {
    return {
      selectionEnd: text.length,
      selectionStart: text.length,
      text
    };
  }

  const range = selection.getRangeAt(0);
  if (!inputContainsNode(input, range.startContainer) || !inputContainsNode(input, range.endContainer)) {
    return {
      selectionEnd: text.length,
      selectionStart: text.length,
      text
    };
  }

  return {
    selectionEnd: getPlainTextOffset(input, range.endContainer, range.endOffset),
    selectionStart: getPlainTextOffset(input, range.startContainer, range.startOffset),
    text
  };
}

export function insertIntoChatInput(text: string): boolean {
  const input = findChatInput();
  if (!input) return false;

  const shouldAppend = !isChatInputFocused(input);
  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const start = shouldAppend ? input.value.length : input.selectionStart ?? input.value.length;
    const end = shouldAppend ? input.value.length : input.selectionEnd ?? input.value.length;
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
  if (selection && (shouldAppend || !selectionNode || !input.contains(selectionNode))) {
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

export function insertNodeIntoChatInput(node: Node, fallbackText = ''): boolean {
  const input = findChatInput();
  if (!input) return false;

  const shouldAppend = !isChatInputFocused(input);
  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return fallbackText ? insertIntoChatInput(fallbackText) : false;
  }

  const selection = document.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : null;

  if (shouldAppend || !range || !inputContainsNode(input, range.startContainer) || !inputContainsNode(input, range.endContainer)) {
    range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
  }

  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection?.removeAllRanges();
  selection?.addRange(range);

  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: fallbackText
  }));

  return true;
}

function isChatInputFocused(input: HTMLElement | HTMLTextAreaElement | HTMLInputElement): boolean {
  const active = document.activeElement;
  return active === input || Boolean(active && input.contains(active));
}

export function replaceChatInputTextRange(start: number, end: number, text: string): boolean {
  const input = findChatInput();
  if (!input) return false;

  input.focus();

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    const safeStart = Math.max(0, Math.min(start, input.value.length));
    const safeEnd = Math.max(safeStart, Math.min(end, input.value.length));
    input.value = `${input.value.slice(0, safeStart)}${text}${input.value.slice(safeEnd)}`;
    input.selectionStart = input.selectionEnd = safeStart + text.length;
    dispatchInputReplacement(input);
    return true;
  }

  const fullTextLength = getInputPlainText(input).length;
  const safeStart = Math.max(0, Math.min(start, fullTextLength));
  const safeEnd = Math.max(safeStart, Math.min(end, fullTextLength));
  const selection = document.getSelection();
  const range = document.createRange();
  const startPosition = getPositionForPlainTextOffset(input, safeStart);
  const endPosition = getPositionForPlainTextOffset(input, safeEnd);

  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  selection?.removeAllRanges();
  selection?.addRange(range);

  const inserted = document.execCommand('insertText', false, text);
  if (!inserted) {
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
  }

  dispatchInputReplacement(input);
  return true;
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

function inputContainsNode(input: HTMLElement, node: Node): boolean {
  return input === node || input.contains(node);
}

function getPlainTextOffset(root: HTMLElement, container: Node, offset: number): number {
  let total = 0;
  let found = false;

  const walk = (node: Node): void => {
    if (found) return;

    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        total += Math.max(0, Math.min(offset, node.textContent?.length || 0));
      } else {
        Array.from(node.childNodes).slice(0, offset).forEach((child) => {
          total += getNodePlainText(child).length;
        });
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE || isPlainTextLeaf(node)) {
      total += getNodePlainText(node).length;
      return;
    }

    node.childNodes.forEach(walk);
  };

  walk(root);
  return found ? total : getInputPlainText(root).length;
}

function getPositionForPlainTextOffset(root: HTMLElement, targetOffset: number): { node: Node; offset: number } {
  let remaining = Math.max(0, targetOffset);

  const walkChildren = (parent: Node): { node: Node; offset: number } => {
    const children = Array.from(parent.childNodes);
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      const childTextLength = getNodePlainText(child).length;

      if (child.nodeType === Node.TEXT_NODE) {
        if (remaining <= childTextLength) {
          return {
            node: child,
            offset: Math.max(0, Math.min(remaining, child.textContent?.length || 0))
          };
        }

        remaining -= childTextLength;
        continue;
      }

      if (!isPlainTextLeaf(child) && child.childNodes.length) {
        if (remaining <= childTextLength) return walkChildren(child);
        remaining -= childTextLength;
        continue;
      }

      if (remaining <= childTextLength) {
        return {
          node: parent,
          offset: index + (remaining > 0 ? 1 : 0)
        };
      }

      remaining -= childTextLength;
    }

    return {
      node: parent,
      offset: children.length
    };
  };

  return walkChildren(root);
}

function isPlainTextLeaf(node: Node): boolean {
  if (!(node instanceof Element)) return false;

  const tagName = node.tagName.toLowerCase();
  return tagName === 'br' || tagName === 'img' || node.getAttribute('role') === 'img' || node.childNodes.length === 0;
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
