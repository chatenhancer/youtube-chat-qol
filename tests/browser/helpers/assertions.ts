/**
 * Shared browser-test assertions for core injected extension surfaces.
 *
 * The fixture and real YouTube smoke tests both use these checks to confirm
 * that the built extension attached, the Inbox can open, profile cards render,
 * and the popup sees an active chat tab.
 */
import { expect, type BrowserContext, type FrameLocator, type Page } from '@playwright/test';
import { getExtensionId } from './extension';

const EXTENSION_ATTACH_TIMEOUT_MS = 15_000;

export async function expectReadOnlyFeatures(
  context: BrowserContext,
  page: Page,
  chat: FrameLocator,
  installedExtensionId?: string | null
): Promise<void> {
  await expect(
    chat.locator('.ytcq-inbox-button'),
    'The extension did not attach to the live chat frame. Run `npm run build:chrome`, then rerun the live smoke test. For the signed-in Chrome smoke, install dist/extension-chrome manually in the test profile if Chrome ignores --load-extension.'
  ).toBeVisible({ timeout: EXTENSION_ATTACH_TIMEOUT_MS });
  await expect(chat.locator('.ytcq-refresh-chat-button')).toHaveCount(0);

  await chat.locator('.ytcq-inbox-button').click();
  await expect(chat.locator('.ytcq-inbox-card')).toBeVisible();
  await chat.locator('.ytcq-inbox-card .ytcq-profile-card-close').click();
  await expect(chat.locator('.ytcq-inbox-card')).toHaveCount(0);

  const firstAvatar = chat.locator('yt-live-chat-text-message-renderer #author-photo').first();
  await firstAvatar.waitFor({ state: 'visible', timeout: 45_000 });
  await firstAvatar.click();
  await expect(chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)')).toBeVisible();

  const initialMessageCount = await chat.locator('yt-live-chat-text-message-renderer').count();
  expect(initialMessageCount).toBeGreaterThan(0);
  await page.waitForTimeout(5_000);
  await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();

  const extensionId = installedExtensionId || await getExtensionId(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('[data-extension-status-text]')).toContainText(/Active/);
  await popup.close();
}
