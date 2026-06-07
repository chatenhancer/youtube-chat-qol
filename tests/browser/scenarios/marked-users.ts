/**
 * Browser scenario for bookmarking chat users.
 *
 * This covers the user-visible path: Mark from YouTube's message context menu,
 * see the avatar ring, find the user in the extension popup, then remove the bookmark
 * from the popup and verify the ring is removed.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { getExtensionId } from '../support/extension';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { openMessageMenu, type OpenedMessageMenu } from '../support/menu-openers';
import type { BrowserScenario } from './types';

const MARKED_USERS_STORAGE_KEY = 'ytcqMarkedUsers';

interface StoredMarkedUserRecord {
  authorName?: string;
  channelId?: string;
  markedAt?: number;
  markedSourceTitle?: string;
  markedSourceUrl?: string;
}

export const markedUserMessageMenuScenario: BrowserScenario = async ({ chat, context }) => {
  await withExtensionStorageValues(context, 'local', {
    [MARKED_USERS_STORAGE_KEY]: {}
  }, async () => {
    await expectMarkedUserStorageCount(context, 0);

    const source = await markUserFromMessageMenu(chat);
    await expectBookmarkedUserStored(context, source.authorName);
    await expectMarkedUserRingVisible(source.message);
    await expectMarkedUserListedInPopupAndUnmark(context, source.authorName);
    await expectMarkedUserStorageCount(context, 0);
    await expectMarkedUserRingRemoved(source.message);
  });
};

async function markUserFromMessageMenu(chat: Parameters<BrowserScenario>[0]['chat']): Promise<OpenedMessageMenu> {
  const source = await openMessageMenu(chat);

  await test.step('Click Mark in the message context menu', async () => {
    const markAction = source.menu.locator('.ytcq-context-item[data-ytcq-action="mark-user"]').first();
    await expect(markAction.locator('.ytcq-menu-label')).toHaveText('Mark');
    await markAction.click();
    await expect(source.menu).toBeHidden({ timeout: 5_000 });
  });

  return source;
}

async function expectBookmarkedUserStored(context: BrowserContext, authorName: string): Promise<void> {
  await test.step('Verify bookmarked user is saved in extension storage', async () => {
    await expect.poll(async () => {
      const records = await getStoredMarkedUserRecords(context);
      return records.some((record) => {
        return record.authorName === authorName &&
          Number.isFinite(record.markedAt) &&
          Boolean(record.markedSourceTitle || record.markedSourceUrl);
      });
    }, {
      message: 'Bookmarked user should be stored with author and stream context.',
      timeout: 10_000
    }).toBe(true);
  });
}

async function expectMarkedUserStorageCount(context: BrowserContext, count: number): Promise<void> {
  await test.step(`Verify marked user storage contains ${count} record${count === 1 ? '' : 's'}`, async () => {
    await expect.poll(async () => (await getStoredMarkedUserRecords(context)).length, {
      timeout: 10_000
    }).toBe(count);
  });
}

async function expectMarkedUserRingVisible(message: Locator): Promise<void> {
  await test.step('Verify marked user avatar ring appears in chat', async () => {
    const avatar = message.locator('#author-photo').first();
    await expect(avatar).toHaveClass(/ytcq-marked-user-avatar/, { timeout: 10_000 });
    await expect(avatar).toHaveAttribute('data-ytcq-marked-user-key', /^(author|channel):/);
  });
}

async function expectMarkedUserRingRemoved(message: Locator): Promise<void> {
  await test.step('Verify marked user avatar ring is removed from chat', async () => {
    const avatar = message.locator('#author-photo').first();
    await expect(avatar).not.toHaveClass(/ytcq-marked-user-avatar/, { timeout: 10_000 });
  });
}

async function expectMarkedUserListedInPopupAndUnmark(context: BrowserContext, authorName: string): Promise<void> {
  await test.step('Open popup Bookmarks tab and remove the bookmark', async () => {
    const popup = await openExtensionPopup(context);

    try {
      await popup.locator('#bookmarksTab').click();
      const row = popup.locator('.bookmark-row').filter({ hasText: authorName }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row.locator('.bookmark-date')).toBeVisible();
      await expect(row.locator('.bookmark-source')).not.toHaveText('');

      const action = row.locator('.bookmark-action-button').first();
      await expect(action).toHaveAttribute('aria-label', 'Remove bookmark');
      await action.click();
      await expect(row).toHaveClass(/bookmark-row-unmarked/);
      await expect(action).toHaveAttribute('aria-label', 'Bookmark');
    } finally {
      await popup.close().catch(() => undefined);
    }
  });
}

async function openExtensionPopup(context: BrowserContext): Promise<Page> {
  const extensionId = await getExtensionId(context);
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.locator('#bookmarksTab')).toBeVisible({ timeout: 10_000 });
  return popup;
}

async function getStoredMarkedUserRecords(context: BrowserContext): Promise<StoredMarkedUserRecord[]> {
  const values = await getExtensionStorageValues(context, 'local', [MARKED_USERS_STORAGE_KEY]);
  const stored = values[MARKED_USERS_STORAGE_KEY];
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];

  return Object.values(stored)
    .filter((record): record is StoredMarkedUserRecord => {
      return Boolean(record && typeof record === 'object');
    });
}
