/**
 * Browser scenario for conversation focus mode.
 *
 * The shared steps run against mock and real YouTube chat by opening focus from
 * an author click. The mock-only tail appends a deterministic new message from
 * that author so live runs do not depend on random chat timing.
 */
import { expect, test, type Locator } from '@playwright/test';
import { clearChatComposerIfVisible } from '../helpers/composer';
import { closeFocusPromptIfPresent } from '../helpers/focus-panel';
import {
  appendMockFixtureMessage,
  isMockPageSurface
} from '../helpers/mock-page';
import { cleanVisibleText } from '../helpers/text';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type ChatSurface
} from './types';

export const focusPanelScenario: BrowserScenario = async ({ chat }) => {
  const source = await findRecentMessageSource(chat);
  await openCollapsedFocusPrompt(chat, source);
  await expandFocusPanel(chat);
  await expectFocusPanelContainsSourceMessage(chat, source);
  await expectMockFocusPanelReceivesNewMessages(chat, source);
  await cleanUpFocusPanel(chat);
};

interface MessageSource {
  authorName: string;
  channelId: string;
  message: Locator;
  text: string;
}

async function findRecentMessageSource(chat: ChatSurface): Promise<MessageSource> {
  return test.step('Find a recent message with readable author and text', async () => {
    const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR);
    await messages.last().waitFor({ state: 'visible', timeout: 45_000 });

    const count = await messages.count();
    const firstCandidate = Math.max(0, count - 20);
    for (let index = count - 1; index >= firstCandidate; index -= 1) {
      const message = messages.nth(index);
      const authorName = cleanVisibleText(await message.locator('#author-name').first().innerText().catch(() => ''));
      const text = cleanVisibleText(await message.locator('#message').first().innerText().catch(() => ''));
      if (!authorName || !text) continue;

      const channelId = await message.evaluate((element) => {
        const data = (element as HTMLElement & {
          data?: { authorExternalChannelId?: string };
        }).data;
        return data?.authorExternalChannelId || '';
      }).catch(() => '');

      return {
        authorName,
        channelId,
        message,
        text
      };
    }

    throw new Error('Could not find a recent message with readable author and text.');
  });
}

async function openCollapsedFocusPrompt(chat: ChatSurface, source: MessageSource): Promise<void> {
  await test.step('Click author handle to open collapsed focus prompt', async () => {
    await source.message.locator('#author-name').first().click({ timeout: 2_000 }).catch(async () => {
      await source.message.locator('#author-name').first().dispatchEvent('click');
    });
    await expect(chat.locator('.ytcq-focus-card-collapsed')).toBeVisible({ timeout: 10_000 });
  });
}

async function expandFocusPanel(chat: ChatSurface): Promise<void> {
  await test.step('Expand focus panel from collapsed prompt', async () => {
    await chat.locator('.ytcq-focus-card-collapsed').click();
    await expect(chat.locator('.ytcq-focus-card-expanded')).toBeVisible({ timeout: 10_000 });
  });
}

async function expectFocusPanelContainsSourceMessage(chat: ChatSurface, source: MessageSource): Promise<void> {
  await test.step('Verify focus panel contains recent messages from the focused author', async () => {
    const panel = chat.locator('.ytcq-focus-card-expanded');
    await expect(panel.locator('.ytcq-focus-author')).toContainText(source.authorName);
    await expect(panel.locator('.ytcq-focus-message-them .ytcq-focus-bubble').filter({
      hasText: source.text
    }).first()).toBeVisible({ timeout: 10_000 });
  });
}

async function expectMockFocusPanelReceivesNewMessages(chat: ChatSurface, source: MessageSource): Promise<void> {
  if (!isMockPageSurface(chat)) return;

  await test.step('Mock-only: append a new focused-author message and verify it appears', async () => {
    const text = `Focus follow-up ${Date.now()}`;
    await appendMockFixtureMessage(chat, {
      author: source.authorName,
      channel: source.channelId || undefined,
      text
    });

    await expect(chat.locator('.ytcq-focus-card-expanded .ytcq-focus-message-them .ytcq-focus-bubble').filter({
      hasText: text
    }).first()).toBeVisible({ timeout: 10_000 });
  });
}

async function cleanUpFocusPanel(chat: ChatSurface): Promise<void> {
  await test.step('Close focus panel and clear composer if present', async () => {
    await closeFocusPromptIfPresent(chat);
    await clearChatComposerIfVisible(chat).catch(() => undefined);
  });
}
