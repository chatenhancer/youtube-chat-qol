/**
 * Browser scenario for unsent chat draft recovery.
 *
 * The check writes local draft text into the composer, reloads the same stream
 * page, and verifies the content script restores the draft without sending it.
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { CHAT_INPUT_DRAFTS_STORAGE_KEY } from '../../../src/features/chat-drafts/storage';
import {
  clearChatComposer,
  getChatComposerInput,
  getChatComposerText,
  setChatComposerText
} from '../helpers/composer';
import {
  getExtensionStorageValues,
  withExtensionStorageSnapshot
} from '../helpers/extension-storage';
import type { BrowserScenario, ChatSurface } from './types';

const RECOVERED_DRAFT_TEXT = 'this draft should survive refresh';

export const chatDraftRecoveryScenario: BrowserScenario = async ({ chat, context }) => {
  const page = getReloadableStreamPage(chat, context);

  await withExtensionStorageSnapshot(context, 'local', async () => {
    await test.step('Type an unsent chat draft', async () => {
      await clearChatComposer(chat);
      await setChatComposerText(chat, RECOVERED_DRAFT_TEXT);
    });

    await test.step('Wait for the draft to be stored locally', async () => {
      await expect.poll(async () => {
        const stored = await getExtensionStorageValues(context, 'local', [CHAT_INPUT_DRAFTS_STORAGE_KEY]);
        return JSON.stringify(stored[CHAT_INPUT_DRAFTS_STORAGE_KEY] || {});
      }, {
        message: 'Expected the current stream draft to be saved before reload.',
        timeout: 5_000
      }).toContain(RECOVERED_DRAFT_TEXT);
    });

    await test.step('Reload the same stream page', async () => {
      await page.reload({ timeout: 60_000, waitUntil: 'domcontentloaded' });
    });

    await test.step('Verify the unsent draft is restored', async () => {
      await getChatComposerInput(chat).waitFor({ state: 'visible', timeout: 30_000 });
      await expect.poll(async () => getChatComposerText(chat), {
        message: 'Expected the unsent chat draft to be restored after refresh.',
        timeout: 10_000
      }).toBe(RECOVERED_DRAFT_TEXT);
    });

    await test.step('Clear restored draft', async () => {
      await clearChatComposer(chat);
    });
  });
};

function isPageSurface(chat: ChatSurface): chat is Page {
  return 'reload' in chat;
}

function getReloadableStreamPage(chat: ChatSurface, context: BrowserContext): Page {
  if (isPageSurface(chat)) return chat;

  const page = context.pages().find((candidate) => /youtube\.com\/watch/.test(candidate.url()));
  if (!page) {
    throw new Error('Could not find the YouTube watch page for draft recovery reload.');
  }

  return page;
}
