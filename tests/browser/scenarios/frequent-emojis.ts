/**
 * Browser scenario for the frequent emoji row.
 *
 * Uses a stable built-in Unicode emoji and verifies storage, row rendering,
 * persistence after reload, and composer insertion.
 */
import { expect, test, type BrowserContext, type FrameLocator, type Page } from '@playwright/test';
import {
  clearChatComposer,
  getChatComposerText
} from '../support/composer';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import type { BrowserScenario, ChatSurface } from './types';

const EMOJI_USAGE_STORAGE_KEY = 'ytcqEmojiUsage';
const EMOJI_PICKER_BUTTON_SELECTOR = '#emoji-picker-button yt-live-chat-icon-toggle-button-renderer#emoji button';
const TEST_EMOJI = '✅';
const CHAT_RELOAD_COMMIT_TIMEOUT_MS = 15_000;
const CHAT_READY_TIMEOUT_MS = 60_000;

export const frequentEmojiPersistenceScenario: BrowserScenario = async ({ chat, context }) => {
  await expectFrequentEmojiBehavior({ chat, context });
};

async function expectFrequentEmojiBehavior({
  chat,
  context
}: {
  chat: ChatSurface;
  context: BrowserContext;
}): Promise<void> {
  await withExtensionStorageValues(context, 'local', {
    [EMOJI_USAGE_STORAGE_KEY]: []
  }, async () => {
    await reloadChatSurface(chat);
    await clickNativeEmojiOption(chat);
    await expectEmojiUsageCount(context, 1);
    await expectFrequentEmojiRow(chat);
    await reloadChatSurface(chat);
    await expectFrequentEmojiRow(chat);
    await clickFrequentEmojiAndExpectComposerInsertion(chat);
    await expectEmojiUsageCount(context, 2);
  });
}

async function reloadChatSurface(chat: ChatSurface): Promise<void> {
  await test.step('Reload chat surface', async () => {
    if (isPageSurface(chat)) {
      await chat.reload({ timeout: CHAT_RELOAD_COMMIT_TIMEOUT_MS, waitUntil: 'commit' });
    } else {
      await reloadChatFrame(chat);
      await expect(chat.owner()).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });
    }

    await expect(chat.locator('yt-live-chat-renderer')).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });
    await expect(getEmojiPickerButton(chat)).toBeVisible({ timeout: CHAT_READY_TIMEOUT_MS });
  });
}

async function reloadChatFrame(chat: FrameLocator): Promise<void> {
  const frameOwner = chat.owner();
  await frameOwner.waitFor({ state: 'attached', timeout: CHAT_READY_TIMEOUT_MS });

  const frameElement = await frameOwner.elementHandle();
  const frame = await frameElement?.contentFrame();
  const frameUrl = frame?.url();

  if (!frame || !frameUrl || frameUrl === 'about:blank') {
    const pageUrl = frameOwner.page().url();
    throw new Error(`Could not find a reloadable YouTube chat frame on ${pageUrl}.`);
  }

  await frame.goto(frameUrl, { timeout: CHAT_RELOAD_COMMIT_TIMEOUT_MS, waitUntil: 'commit' });
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

async function expectEmojiUsageCount(context: BrowserContext, expectedCount: number): Promise<void> {
  await test.step(`Verify persisted emoji usage count is ${expectedCount}`, async () => {
    await expect.poll(async () => {
      const values = await getExtensionStorageValues(context, 'local', [EMOJI_USAGE_STORAGE_KEY]);
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

  await getEmojiPickerButton(chat).click();
  await expect(picker).toBeVisible({ timeout: 5_000 });
}

function getEmojiPickerButton(chat: ChatSurface) {
  return chat.locator(EMOJI_PICKER_BUTTON_SELECTOR).first();
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

function isPageSurface(chat: ChatSurface): chat is Page {
  return 'reload' in chat;
}
