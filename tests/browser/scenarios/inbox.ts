/**
 * Browser scenario for the chat-header Inbox panel.
 *
 * The same check runs in logged-out and logged-in contexts because the Inbox
 * should be available whenever the extension is attached to YouTube live chat.
 */
import { expect, test } from '@playwright/test';
import {
  withExtensionStorageSnapshot,
  withExtensionStorageValues
} from '../helpers/extension-storage';
import {
  appendMockFixtureMessage,
  isMockPageSurface
} from '../helpers/mock-page';
import type { BrowserScenario, ChatSurface } from './types';

const INBOX_KEYWORD = 'browser-inbox-keyword';
const CURRENT_VIEWER_MENTION = '@CurrentViewer';
const DIRECT_MENTION_TEXT = `Direct browser mention for ${CURRENT_VIEWER_MENTION}`;

export const inboxScenario: BrowserScenario = async ({ chat }) => {
  await expectInboxButtonAttached(chat);
  await openInboxPanel(chat);
  await closeInboxPanel(chat);
};

export const inboxRecordCreationAndJumpScenario: BrowserScenario = async ({ chat, context }) => {
  if (!isMockPageSurface(chat)) {
    throw new Error('inboxRecordCreationAndJumpScenario requires the deterministic mock chat page.');
  }

  await withExtensionStorageSnapshot(context, 'local', async () => {
    await withExtensionStorageValues(context, 'local', {
      ytcqInboxKeywords: [INBOX_KEYWORD]
    }, async () => {
      await reloadMockChat(chat, 'Reload mock chat with watched keyword storage');
      const messageId = await appendMockInboxMatch(chat);
      const sourceMessage = chat.locator(`#${messageId}`);
      await expectLiveChatKeywordHighlight(sourceMessage);
      await openInboxPanel(chat);
      await expectInboxRecordAndHighlight(chat);
      await jumpToInboxRecord(chat, sourceMessage);
    });
  });
};

export const inboxDirectMentionScenario: BrowserScenario = async ({ chat, context }) => {
  if (!isMockPageSurface(chat)) {
    throw new Error('inboxDirectMentionScenario requires the deterministic mock chat page.');
  }

  await withExtensionStorageSnapshot(context, 'local', async () => {
    await withExtensionStorageValues(context, 'local', {
      ytcqInboxKeywords: []
    }, async () => {
      await reloadMockChat(chat, 'Reload mock chat with current viewer identity');
      await appendMockDirectMention(chat);
      await openInboxPanel(chat);
      await expectDirectMentionInboxRecord(chat);
      await closeInboxPanel(chat);
    });
  });
};

async function expectInboxButtonAttached(chat: ChatSurface): Promise<void> {
  await test.step('Verify Inbox button is attached', async () => {
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
    await expect(chat.locator('.ytcq-refresh-chat-button')).toHaveCount(0);
  });
}

async function openInboxPanel(chat: ChatSurface): Promise<void> {
  await test.step('Open Inbox panel', async () => {
    await chat.locator('.ytcq-inbox-button').click();
    await expect(chat.locator('.ytcq-inbox-card')).toBeVisible();
  });
}

async function closeInboxPanel(chat: ChatSurface): Promise<void> {
  await test.step('Close Inbox panel', async () => {
    await chat.locator('.ytcq-inbox-card .ytcq-profile-card-close').click();
    await expect(chat.locator('.ytcq-inbox-card')).toHaveCount(0);
  });
}

async function reloadMockChat(chat: ChatSurface, stepName: string): Promise<void> {
  await test.step(stepName, async () => {
    if (!isMockPageSurface(chat)) throw new Error('Expected mock page surface.');
    await chat.reload({ waitUntil: 'domcontentloaded' });
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 15_000 });
  });
}

async function appendMockInboxMatch(chat: ChatSurface): Promise<string> {
  return test.step('Append keyword-matching chat message', async () => {
    const messageId = await appendMockFixtureMessage(chat, {
      author: '@InboxBrowserTest',
      text: `Please save this ${INBOX_KEYWORD} message`
    });
    if (!messageId) throw new Error('Mock page did not return an appended message id.');
    return messageId;
  });
}

async function appendMockDirectMention(chat: ChatSurface): Promise<string> {
  return test.step('Append direct mention chat message', async () => {
    const messageId = await appendMockFixtureMessage(chat, {
      author: '@DirectMentionBrowserTest',
      text: DIRECT_MENTION_TEXT
    });
    if (!messageId) throw new Error('Mock page did not return an appended message id.');
    return messageId;
  });
}

async function expectLiveChatKeywordHighlight(sourceMessage: ReturnType<ChatSurface['locator']>): Promise<void> {
  await test.step('Verify live chat keyword highlight appears', async () => {
    await expect(sourceMessage.locator('.ytcq-chat-keyword-highlight').filter({
      hasText: INBOX_KEYWORD
    }).first()).toBeVisible({ timeout: 10_000 });
  });
}

async function expectInboxRecordAndHighlight(chat: ChatSurface): Promise<void> {
  await test.step('Verify Inbox contains the saved keyword match', async () => {
    const record = chat.locator('.ytcq-inbox-card .ytcq-inbox-message').filter({
      hasText: INBOX_KEYWORD
    }).first();
    await expect(record).toBeVisible({ timeout: 10_000 });
    await expect(record.locator('.ytcq-inbox-keyword-highlight').filter({
      hasText: INBOX_KEYWORD
    }).first()).toBeVisible();
  });
}

async function expectDirectMentionInboxRecord(chat: ChatSurface): Promise<void> {
  await test.step('Verify Inbox contains and highlights the direct mention', async () => {
    const record = chat.locator('.ytcq-inbox-card .ytcq-inbox-message').filter({
      hasText: DIRECT_MENTION_TEXT
    }).first();
    await expect(record).toBeVisible({ timeout: 10_000 });
    await expect(record.locator('.ytcq-inbox-mention-highlight').filter({
      hasText: CURRENT_VIEWER_MENTION
    }).first()).toBeVisible();
  });
}

async function jumpToInboxRecord(
  chat: ChatSurface,
  sourceMessage: ReturnType<ChatSurface['locator']>
): Promise<void> {
  await test.step('Jump from Inbox record back to the live message', async () => {
    const record = chat.locator('.ytcq-inbox-card .ytcq-inbox-message').filter({
      hasText: INBOX_KEYWORD
    }).first();
    await record.hover();
    const jumpButton = record.locator('.ytcq-profile-card-jump');
    await expect(jumpButton).toHaveCSS('opacity', '1');
    await jumpButton.click();
    await expect(chat.locator('.ytcq-inbox-card')).toHaveCount(0);
    await expect(sourceMessage).toHaveClass(/ytcq-message-jump-target/, { timeout: 2_000 });
  });
}
