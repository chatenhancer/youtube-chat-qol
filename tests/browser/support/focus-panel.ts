/**
 * Focus panel helpers for browser tests.
 */
import type { ChatSurface } from './chat-surface';

export async function closeFocusPromptIfPresent(chat: ChatSurface): Promise<void> {
  await chat.locator('body').press('Escape').catch(() => undefined);
  const closeButton = chat.locator('.ytcq-focus-card .ytcq-focus-close').first();
  if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeButton.click();
  }
}
