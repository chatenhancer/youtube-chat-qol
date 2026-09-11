/** Browser scenarios for Lite mode toggle behavior. */
import { expect, test } from '@playwright/test';
import { expectLiteModeMenuState, toggleLiteModeFromMenu } from './menu';
import {
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import {
  clearLiteTestCooldown,
  expectLiteAtLiveEdge,
  expectStoredLiteMode
} from './assertions';
import {
  LITE_DOCUMENT_MARKER_ATTRIBUTE,
  LITE_NATIVE_DISCARDED_ATTRIBUTE,
  LITE_NATIVE_RESTORE_SELECTOR,
  LITE_ROOT_SELECTOR,
  NATIVE_LIST_SELECTOR,
  NATIVE_MESSAGE_SELECTOR
} from './selectors';

export const liteModeToggleAndRestoreScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  await withExtensionStorageValues(context, 'sync', { liteModeEnabled: false }, async () => {
    const root = chat.locator(LITE_ROOT_SELECTOR);
    try {
      await expect(chat.locator('.ytcq-lite-mode-button')).toHaveCount(0);
      await clearLiteTestCooldown(chat);
      await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({ timeout: 20_000 });
      await expect(chat.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({ timeout: 30_000 });
      const documentMarker = `${Date.now()}-${Math.random()}`;
      await chat.locator('html').evaluate((html, marker) => {
        html.setAttribute(marker.attribute, marker.value);
      }, {
        attribute: LITE_DOCUMENT_MARKER_ATTRIBUTE,
        value: documentMarker
      });

      await test.step('Enable Lite mode from the Chat Enhancer menu', async () => {
        await expectLiteModeMenuState(chat, false);
        await toggleLiteModeFromMenu(chat);
        await expectStoredLiteMode(context, true);
        await expectLiteModeMenuState(chat, true);
        await expect(root).toBeVisible({ timeout: 20_000 });
        await expect(chat.locator('html')).toHaveAttribute(
          LITE_DOCUMENT_MARKER_ATTRIBUTE,
          documentMarker
        );
        await expect(chat.locator('html')).toHaveAttribute(
          LITE_NATIVE_DISCARDED_ATTRIBUTE,
          'true',
          { timeout: 20_000 }
        );
        await expect(chat.locator(NATIVE_LIST_SELECTOR)).toHaveCount(0);
      });

      await test.step('Keep the lightweight feed readable and usable', async () => {
        const row = root.locator('.ytcq-lite-message-text').last();
        const author = row.locator('#author-name');
        const message = row.locator('#message');
        await expect(root.locator('.ytcq-lite-scroller')).toBeVisible();
        await expect(row).toBeVisible({ timeout: 30_000 });
        await expect(row.locator('#author-photo')).toBeVisible();
        await expect(author).toBeVisible();
        await expect(message).toBeVisible();
        await expect.poll(() => author.innerText()).not.toBe('');
        await expect.poll(() => message.innerText()).not.toBe('');
        await expect(root.locator('.ytcq-lite-toolbar')).toHaveCount(0);

        await expectLiteAtLiveEdge(root);
      });

      await test.step('Disable Lite mode and restore native chat', async () => {
        await toggleLiteModeFromMenu(chat);
        await expectStoredLiteMode(context, false);
        await expect(root).toHaveCount(0, { timeout: 20_000 });
        await expect(chat.locator(NATIVE_LIST_SELECTOR).first()).toBeVisible({ timeout: 30_000 });
        await expect(chat.locator(NATIVE_MESSAGE_SELECTOR).first()).toBeVisible({
          timeout: 30_000
        });
        await expect(chat.locator(LITE_NATIVE_RESTORE_SELECTOR)).toHaveCount(0, {
          timeout: 20_000
        });
        await expect(chat.locator('html')).not.toHaveAttribute(
          LITE_NATIVE_DISCARDED_ATTRIBUTE,
          'true'
        );
        await expectLiteModeMenuState(chat, false);
      });
    } finally {
      await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
        () => undefined
      );
      await root.waitFor({ state: 'detached', timeout: 8_000 }).catch(() => undefined);
      await chat
        .locator(NATIVE_LIST_SELECTOR)
        .first()
        .waitFor({
          state: 'visible',
          timeout: 20_000
        })
        .catch(() => undefined);
      await clearLiteTestCooldown(chat).catch(() => undefined);
    }
  });
};
