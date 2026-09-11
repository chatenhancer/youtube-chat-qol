/** Browser scenario for Lite mode's YouTube-backed message action menu. */
import { expect, test } from '@playwright/test';
import { toggleLiteModeFromMenu } from './menu';
import { BOOKMARKS_STORAGE_KEY } from '../../../src/shared/bookmarks';
import {
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import { expectBookmarkToastAtBottom, expectFeedBookmarkLayout } from '../bookmarks';
import { clearLiteTestCooldown, expectStoredLiteMode } from './assertions';
import {
  LITE_ROOT_SELECTOR,
  NATIVE_MESSAGE_SELECTOR
} from './selectors';

export const liteModeMessageActionsScenario: BrowserScenario = async ({
  chat,
  context,
  controlledChat
}) => {
  test.setTimeout(120_000);
  await withExtensionStorageValues(context, 'sync', { liteModeEnabled: false }, async () => {
    const root = chat.locator(LITE_ROOT_SELECTOR);
    try {
      await clearLiteTestCooldown(chat);
      const targetMessageId = await controlledChat?.injectMessage({
        author: '@MenuFixture',
        channel: 'UCYtcqLiteMessageActions',
        text: 'Open the Lite message actions beside a long message that wraps across several lines without covering the bookmark or menu buttons.'.repeat(2)
      });
      await expect(chat.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({ timeout: 30_000 });

      await toggleLiteModeFromMenu(chat);
      await expectStoredLiteMode(context, true);
      await expect(root).toBeVisible({ timeout: 20_000 });

      await test.step('Open Lite message actions without leaving the chat viewport', async () => {
        const targetAttribute = 'data-ytcq-test-lite-menu-target';
        const targetRow = targetMessageId
          ? root.locator(`[data-message-id=${JSON.stringify(targetMessageId)}]`).first()
          : root.locator('.ytcq-lite-message-text').last();
        await expect(targetRow).toBeVisible({ timeout: 30_000 });
        // Stop following new traffic while interacting with this retained message.
        await root.locator('.ytcq-lite-scroller').press('ArrowUp');
        await targetRow.evaluate(
          (row, attribute) => row.setAttribute(attribute, ''),
          targetAttribute
        );
        const row = root.locator(`[${targetAttribute}]`);
        const actionButton = row.locator('.ytcq-lite-message-menu-button');
        const menu = chat
          .locator('ytd-menu-popup-renderer')
          .filter({
            has: chat.locator('.ytcq-context-item[data-ytcq-action="reply-actions"]')
          })
          .last();
        try {
          await row.hover();
          await expect(actionButton).toBeVisible();
          await expect(actionButton).toHaveAttribute('aria-haspopup', 'menu');
          await expect(actionButton).toHaveAttribute('aria-expanded', 'false');

          await row.locator('#message').click();
          await expect(menu).toBeVisible();
          await menu.locator('[data-ytcq-action="mention"]').press('Escape');
          await expect(menu).toBeHidden();

          await actionButton.press('Enter');
          await expect(menu).toBeVisible();
          await expect(actionButton).toHaveAttribute('aria-expanded', 'true');
          await expect(menu.locator('[data-ytcq-action="save-message"]')).toHaveCount(0);
          await expect(menu.locator('[data-ytcq-action="mention"]')).toBeVisible();
          await expect(menu.locator('[data-ytcq-action="quote"]')).toBeVisible();
          const bounds = await menu.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return {
              inside:
                rect.left >= 0 &&
                rect.top >= 0 &&
                rect.right <= window.innerWidth &&
                rect.bottom <= window.innerHeight
            };
          });
          expect(bounds.inside).toBe(true);

          await menu.locator('[data-ytcq-action="mention"]').press('Escape');
          await expect(menu).toBeHidden();
          await expect(actionButton).toHaveAttribute('aria-expanded', 'false');

          await withExtensionStorageValues(context, 'local', { [BOOKMARKS_STORAGE_KEY]: {} }, async () => {
            const save = row.locator('#menu > .ytcq-chat-bookmark-toggle');
            await row.hover();
            await expect(save).toHaveAttribute('aria-pressed', 'false');
            await expectFeedBookmarkLayout(row);
            await save.click();
            await expect(save).toHaveAttribute('aria-pressed', 'true');
            await expect(save).toHaveAttribute('title', /Remove bookmark\nAdded /);
            await expectBookmarkToastAtBottom(chat);
            await expect(menu).toBeHidden();
            await expect(actionButton).toHaveAttribute('aria-expanded', 'false');
            await save.press('Space');
            await expect(save).toHaveAttribute('aria-pressed', 'false');
            await expect(menu).toBeHidden();
          });
        } finally {
          await row
            .evaluate((element, attribute) => {
              element.removeAttribute(attribute);
            }, targetAttribute)
            .catch(() => undefined);
        }
      });
    } finally {
      await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
        () => undefined
      );
      await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
      await clearLiteTestCooldown(chat).catch(() => undefined);
    }
  });
};
