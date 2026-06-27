/**
 * Browser scenarios for draft-writing message actions.
 *
 * These checks may write local draft text into the YouTube composer, but they
 * never press Enter or click the send button.
 */
import { expect, test, type Locator } from '@playwright/test';
import {
  clearChatComposer,
  getChatComposerText
} from '../support/composer';
import { closeFocusPromptIfPresent } from '../support/focus-panel';
import {
  centerLocatorInViewport,
  clickLocatorAtCurrentCenter
} from '../support/locator';
import { cleanVisibleText } from '../support/text';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type ChatSurface
} from './types';
import { openMessageMenu } from '../support/menu-openers';

const AUTHOR_TARGET_ATTRIBUTE = 'data-ytcq-test-author-target';
let nextAuthorTargetId = 1;

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
    await authorHandle.click({ timeout: 2_000 });
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
  const mentionAction = menu.locator('.ytcq-context-split-button[data-ytcq-action="mention"]').first();
  await test.step('Click injected Mention action', async () => {
    await clickVisibleActionAtCurrentCenter(mentionAction);
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
    const quoteAction = menu.locator('.ytcq-context-split-button[data-ytcq-action="quote"]').first();
    await clickVisibleActionAtCurrentCenter(quoteAction);
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

async function clickVisibleActionAtCurrentCenter(action: Locator): Promise<void> {
  await expect(action).toBeVisible({ timeout: 10_000 });
  if (await clickLocatorAtCurrentCenter(action)) return;
  await action.click({ timeout: 2_000 });
}

async function getLatestClickableAuthor(chat: ChatSurface): Promise<{
  authorHandle: Locator;
  authorName: string;
}> {
  const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR);
  await test.step('Wait for a clickable author name', async () => {
    await messages.last().waitFor({ state: 'visible', timeout: 45_000 });
  });

  const message = messages.nth(Math.max(0, await messages.count() - 1));
  const stableMessage = await freezeAuthorTarget(chat, message);
  const author = stableMessage.locator('#author-name').first();
  return test.step('Capture author name', async () => {
    await centerLocatorInViewport(stableMessage);
    const name = cleanVisibleText(await author.evaluate((element) => element.textContent || ''));
    expect(name).toMatch(/^@?\S/);
    return {
      authorHandle: author,
      authorName: name
    };
  });
}

async function freezeAuthorTarget(chat: ChatSurface, message: Locator): Promise<Locator> {
  const targetId = `author-click-${Date.now()}-${nextAuthorTargetId++}`;
  const didFreeze = await message.evaluate((element, { attribute, value }) => {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    element.setAttribute(attribute, value);
    return true;
  }, {
    attribute: AUTHOR_TARGET_ATTRIBUTE,
    value: targetId
  }).catch(() => false);

  if (!didFreeze) throw new Error('Could not stabilize the live chat author target before clicking it.');
  return chat.locator(`[${AUTHOR_TARGET_ATTRIBUTE}="${targetId}"]`).first();
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
