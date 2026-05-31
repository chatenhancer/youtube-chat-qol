/**
 * Browser scenario for the frequent emoji row.
 *
 * Uses a stable built-in Unicode emoji so the mock suite can prove persistence
 * after reload while the live suite can run a shorter picker-wiring smoke.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  clearChatComposer,
  getChatComposerText
} from '../helpers/composer';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../helpers/extension-storage';
import type { BrowserScenario, ChatSurface } from './types';

const EMOJI_USAGE_STORAGE_KEY = 'ytcqEmojiUsage';
const TEST_EMOJI = '✅';

export const frequentEmojiPersistenceScenario: BrowserScenario = async ({ chat, extensionContext }) => {
  await expectFrequentEmojiBehavior({ chat, context: extensionContext, verifyPersistenceAfterReload: true });
};

export const frequentEmojiSmokeScenario: BrowserScenario = async ({ chat, extensionContext }) => {
  await expectFrequentEmojiBehavior({ chat, context: extensionContext, verifyPersistenceAfterReload: false });
};

async function expectFrequentEmojiBehavior({
  chat,
  context,
  verifyPersistenceAfterReload
}: {
  chat: ChatSurface;
  context: BrowserContext;
  verifyPersistenceAfterReload: boolean;
}): Promise<void> {
  await withExtensionStorageValues(context, 'local', {
    [EMOJI_USAGE_STORAGE_KEY]: []
  }, async () => {
    await reloadChatSurface({ chat, context });
    await clickNativeEmojiOption(chat);
    await expectEmojiUsageCount(chat, 1);
    await expectFrequentEmojiRow(chat);
    if (verifyPersistenceAfterReload) {
      await reloadChatSurface({ chat, context });
      await expectFrequentEmojiRow(chat);
    }
    await clickFrequentEmojiAndExpectComposerInsertion(chat);
    await expectEmojiUsageCount(chat, 2);
  });
}

async function reloadChatSurface({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await test.step('Reload chat page', async () => {
    const page = getReloadablePage(chat, context);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 20_000 });
  });
}

async function clickNativeEmojiOption(chat: ChatSurface): Promise<void> {
  await test.step('Click native emoji picker option', async () => {
    await openEmojiPicker(chat);
    await getNativeEmojiOption(chat).click();
  });
}

async function expectFrequentEmojiRow(chat: ChatSurface): Promise<void> {
  await test.step('Verify most-used row contains the emoji', async () => {
    await openEmojiPicker(chat);
    const row = chat.locator('.ytcq-frequent-emoji-row');
    await expect(row).toBeVisible({ timeout: 5_000 });
    await expect(getFrequentEmojiButton(chat)).toBeVisible();
  });
}

async function clickFrequentEmojiAndExpectComposerInsertion(chat: ChatSurface): Promise<void> {
  await test.step('Click frequent emoji and verify composer insertion', async () => {
    await clearChatComposer(chat);
    await openEmojiPicker(chat);
    await getFrequentEmojiButton(chat).click();
    await expect.poll(async () => getChatComposerText(chat), {
      message: 'Frequent emoji button should insert the emoji into the composer.',
      timeout: 5_000
    }).toContain(TEST_EMOJI);
  });
}

async function expectEmojiUsageCount(chat: ChatSurface, expectedCount: number): Promise<void> {
  await test.step(`Verify persisted emoji usage count is ${expectedCount}`, async () => {
    await expect.poll(async () => {
      const values = await getExtensionStorageValues(getContext(chat), 'local', [EMOJI_USAGE_STORAGE_KEY]);
      const usage = values[EMOJI_USAGE_STORAGE_KEY];
      if (!Array.isArray(usage)) return 0;
      const record = usage.find((item) => {
        return item &&
          typeof item === 'object' &&
          (
            ('text' in item && item.text === TEST_EMOJI) ||
            ('alt' in item && item.alt === TEST_EMOJI) ||
            ('label' in item && item.label === TEST_EMOJI)
          );
      }) as { count?: unknown } | undefined;
      return Number(record?.count || 0);
    }, {
      timeout: 5_000
    }).toBe(expectedCount);
  });
}

async function openEmojiPicker(chat: ChatSurface): Promise<void> {
  const picker = chat.locator('yt-emoji-picker-renderer').first();
  if (await picker.isVisible({ timeout: 300 }).catch(() => false)) return;

  await chat.locator('#emoji-picker-button #emoji button, #emoji button').first().click();
  await expect(picker).toBeVisible({ timeout: 5_000 });
}

function getNativeEmojiOption(chat: ChatSurface) {
  return chat.locator(`yt-emoji-picker-renderer [role="option"][alt="${TEST_EMOJI}"], yt-emoji-picker-renderer [role="option"][id="${TEST_EMOJI}"]`).or(
    chat.locator('yt-emoji-picker-renderer [role="option"]').filter({
      has: chat.locator(`img[alt="${TEST_EMOJI}"]`)
    })
  ).or(
    chat.locator('yt-emoji-picker-renderer [role="option"]').filter({ hasText: TEST_EMOJI })
  ).first();
}

function getFrequentEmojiButton(chat: ChatSurface) {
  return chat.locator('.ytcq-frequent-emoji-button').filter({
    has: chat.locator(`img[alt="${TEST_EMOJI}"]`)
  }).or(
    chat.locator('.ytcq-frequent-emoji-button').filter({ hasText: TEST_EMOJI })
  ).first();
}

function getReloadablePage(chat: ChatSurface, context: BrowserContext): Page {
  if (isPageSurface(chat)) return chat;

  const ownerPage = chat.owner().page();
  if (/youtube\.com\/watch/.test(ownerPage.url())) return ownerPage;

  const youtubePage = context.pages().find((page) => /youtube\.com\/watch/.test(page.url()));
  if (!youtubePage) {
    throw new Error('Could not find the YouTube watch page to reload for frequent emoji persistence.');
  }

  return youtubePage;
}

function getContext(chat: ChatSurface): BrowserContext {
  if (isPageSurface(chat)) return chat.context();
  return chat.owner().page().context();
}

function isPageSurface(chat: ChatSurface): chat is Page {
  return 'reload' in chat;
}
