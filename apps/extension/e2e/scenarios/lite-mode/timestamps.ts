/** Browser scenario for Lite mode timestamps behavior. */
import { expect, test } from '@playwright/test';
import { expectLiteModeMenuState, toggleLiteModeFromMenu } from './menu';
import { setExtensionStorageValues } from '../../support/extension-storage';
import type { BrowserScenario } from '../types';
import {
  getNativeTimestampsEnabled,
  hasVisibleLiteTimestampText,
  setNativeTimestampsEnabled,
  waitForLiteTimestampState
} from './real-youtube-timestamps';
import {
  clearLiteTestCooldown,
  expectStoredLiteMode
} from './assertions';
import {
  LITE_NATIVE_DISCARDED_ATTRIBUTE,
  LITE_ROOT_SELECTOR,
  NATIVE_LIST_SELECTOR
} from './selectors';

export const liteModeTimestampsScenario: BrowserScenario = async ({ chat, context }) => {
  test.setTimeout(120_000);
  const root = chat.locator(LITE_ROOT_SELECTOR);
  let originalTimestamps: boolean | null = null;
  let timestampEvidence: Record<string, unknown> | null = null;

  try {
    await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
    await expectStoredLiteMode(context, false);
    await clearLiteTestCooldown(chat);
    await chat
      .locator(NATIVE_LIST_SELECTOR)
      .first()
      .waitFor({ state: 'attached', timeout: 20_000 });

    await expectLiteModeMenuState(chat, false);

    await toggleLiteModeFromMenu(chat);
    await expectStoredLiteMode(context, true);
    await expect(root).toBeVisible({ timeout: 20_000 });
    await expect(chat.locator('html')).toHaveAttribute(LITE_NATIVE_DISCARDED_ATTRIBUTE, 'true', {
      timeout: 20_000
    });
    const liteTimestamp = root.locator('.ytcq-lite-message #timestamp').first();
    await liteTimestamp.waitFor({ state: 'attached', timeout: 20_000 });

    await test.step('Mirror YouTube’s real Timestamps toggle into Lite rows', async () => {
      originalTimestamps = await getNativeTimestampsEnabled(chat);
      const toggled = !originalTimestamps;
      await setNativeTimestampsEnabled(chat, toggled);
      const toggledMirrored = await waitForLiteTimestampState(root, toggled);
      const toggledTextVisible = toggled ? await hasVisibleLiteTimestampText(liteTimestamp) : true;

      await setNativeTimestampsEnabled(chat, originalTimestamps);
      const restoredMirrored = await waitForLiteTimestampState(root, originalTimestamps);
      const restoredTextVisible = originalTimestamps
        ? await hasVisibleLiteTimestampText(liteTimestamp)
        : true;
      timestampEvidence = {
        original: originalTimestamps,
        toggled,
        toggledMirrored,
        toggledTextVisible,
        restored: originalTimestamps,
        restoredMirrored,
        restoredTextVisible,
        liteDataset: await root.getAttribute('data-ytcq-show-timestamps'),
        liteDisplay: await liteTimestamp.evaluate((element) => getComputedStyle(element).display)
      };
      expect(toggledMirrored, 'Expected the changed native timestamp state to reach Lite.').toBe(
        true
      );
      expect(restoredMirrored, 'Expected restoring the native timestamp state to reach Lite.').toBe(
        true
      );
      expect(
        toggledTextVisible && restoredTextVisible,
        'Expected enabled Lite timestamps to contain visible clock text.'
      ).toBe(true);
    });
  } finally {
    if (originalTimestamps !== null) {
      await setNativeTimestampsEnabled(chat, originalTimestamps).catch(() => undefined);
    }
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
    await test
      .info()
      .attach('lite-timestamps-evidence', {
        body: JSON.stringify(timestampEvidence, null, 2),
        contentType: 'application/json'
      })
      .catch(() => undefined);
  }
};
