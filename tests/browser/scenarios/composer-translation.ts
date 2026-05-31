/**
 * Browser scenario for the composer translation control.
 *
 * This scenario is logged-in only because YouTube exposes the composer only
 * when the current viewer can write in chat.
 */
import { expect, test } from '@playwright/test';
import type { BrowserScenario, ChatSurface } from './types';

export const composerTranslationScenario: BrowserScenario = {
  name: 'Composer translation controls open',
  run: async ({ chat }) => {
    await expectChatComposerVisible(chat);
    await expectComposerTranslateButtonAttached(chat);
    await openComposerTranslationPanel(chat);
  }
};

async function expectChatComposerVisible(chat: ChatSurface): Promise<void> {
  await test.step('Verify chat composer is visible', async () => {
    await expect(chat.locator('yt-live-chat-message-input-renderer')).toBeVisible();
  });
}

async function expectComposerTranslateButtonAttached(chat: ChatSurface): Promise<void> {
  await test.step('Verify composer translate button is attached', async () => {
    await expect(chat.locator('.ytcq-composer-translate-button')).toBeVisible();
  });
}

async function openComposerTranslationPanel(chat: ChatSurface): Promise<void> {
  await test.step('Open composer translation panel', async () => {
    await chat.locator('.ytcq-composer-translate-button').click();
    await expect(chat.locator('.ytcq-composer-translate-panel')).toBeVisible();
  });
}
