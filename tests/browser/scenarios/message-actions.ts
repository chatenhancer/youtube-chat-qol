/**
 * Browser scenarios for draft-writing message actions.
 *
 * These checks may write local draft text into the YouTube composer, but they
 * never press Enter or click the send button.
 */
import { expect, test, type ElementHandle } from '@playwright/test';
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

export const authorMentionDraftScenario: BrowserScenario = async ({ chat }) => {
  await expectAuthorClickInsertsMentionDraft(chat);
};

export const authorQuoteDraftScenario: BrowserScenario = async ({ chat }) => {
  await expectAuthorAltClickInsertsQuoteDraft(chat);
};

export const mentionMenuDraftScenario: BrowserScenario = async ({ chat }) => {
  await expectMentionMenuActionInsertsDraft(chat);
};

export const quoteMenuDraftScenario: BrowserScenario = async ({ chat }) => {
  await expectQuoteMenuActionInsertsDraft(chat);
};

async function expectAuthorClickInsertsMentionDraft(chat: ChatSurface): Promise<void> {
  await clearComposerForAction(chat, 'Clear composer before author click');

  const { authorHandle, authorName } = await getLatestClickableAuthor(chat);

  await test.step('Click author name', async () => {
    await authorHandle.click({ timeout: 2_000 }).catch(async () => {
      await authorHandle.dispatchEvent('click');
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

async function expectAuthorAltClickInsertsQuoteDraft(chat: ChatSurface): Promise<void> {
  await clearComposerForAction(chat, 'Clear composer before author Alt-click');

  const { authorHandle, authorName } = await getLatestClickableAuthor(chat);

  await test.step('Alt-click author name', async () => {
    await authorHandle.click({
      modifiers: ['Alt'],
      timeout: 2_000
    }).catch(async () => {
      await authorHandle.dispatchEvent('click', {
        altKey: true,
        bubbles: true,
        cancelable: true
      });
    });
  });

  await test.step('Verify composer contains quote draft', async () => {
    await expect.poll(async () => getChatComposerText(chat), {
      message: 'Alt-clicking an author should write a quote draft without sending it.',
      timeout: 10_000
    }).toContain(`${authorName} : "`);
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

async function getLatestClickableAuthor(chat: ChatSurface): Promise<{
  authorHandle: ElementHandle<HTMLElement | SVGElement>;
  authorName: string;
}> {
  const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR);
  await test.step('Wait for a clickable author name', async () => {
    await messages.last().waitFor({ state: 'visible', timeout: 45_000 });
  });

  const message = messages.nth(Math.max(0, await messages.count() - 1));
  const author = message.locator('#author-name').first();
  return test.step('Capture author name', async () => {
    const handle = await author.elementHandle();
    if (!handle) throw new Error('Could not resolve clickable author element.');
    const name = cleanVisibleText(await handle.evaluate((element) => element.textContent || ''));
    expect(name).toMatch(/^@?\S/);
    return {
      authorHandle: handle,
      authorName: name
    };
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
