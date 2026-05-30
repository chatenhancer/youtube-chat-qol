/**
 * Logged-out real YouTube live chat smoke test.
 *
 * This uses a throwaway Playwright profile and checks the read-only extension
 * surfaces that should work without a signed-in chat composer.
 */
import { expect, test } from '@playwright/test';
import path from 'node:path';
import {
  closeExtensionContext,
  launchExtensionContext
} from '../../helpers/chrome';
import { expectReadOnlyFeatures } from '../../helpers/assertions';
import { getLiveUrl, openLiveChat } from '../../helpers/youtube-page';

test('logged-out live chat still has read-only extension features', async ({ browserName: _browserName }, testInfo) => {
  void _browserName;
  test.setTimeout(150_000);

  const context = await launchExtensionContext({
    headless: false,
    profileDir: testInfo.outputPath(path.join('profiles', 'logged-out')),
    testInfo
  });

  try {
    const page = await context.newPage();
    const chat = await openLiveChat(page, getLiveUrl());
    await expectReadOnlyFeatures(context, page, chat);
    await expect(chat.locator('yt-live-chat-message-input-renderer')).toHaveCount(0);
  } finally {
    await closeExtensionContext(context);
  }
});
