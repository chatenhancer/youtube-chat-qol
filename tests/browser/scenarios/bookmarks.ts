/**
 * Browser scenario for saving chat message bookmarks.
 *
 * Covers Save in YouTube's message menu, the rich message row in the popup,
 * and removing the bookmark again.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { BOOKMARKS_STORAGE_KEY } from '../../../src/shared/bookmarks';
import { getExtensionId } from '../support/extension';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { openMessageMenu, type OpenedMessageMenu } from '../support/menu-openers';
import { isMockPageSurface } from '../support/mock-page';
import type { BrowserScenario } from './types';

interface StoredBookmarkRecord {
  authorName?: string;
  message?: {
    messageId?: string;
    text?: string;
    timestamp?: number;
    timestampText?: string;
  } | null;
  savedAt?: number;
  sourceTitle?: string;
  sourceUrl?: string;
}

export const bookmarkMessageMenuScenario: BrowserScenario = async ({ chat, context }) => {
  await withExtensionStorageValues(
    context,
    'local',
    {
      [BOOKMARKS_STORAGE_KEY]: {}
    },
    async () => {
      await expectBookmarkCount(context, 0);

      const source = await saveBookmarkFromMessageMenu(chat);
      await expectBookmarkStored(context, source.authorName);
      await expectBookmarkMenuClosed(source.menu);
      await expectBookmarkIconShowsAddedTime(chat, source);
      await expectBookmarkListedInPopupAndRemove(context, source.authorName);
      await expectBookmarkCount(context, 0);
    }
  );
};

async function expectBookmarkIconShowsAddedTime(
  chat: Parameters<BrowserScenario>[0]['chat'],
  source: OpenedMessageMenu
): Promise<void> {
  if (!isMockPageSurface(chat)) return;

  await test.step('Show when the bookmark was added on its saved row icon', async () => {
    await source.message.locator('#author-photo').first().click();
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard).toBeVisible();

    const bookmarkAction = profileCard
      .locator('.ytcq-profile-card-message-origin .ytcq-bookmark-toggle')
      .first();
    await expect(bookmarkAction).toHaveAttribute('aria-pressed', 'true');
    await expect(bookmarkAction).toHaveAttribute(
      'title',
      /Remove saved message\nBookmark added .+/
    );

    await profileCard.locator('.ytcq-profile-card-close').click();
    await expect(profileCard).toHaveCount(0);
  });
}

async function saveBookmarkFromMessageMenu(
  chat: Parameters<BrowserScenario>[0]['chat']
): Promise<OpenedMessageMenu> {
  const source = await openMessageMenu(chat);

  await test.step('Click Save in the message context menu', async () => {
    const saveAction = source.menu
      .locator('.ytcq-context-item[data-ytcq-action="save-message"]')
      .first();
    const saveItem = saveAction.locator('.ytcq-paper-item');
    await expect(saveItem.locator('.ytcq-menu-label')).toHaveText('Save');
    await expect(saveAction).toBeVisible();
    await saveItem.press('Enter');
  });

  return source;
}

async function expectBookmarkMenuClosed(menu: Locator): Promise<void> {
  await test.step('Verify the message context menu closes after saving', async () => {
    await expect(menu).toBeHidden({ timeout: 5_000 });
  });
}

async function expectBookmarkStored(context: BrowserContext, authorName: string): Promise<void> {
  await test.step('Verify the message bookmark is saved with its author and stream', async () => {
    await expect
      .poll(
        async () => {
          const records = await getStoredBookmarks(context);
          return records.some((record) => {
            return (
              record.authorName === authorName &&
              Boolean(record.message?.messageId && record.message.text) &&
              Number.isFinite(record.message?.timestamp) &&
              Boolean(record.message?.timestampText) &&
              Number.isFinite(record.savedAt) &&
              Boolean(record.sourceTitle || record.sourceUrl)
            );
          });
        },
        {
          message:
            'Bookmark should include the message, author, posted time, save time, and stream context.',
          timeout: 10_000
        }
      )
      .toBe(true);
  });
}

async function expectBookmarkCount(context: BrowserContext, count: number): Promise<void> {
  await test.step(`Verify bookmark storage contains ${count} record${count === 1 ? '' : 's'}`, async () => {
    await expect
      .poll(async () => (await getStoredBookmarks(context)).length, {
        timeout: 10_000
      })
      .toBe(count);
  });
}

async function expectBookmarkListedInPopupAndRemove(
  context: BrowserContext,
  authorName: string
): Promise<void> {
  await test.step('Open popup Bookmarks and remove the saved message', async () => {
    const initialPopup = await openExtensionPopup(context);
    await initialPopup.locator('#bookmarksTab').click();
    await expect(initialPopup.locator('#bookmarksTab')).toHaveAttribute('aria-selected', 'true');
    await initialPopup.close();

    const popup = await openExtensionPopup(context);

    try {
      await expect(popup.locator('#bookmarksTab')).toHaveAttribute('aria-selected', 'true');
      const row = popup.locator('.bookmark-row').filter({ hasText: authorName }).first();
      await expect(row).toBeVisible({ timeout: 10_000 });
      await expect(row.locator('.bookmark-message')).not.toHaveText('');
      const postedTime = row.locator('.bookmark-message-header .bookmark-message-time');
      await expect(postedTime).toBeVisible();
      await expect(postedTime).not.toHaveText('');
      await expect(postedTime).toHaveAttribute('title', /Message posted .+/);
      await expect(row.locator('.bookmark-metadata .bookmark-source')).not.toHaveText('');

      const action = row.locator('.bookmark-action-button').first();
      await expect(action).toHaveAttribute('aria-label', 'Remove bookmark');
      await action.click();
      await expect(row).toHaveClass(/bookmark-row-removed/);
      await expect(action).toHaveAttribute('aria-label', 'Restore bookmark');
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

async function getStoredBookmarks(context: BrowserContext): Promise<StoredBookmarkRecord[]> {
  const values = await getExtensionStorageValues(context, 'local', [BOOKMARKS_STORAGE_KEY]);
  const stored = values[BOOKMARKS_STORAGE_KEY];
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];

  return Object.values(stored).filter((record): record is StoredBookmarkRecord => {
    return Boolean(record && typeof record === 'object');
  });
}
