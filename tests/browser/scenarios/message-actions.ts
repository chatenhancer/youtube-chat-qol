/**
 * Browser scenarios for draft-writing message actions.
 *
 * These checks may write local draft text into the YouTube composer, but they
 * never press Enter or click the send button.
 */
import { expect, test } from '@playwright/test';
import {
  clearChatComposer,
  getChatComposerText
} from '../helpers/composer';
import { closeFocusPromptIfPresent } from '../helpers/focus-panel';
import { cleanVisibleText } from '../helpers/text';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type ChatSurface
} from './types';
import { openMessageMenu } from './menu-openers';

export const authorMentionDraftScenario: BrowserScenario = {
  name: 'Author click writes a mention draft only',
  run: async ({ chat }) => {
    await expectAuthorClickInsertsMentionDraft(chat);
  }
};

export const mentionMenuDraftScenario: BrowserScenario = {
  name: 'Mention menu action writes a draft only',
  run: async ({ chat }) => {
    await expectMentionMenuActionInsertsDraft(chat);
  }
};

export const quoteMenuDraftScenario: BrowserScenario = {
  name: 'Quote menu action writes a draft only',
  run: async ({ chat }) => {
    await expectQuoteMenuActionInsertsDraft(chat);
  }
};

async function expectAuthorClickInsertsMentionDraft(chat: ChatSurface): Promise<void> {
  await clearComposerForAction(chat, 'Clear composer before author click');

  const message = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).last();
  await test.step('Wait for a clickable author name', async () => {
    await message.waitFor({ state: 'visible', timeout: 45_000 });
  });

  const author = message.locator('#author-name').first();
  const authorName = await test.step('Capture author name', async () => {
    const name = cleanVisibleText(await author.innerText());
    expect(name).toMatch(/^@?\S/);
    return name;
  });

  await test.step('Click author name', async () => {
    await author.click({ timeout: 2_000 }).catch(async () => {
      await author.dispatchEvent('click');
    });
  });

  await test.step('Verify composer contains mention draft', async () => {
    await expect.poll(async () => cleanVisibleText(await getChatComposerText(chat)), {
      message: 'Author click should write a mention draft without sending it.',
      timeout: 10_000
    }).toBe(authorName);
  });

  await expectCollapsedFocusPrompt(chat);
  await cleanUpFocusPromptAndComposer(chat);
}

async function expectMentionMenuActionInsertsDraft(chat: ChatSurface): Promise<void> {
  await clearComposerForAction(chat, 'Clear composer before Mention action');

  const { menu, authorName } = await openMessageMenu(chat);
  const mentionAction = menu.locator('.ytcq-context-item[data-ytcq-action="mention"]').first();
  await test.step('Click injected Mention action', async () => {
    await expect(mentionAction).toBeVisible({ timeout: 10_000 });
    await mentionAction.click({ force: true });
  });

  await test.step('Verify composer contains mention draft', async () => {
    await expect.poll(async () => cleanVisibleText(await getChatComposerText(chat)), {
      message: 'Mention action should write a draft without sending it.',
      timeout: 10_000
    }).toBe(authorName);
  });

  await expectCollapsedFocusPrompt(chat);
  await cleanUpFocusPromptAndComposer(chat);
}

async function expectQuoteMenuActionInsertsDraft(chat: ChatSurface): Promise<void> {
  await clearComposerForAction(chat, 'Clear composer before Quote action');

  const { menu, authorName } = await openMessageMenu(chat);

  await test.step('Click injected Quote action', async () => {
    await menu.locator('.ytcq-context-item[data-ytcq-action="quote"]').first().click({ force: true });
  });

  await test.step('Verify composer contains quote draft', async () => {
    await expect.poll(async () => getChatComposerText(chat), {
      message: 'Quote action should write a draft without sending it.',
      timeout: 10_000
    }).toContain(`${authorName} : "`);
  });

  await expectCollapsedFocusPrompt(chat);

  await cleanUpFocusPromptAndComposer(chat);
}

async function clearComposerForAction(chat: ChatSurface, stepName: string): Promise<void> {
  await test.step(stepName, async () => {
    await clearChatComposer(chat);
  });
}

async function expectCollapsedFocusPrompt(chat: ChatSurface): Promise<void> {
  await test.step('Verify collapsed focus prompt appears', async () => {
    await expect(chat.locator('.ytcq-focus-card-collapsed')).toBeVisible({ timeout: 10_000 });
  });
}

async function cleanUpFocusPromptAndComposer(chat: ChatSurface): Promise<void> {
  await test.step('Clean up focus prompt and composer', async () => {
    await closeFocusPromptIfPresent(chat);
    await clearChatComposer(chat);
  });
}
