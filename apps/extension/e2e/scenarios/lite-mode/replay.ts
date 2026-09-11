/** Browser scenario for Lite mode replay behavior. */
import { expect, test } from '@playwright/test';
import { toggleLiteModeFromMenu } from './menu';
import { setExtensionStorageValues } from '../../support/extension-storage';
import { waitForYouTubeContentVideo } from '../../support/youtube-page';
import type { BrowserScenario } from '../types';
import { performRapidReplaySeeks } from './real-youtube-replay';
import {
  clearLiteTestCooldown,
  expectStoredLiteMode
} from './assertions';
import {
  LITE_ROOT_SELECTOR,
  NATIVE_LIST_SELECTOR
} from './selectors';

export const liteModeReplayRapidSeekScenario: BrowserScenario = async ({ chat, context, page }) => {
  test.setTimeout(180_000);
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let initialReplayTime: number | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteTestCooldown(chat);
    await chat
      .locator(NATIVE_LIST_SELECTOR)
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 });

    await toggleLiteModeFromMenu(chat);
    await expectStoredLiteMode(context, true);
    await expect(root).toHaveAttribute('data-ytcq-connection-state', 'connected', {
      timeout: 50_000
    });
    await root.locator('.ytcq-lite-message').last().waitFor({
      state: 'visible',
      timeout: 30_000
    });

    await waitForYouTubeContentVideo(page);
    const video = page.locator('video.html5-main-video').first();
    await expect(video).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).duration), {
        timeout: 45_000
      })
      .toBeGreaterThan(60);
    const duration = await video.evaluate((element) => (element as HTMLVideoElement).duration);
    initialReplayTime = await video.evaluate(
      (element) => (element as HTMLVideoElement).currentTime
    );
    const seekFractions = [0.72, 0.16, 0.84, 0.28, 0.63, 0.41];
    const finalTime = duration * seekFractions.at(-1)!;
    const seekTolerance = Math.max(10, duration * 0.01);
    await performRapidReplaySeeks({
      duration,
      finalTime,
      page,
      seekFractions,
      seekTolerance,
      video
    });
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), {
        timeout: 15_000
      })
      .toBeGreaterThan(finalTime - seekTolerance);
    await expect
      .poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime), {
        timeout: 15_000
      })
      .toBeLessThan(finalTime + seekTolerance);
    // The old race cleared the final response when a delayed progress signal
    // arrived just after it, so give that signal time to land before asserting.
    await page.waitForTimeout(1_500);
    await expect(root).toHaveAttribute('data-ytcq-connection-state', 'connected');
    await expect
      .poll(() => root.locator('.ytcq-lite-message').count(), {
        message: 'Expected Lite chat to stay populated at the final rapid replay seek position.',
        timeout: 30_000
      })
      .toBeGreaterThan(0);
    await expect(root.locator('.ytcq-lite-message').last()).toBeVisible();
  } finally {
    if (initialReplayTime !== null) {
      await page
        .locator('video.html5-main-video')
        .first()
        .evaluate((element, time) => {
          (element as HTMLVideoElement).currentTime = time;
        }, initialReplayTime)
        .catch(() => undefined);
    }
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false }).catch(
      () => undefined
    );
    await clearLiteTestCooldown(chat).catch(() => undefined);
  }
};
