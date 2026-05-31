/**
 * Browser scenario for the chat-header Inbox panel.
 *
 * The same check runs in logged-out and logged-in contexts because the Inbox
 * should be available whenever the extension is attached to YouTube live chat.
 */
import { expect, test } from '@playwright/test';
import type { BrowserScenario, ChatSurface } from './types';

export const inboxScenario: BrowserScenario = {
  name: 'Inbox opens from the chat header',
  run: async ({ chat }) => {
    await expectInboxButtonAttached(chat);
    await openInboxPanel(chat);
    await closeInboxPanel(chat);
  }
};

async function expectInboxButtonAttached(chat: ChatSurface): Promise<void> {
  await test.step('Verify Inbox button is attached', async () => {
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(chat.locator('.ytcq-refresh-chat-button')).toHaveCount(0);
  });
}

async function openInboxPanel(chat: ChatSurface): Promise<void> {
  await test.step('Open Inbox panel', async () => {
    await chat.locator('.ytcq-inbox-button').click();
    await expect(chat.locator('.ytcq-inbox-card')).toBeVisible();
  });
}

async function closeInboxPanel(chat: ChatSurface): Promise<void> {
  await test.step('Close Inbox panel', async () => {
    await chat.locator('.ytcq-inbox-card .ytcq-profile-card-close').click();
    await expect(chat.locator('.ytcq-inbox-card')).toHaveCount(0);
  });
}
