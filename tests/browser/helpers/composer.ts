/**
 * Chat composer helpers for browser tests.
 *
 * These helpers read and clear the visible YouTube chat composer without
 * sending messages.
 */
import { expect } from '@playwright/test';
import type { ChatSurface } from './chat-surface';
import { cleanVisibleText } from './text';

const CHAT_COMPOSER_INPUT_SELECTOR = [
  'yt-live-chat-message-input-renderer #input[contenteditable]',
  'yt-live-chat-message-input-renderer [contenteditable]',
  '#input[contenteditable]'
].join(',');

export async function clearChatComposer(chat: ChatSurface): Promise<void> {
  const input = chat.locator(CHAT_COMPOSER_INPUT_SELECTOR).first();
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

export async function getChatComposerText(chat: ChatSurface): Promise<string> {
  return chat.locator(CHAT_COMPOSER_INPUT_SELECTOR).first().evaluate((element) => {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }

    return element.textContent || '';
  });
}
