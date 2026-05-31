/**
 * Browser scenario for extension attachment.
 *
 * This verifies the content script attached to the current chat surface and
 * that the popup can see the active live-chat tab.
 */
import { expect, test } from '@playwright/test';
import { expectPopupReportsActiveStatus } from '../helpers/popup-status';
import type { BrowserScenario, ChatSurface } from './types';

const EXTENSION_ATTACH_TIMEOUT_MS = 15_000;

export const attachScenario: BrowserScenario = async ({ chat, extensionContext }) => {
  await expectExtensionUiAttached(chat);
  await expectReconnectPromptHidden(chat);
  await expectVisibleChatMessages(chat);
  await test.step('Verify popup reports active status', async () => {
    await expectPopupReportsActiveStatus(extensionContext);
  });
};

async function expectExtensionUiAttached(chat: ChatSurface): Promise<void> {
  await test.step('Verify extension UI attached to chat', async () => {
    await expect(
      chat.locator('.ytcq-inbox-button'),
      'The extension did not attach to the live chat frame. Run `npm run build:chrome`, then rerun the browser smoke test.'
    ).toBeVisible({ timeout: EXTENSION_ATTACH_TIMEOUT_MS });
  });
}

async function expectReconnectPromptHidden(chat: ChatSurface): Promise<void> {
  await test.step('Verify reconnect prompt is not shown', async () => {
    await expect(chat.locator('.ytcq-refresh-chat-button')).toHaveCount(0);
  });
}

async function expectVisibleChatMessages(chat: ChatSurface): Promise<void> {
  await test.step('Verify chat has visible messages', async () => {
    const initialMessageCount = await chat.locator('yt-live-chat-text-message-renderer').count();
    expect(initialMessageCount).toBeGreaterThan(0);
  });
}
