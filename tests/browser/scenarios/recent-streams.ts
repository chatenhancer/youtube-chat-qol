/**
 * Browser scenario for recent stream recording.
 *
 * The content script records the current stream after attachment, and the
 * extension popup exposes that local list in the Recent chats tab.
 */
import { expect, test, type BrowserContext } from '@playwright/test';
import {
  RECENT_STREAMS_STORAGE_KEY,
  type StoredRecentStreams
} from '../../../src/shared/recent-streams';
import { getExtensionId } from '../support/extension';
import { getExtensionStorageValues } from '../support/extension-storage';
import type { BrowserScenario } from './types';

export const recentStreamsPopupScenario: BrowserScenario = async ({ context }) => {
  await test.step('Wait for current stream to be recorded locally', async () => {
    await expect.poll(async () => {
      const records = await getStoredRecentStreams(context);
      return Object.values(records).filter(isCanonicalWatchRecord).length;
    }, {
      timeout: 15_000
    }).toBeGreaterThan(0);
  });

  await test.step('Open Recent chats tab in extension popup', async () => {
    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();

    try {
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await popup.locator('#streamsTab').click();
      await expect(popup.locator('.stream-row').first()).toBeVisible();
      await expect(popup.locator('#streamsCount')).toContainText(/chat/i);
      await expect(popup.locator('.stream-title-label').first()).not.toHaveText('');
      await expect(popup.locator('.stream-title-button').first()).toBeVisible();
      await expect(popup.locator('.stream-thumbnail-button img').first()).toBeVisible();
      await expect(popup.locator('.stream-online-dot').first()).toBeVisible();
      await expect(popup.locator('.stream-meta').first()).toContainText(/active now/i);
      await expect(popup.locator('.stream-action-button').first()).toBeVisible();
    } finally {
      await popup.close().catch(() => undefined);
    }
  });
};

async function getStoredRecentStreams(context: BrowserContext): Promise<StoredRecentStreams> {
  const stored = await getExtensionStorageValues(context, 'local', [RECENT_STREAMS_STORAGE_KEY]);
  const records = stored[RECENT_STREAMS_STORAGE_KEY];
  return records && typeof records === 'object' && !Array.isArray(records)
    ? records as StoredRecentStreams
    : {};
}

function isCanonicalWatchRecord(record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  const url = (record as { url?: unknown }).url;
  return typeof url === 'string' && url.startsWith('https://www.youtube.com/watch?v=');
}
