/**
 * Deterministic extension browser smoke test.
 *
 * Serves a small YouTube-live-chat-shaped fixture and verifies that the built
 * extension attaches its main injected surfaces without relying on live
 * YouTube, network timing, or an authenticated browser profile.
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  closeExtensionContext,
  launchExtensionContext
} from '../../helpers/chrome';
import { getExtensionId } from '../../helpers/extension';
import {
  createLiveChatFixtureHtml,
  fixtureLiveChatUrl
} from '../../helpers/live-chat-fixture';

test('extension attaches to a mocked YouTube live chat surface', async ({ browserName: _browserName }, testInfo) => {
  void _browserName;
  const context = await launchExtensionContext({
    profileDir: testInfo.outputPath(path.join('profiles', 'fixture')),
    testInfo
  });

  try {
    const pageErrors: string[] = [];
    await context.route('https://www.youtube.com/live_chat*', (route) => {
      route.fulfill({
        body: createLiveChatFixtureHtml(),
        contentType: 'text/html'
      });
    });

    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    await page.goto(fixtureLiveChatUrl, { timeout: 15_000, waitUntil: 'commit' });
    await expect(page.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 15_000 });

    await expect.poll(
      async () => page.evaluate(() => document.querySelectorAll('.ytcq-inbox-button').length),
      {
        message: `extension should inject the Inbox button; page errors: ${pageErrors.join('\n') || 'none'}`,
        timeout: 15_000
      }
    ).toBe(1);

    await expect(page.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(page.locator('.ytcq-composer-translate-button')).toBeVisible();
    await expect(page.locator('.ytcq-refresh-chat-button')).toHaveCount(0);

    await page.locator('.ytcq-inbox-button').dispatchEvent('click');
    await expect(page.locator('.ytcq-inbox-card')).toBeVisible();
    await expect(page.locator('.ytcq-inbox-empty')).toBeVisible();
    await page.locator('.ytcq-inbox-card .ytcq-profile-card-close').dispatchEvent('click');
    await expect(page.locator('.ytcq-inbox-card')).toHaveCount(0);

    await page.evaluate(() => {
      window.ytcqAddSettingsMenu();
    });
    await expect(page.locator('.ytcq-settings-item').filter({ hasText: 'Translate chat' })).toBeVisible();
    await expect(page.locator('.ytcq-settings-item').filter({ hasText: 'Inbox sound' })).toBeVisible();

    await page.locator('#fixture-message-1 #menu').dispatchEvent('click');
    await page.evaluate(() => {
      window.ytcqAddMessageMenu();
    });
    await expect(page.locator('.ytcq-context-item').filter({ hasText: 'Quote' })).toBeVisible();
    await expect(page.locator('.ytcq-context-item').filter({ hasText: 'Mention' })).toBeVisible();

    await page.locator('#fixture-message-1 #author-photo').dispatchEvent('click');
    const profileCard = page.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard).toBeVisible();
    await expect(profileCard.locator('.ytcq-profile-card-author')).toHaveText('@ExampleCreator');
    await profileCard.locator('.ytcq-profile-card-close').dispatchEvent('click');
    await expect(profileCard).toHaveCount(0);

    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('[data-extension-status-text]')).toContainText(/Active/);
  } finally {
    await closeExtensionContext(context);
  }
});

declare global {
  interface Window {
    ytcqAddMessageMenu(): void;
    ytcqAddSettingsMenu(): void;
  }
}
