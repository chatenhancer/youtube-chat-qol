/**
 * YouTube chat input adapter.
 *
 * All text insertion flows go through this module because YouTube can render
 * the input as different editable elements. The adapter dispatches input events
 * after mutation so YouTube's own send button state updates.
 */
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
