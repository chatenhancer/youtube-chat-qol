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
  getChatComposerText
} from '../support/composer';
import {
  getExtensionStorageValues,
  withExtensionStorageSnapshot
} from '../support/extension-storage';
import type { BrowserScenario, ChatSurface } from './types';

const RECOVERED_DRAFT_TEXT = 'this draft should survive refresh :draft-emoji:';
const RECOVERED_DRAFT_EMOJI_ALT = ':draft-emoji:';

export const chatDraftRecoveryScenario: BrowserScenario = async ({ chat, context }) => {
  const page = getReloadableStreamPage(chat, context);

  await withExtensionStorageSnapshot(context, 'local', async () => {
    await test.step('Type an unsent chat draft', async () => {
      await clearChatComposer(chat);
      await setChatComposerRichDraft(chat);
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
      await expect(getChatComposerInput(chat).locator(`img[alt="${RECOVERED_DRAFT_EMOJI_ALT}"]`)).toHaveCount(1);
    });

    await test.step('Clear restored draft', async () => {
      await clearChatComposer(chat);
    });
  });
};

async function setChatComposerRichDraft(chat: ChatSurface): Promise<void> {
  const input = getChatComposerInput(chat);
  await input.waitFor({ state: 'visible', timeout: 10_000 });
  await input.evaluate((element, emojiAlt) => {
    element.focus();

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = `this draft should survive refresh ${emojiAlt}`;
      element.setSelectionRange(element.value.length, element.value.length);
    } else {
      const emoji = document.createElement('img');
      emoji.className = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
      emoji.src = 'https://example.test/draft-emoji.png';
      emoji.alt = emojiAlt;
      emoji.id = 'draft-emoji-id';
      emoji.setAttribute('data-emoji-id', 'draft-emoji-id');
      emoji.setAttribute('shared-tooltip-text', emojiAlt);
      element.replaceChildren(
        document.createTextNode('this draft should survive refresh '),
        emoji
      );
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: emojiAlt,
      inputType: 'insertText'
    }));
  }, RECOVERED_DRAFT_EMOJI_ALT);
}

function isPageSurface(chat: ChatSurface): chat is Page {
  return 'reload' in chat;
}

function getReloadableStreamPage(chat: ChatSurface, context: BrowserContext): Page {
  if (isPageSurface(chat)) return chat;

  const ownerPage = chat.owner().page();
  if (isReloadableYouTubeStreamPage(ownerPage)) return ownerPage;

  const page = context.pages().find((candidate) => {
    return isReloadableYouTubeStreamPage(candidate) ||
      candidate.frames().some((frame) => frame.url().includes('youtube.com/live_chat'));
  });
  if (!page) {
    throw new Error('Could not find the YouTube stream page for draft recovery reload.');
  }

  return page;
}

function isReloadableYouTubeStreamPage(page: Page): boolean {
  const url = page.url();
  if (!/youtube\.com/.test(url)) return false;

  return /\/watch(?:\?|$)/.test(url) ||
    /\/@[^/]+\/live(?:[/?#]|$)/.test(url);
}
