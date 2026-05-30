/**
 * Signed-in real YouTube live chat smoke test.
 *
 * This uses the dedicated `.chrome-test-profile` prepared by
 * `npm run test:youtube-login`, because Google's signed-in web session can be
 * bound to normal Chrome profile state.
 */
import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { launchNormalChromeExtensionContext } from '../../helpers/chrome';
import { expectReadOnlyFeatures } from '../../helpers/assertions';
import {
  extensionDir,
  getLiveProfileDir
} from '../../helpers/paths';
import { getInstalledProfileExtensionId } from '../../helpers/extension';
import {
  getLiveUrl,
  getUnavailableComposerReason,
  isChatComposerVisible,
  openLiveChat,
  primeYouTubeSession
} from '../../helpers/youtube-page';

test('logged-in live chat has composer extension features', async ({ browserName: _browserName }, testInfo) => {
  void _browserName;
  test.setTimeout(180_000);

  const profileDir = getLiveProfileDir();
  const liveUrl = getLiveUrl();
  console.log(`Using signed-in Chrome profile: ${profileDir}`);
  console.log(`Opening live stream: ${liveUrl}`);
  if (!existsSync(path.join(profileDir, 'Default', 'Cookies'))) {
    test.skip(true, [
      'Skipping signed-in live smoke because the prepared Chrome profile was not found.',
      'Run `npm run test:youtube-login`, sign in to YouTube web, and rerun this test.',
      `Expected profile: ${profileDir}`
    ].join(' '));
  }

  const extensionId = await getInstalledProfileExtensionId(profileDir);
  if (!extensionId) {
    test.skip(true, [
      'Skipping signed-in live smoke because Chat Enhancer is not installed in the signed-in Chrome profile.',
      'Run `npm run test:youtube-login`, open chrome://extensions in that window, enable Developer mode, click Load unpacked, choose:',
      extensionDir,
      'Then close Chrome and rerun this test.'
    ].join(' '));
  }

  const chrome = await launchNormalChromeExtensionContext({
    initialUrl: liveUrl,
    profileDir,
    testInfo
  });
  const { context } = chrome;

  try {
    const page = context.pages()[0] || await context.newPage();
    await primeYouTubeSession(page);
    const chat = await openLiveChat(page, liveUrl);
    if (!(await isChatComposerVisible(chat))) {
      const reason = await getUnavailableComposerReason(page, chat);
      console.log(reason);
      test.skip(true, reason);
    }

    await expectReadOnlyFeatures(context, page, chat, extensionId);
    await expect(chat.locator('yt-live-chat-message-input-renderer')).toBeVisible();
    await expect(chat.locator('.ytcq-composer-translate-button')).toBeVisible();

    await chat.locator('.ytcq-composer-translate-button').click();
    await expect(chat.locator('.ytcq-composer-translate-panel')).toBeVisible();
  } finally {
    await chrome.close();
  }
});
