/**
 * Chat composer helpers for browser tests.
 *
 * These helpers read and clear the visible YouTube chat composer without
 * sending messages.
 */
import { expect, type Locator } from '@playwright/test';
import type { ChatSurface } from './chat-surface';
import { cleanVisibleText } from './text';

const CHAT_COMPOSER_INPUT_SELECTOR = [
  'yt-live-chat-message-input-renderer #input[contenteditable]',
  'yt-live-chat-message-input-renderer [contenteditable]',
  '#input[contenteditable]'
].join(',');

export async function clearChatComposer(chat: ChatSurface): Promise<void> {
  const input = getChatComposerInput(chat);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.evaluate((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = '';
    } else {
      element.replaceChildren();
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'deleteContentBackward'
    }));
  });

  await expect.poll(async () => cleanVisibleText(await getChatComposerText(chat)), {
    message: 'Chat composer should be empty after cleanup.',
    timeout: 5_000
  }).toBe('');
}

export async function clearChatComposerIfVisible(
  chat: ChatSurface,
  timeout = 500
): Promise<void> {
  if (!await getChatComposerInput(chat).isVisible({ timeout }).catch(() => false)) return;
  await clearChatComposer(chat);
}

export function getChatComposerInput(chat: ChatSurface): Locator {
  return chat.locator(CHAT_COMPOSER_INPUT_SELECTOR).first();
}

export async function getChatComposerText(chat: ChatSurface): Promise<string> {
  return getChatComposerInput(chat).evaluate((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }

    const getNodeText = (node: Node): string => {
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

      return Array.from(node.childNodes).map(getNodeText).join('');
    };

    return Array.from(element.childNodes).map(getNodeText).join('');
  });
}

export async function setChatComposerText(chat: ChatSurface, text: string): Promise<void> {
  const input = getChatComposerInput(chat);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.evaluate((element, nextText) => {
    element.focus();

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = nextText;
      element.setSelectionRange(nextText.length, nextText.length);
    } else {
      element.replaceChildren(document.createTextNode(nextText));
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: nextText,
      inputType: 'insertText'
    }));
  }, text);
}
