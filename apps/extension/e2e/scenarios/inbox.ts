/**
 * Browser scenario for the chat-header Inbox panel.
 *
 * The same check runs in logged-out and logged-in contexts because the Inbox
 * should be available whenever the extension is attached to YouTube live chat.
 */
import { expect, test } from '@playwright/test';
import { requireControlledChat } from '../support/controlled-chat';
import {
  withExtensionStorageSnapshot,
  withExtensionStorageValues
} from '../support/extension-storage';
import {
  isMockPageSurface,
  prefetchMockReplayFixtureMessage,
  setMockReplayPlayerProgress
} from '../support/mock-page';
import { expectClassAddedDuringAction } from '../support/locator';
import type { BrowserScenario, ChatSurface } from './types';

const INBOX_KEYWORD = 'browser-inbox-keyword';
const PROFILE_MENTION_OVERLAP_KEYWORD = 'handlepart';
const REPLAY_PREFETCH_KEYWORD = 'browser-replay-prefetch-keyword';

export const inboxOpensFromHeaderScenario: BrowserScenario = async ({ chat }) => {
  await openInboxPanel(chat);
  await closeInboxPanel(chat);
};

export const inboxGripDragScenario: BrowserScenario = async ({ chat, page }) => {
  await openInboxPanel(chat);
  const card = chat.locator('.ytcq-inbox-card');
  await expect(card.locator('.ytcq-panel-resize-handle')).toHaveCount(8);
  await card.evaluate((panel) => {
    Object.assign((panel as HTMLElement).style, {
      bottom: 'auto',
      left: '20px',
      right: 'auto',
      top: '20px',
      transform: ''
    });
  });

  const grip = card.locator('.ytcq-panel-drag-grip');
  expect(await grip.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return [rect.left + 4, rect.left + rect.width / 2, rect.right - 4].every(
      (x) => document.elementFromPoint(x, rect.bottom - 1) === element
    );
  })).toBe(true);
  const gripBox = await grip.boundingBox();
  if (!gripBox) throw new Error('Inbox drag grip is not visible.');
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2 + 30, gripBox.y + gripBox.height / 2 + 20);
  await page.mouse.up();

  const position = await card.evaluate((panel) => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  });
  expect(position.left).toBeCloseTo(50, 0);
  expect(position.top).toBeCloseTo(40, 0);
  await closeInboxPanel(chat);
};

export const inboxClosesOnWatchPageClickScenario: BrowserScenario = async ({ chat, page }) => {
  await openInboxPanel(chat);

  const outsideTargetId = 'ytcq-e2e-watch-page-focus-target';
  await page.evaluate((id) => {
    const button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.textContent = 'Outside chat frame';
    Object.assign(button.style, {
      height: '1px',
      left: '0',
      position: 'fixed',
      top: '0',
      width: '1px',
      zIndex: '2147483647'
    });
    document.body.append(button);
  }, outsideTargetId);

  try {
    await page.locator(`#${outsideTargetId}`).click();
    await expect(chat.locator('.ytcq-inbox-card')).toBeHidden();
  } finally {
    await page.evaluate((id) => document.getElementById(id)?.remove(), outsideTargetId);
  }
};

export const inboxRecordCreationAndJumpScenario: BrowserScenario = async ({
  chat,
  controlledChat
}) => {
  const incoming = requireControlledChat(controlledChat);
  await withInboxKeyword(chat, INBOX_KEYWORD, async () => {
    const messageId = await incoming.injectMessage({
      author: '@InboxParityViewer',
      channel: 'UCInboxParityViewer',
      text: `Please save this ${INBOX_KEYWORD} message`
    });
    const sourceMessage = chat.locator(`#${messageId}`);
    await expectLiveChatKeywordHighlight(sourceMessage);
    await openInboxPanel(chat);
    await expectInboxRecordAndHighlight(chat);
    await jumpToInboxRecord(chat, sourceMessage);
  });
};

export const inboxKeywordOverlapPreservesProfileMentionScenario: BrowserScenario = async ({
  chat,
  controlledChat
}) => {
  const incoming = requireControlledChat(controlledChat);
  await withInboxKeyword(chat, PROFILE_MENTION_OVERLAP_KEYWORD, async () => {
    const mentionedAuthor = '@InboxHandlePartTarget';
    const mentionText = mentionedAuthor.toLowerCase();
    const mentionMessageId = await incoming.injectMessage({
      author: '@InboxOverlapSource',
      channel: 'UCInboxOverlapSource',
      text: `Please ask ${mentionText} next`
    });
    const mentionMessage = chat.locator(`#${mentionMessageId}`);
    await expect(mentionMessage.locator('.ytcq-chat-keyword-highlight')).toHaveText(
      PROFILE_MENTION_OVERLAP_KEYWORD
    );
    await expect(mentionMessage.locator('.ytcq-profile-mention')).toHaveCount(0);

    await incoming.injectMessage({
      author: mentionedAuthor,
      channel: 'UCInboxHandlePartTarget',
      text: 'Target profile history'
    });

    const mention = mentionMessage.locator('.ytcq-profile-mention');
    await expect(mention).toHaveText(mentionText);
    await expect(mention).toHaveAttribute('role', 'button');
    await expect(mention.locator('.ytcq-chat-keyword-highlight')).toHaveText(
      PROFILE_MENTION_OVERLAP_KEYWORD
    );
    await mention.click();

    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard.locator('.ytcq-profile-card-title')).toHaveText(mentionedAuthor);
    await profileCard.locator('.ytcq-profile-card-close').click();
    await expect(profileCard).toHaveCount(0);
  });
};

export const inboxDirectMentionScenario: BrowserScenario = async ({
  chat,
  controlledChat
}) => {
  const incoming = requireControlledChat(controlledChat);
  const viewerName = (
    await chat
      .locator('yt-live-chat-message-input-renderer #author-name')
      .first()
      .innerText()
  ).trim();
  expect(viewerName).toMatch(/^@\S+/);
  const text = `Controlled direct mention for ${viewerName}`;
  await incoming.injectMessage({
    author: '@DirectMentionParitySource',
    channel: 'UCDirectMentionParitySource',
    text
  });

  await openInboxPanel(chat);
  const record = chat.locator('.ytcq-inbox-card .ytcq-inbox-message').filter({
    hasText: text
  }).first();
  await expect(record).toBeVisible({ timeout: 10_000 });
  await expect(record.locator('.ytcq-inbox-mention-highlight')).toContainText(viewerName);
  await closeInboxPanel(chat);
};

export const inboxReplayPrefetchTimingScenario: BrowserScenario = async ({ chat, context }) => {
  if (!isMockPageSurface(chat)) {
    throw new Error('inboxReplayPrefetchTimingScenario requires the deterministic mock replay page.');
  }

  await withExtensionStorageSnapshot(context, 'local', async () => {
    await withExtensionStorageValues(context, 'local', {
      ytcqInboxKeywords: [REPLAY_PREFETCH_KEYWORD]
    }, async () => {
      await reloadMockChat(chat, 'Reload mock replay with watched keyword storage');
      await setMockReplayPlayerProgress(chat, 5);
      const messageId = await prefetchMockReplayFixtureMessage(chat, {
        author: '@ReplayPrefetchBrowserTest',
        text: `Future ${REPLAY_PREFETCH_KEYWORD} message`
      }, 10_000);
      if (!messageId) throw new Error('Mock replay did not return a prefetched message id.');

      await openInboxPanel(chat);
      const record = chat.locator('.ytcq-inbox-card .ytcq-inbox-message').filter({
        hasText: REPLAY_PREFETCH_KEYWORD
      }).first();
      await expect(record).toHaveCount(0);

      await setMockReplayPlayerProgress(chat, 10);
      await expect(record).toBeVisible({ timeout: 10_000 });
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
  await expectInboxButtonAttached(chat);
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

async function withInboxKeyword(
  chat: ChatSurface,
  keyword: string,
  callback: () => Promise<void>
): Promise<void> {
  await openInboxPanel(chat);
  const card = chat.locator('.ytcq-inbox-card');
  const keywordPanel = card.locator('.ytcq-inbox-keyword-panel');
  await card.locator('.ytcq-inbox-keyword-toggle').click();
  await expect(keywordPanel).toBeVisible();
  await keywordPanel.locator('.ytcq-inbox-keyword-input').fill(keyword);
  await keywordPanel.locator('.ytcq-inbox-keyword-add').click();
  const keywordChip = keywordPanel.locator('.ytcq-inbox-keyword-chip').filter({
    hasText: keyword
  });
  await expect(keywordChip).toBeVisible();
  await closeInboxPanel(chat);

  try {
    await callback();
  } finally {
    await openInboxPanel(chat);
    const cleanupCard = chat.locator('.ytcq-inbox-card');
    const cleanupPanel = cleanupCard.locator('.ytcq-inbox-keyword-panel');
    if (!(await cleanupPanel.isVisible())) {
      await cleanupCard.locator('.ytcq-inbox-keyword-toggle').click();
    }
    const cleanupChip = cleanupPanel.locator('.ytcq-inbox-keyword-chip').filter({
      hasText: keyword
    });
    if (await cleanupChip.isVisible()) {
      await cleanupChip.locator('.ytcq-inbox-keyword-remove').click();
    }
    await expect(cleanupChip).toHaveCount(0);
    await closeInboxPanel(chat);
  }
}

async function reloadMockChat(chat: ChatSurface, stepName: string): Promise<void> {
  await test.step(stepName, async () => {
    if (!isMockPageSurface(chat)) throw new Error('Expected mock page surface.');
    await chat.reload({ waitUntil: 'domcontentloaded' });
    await expect(chat.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 15_000 });
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

async function jumpToInboxRecord(
  chat: ChatSurface,
  sourceMessage: ReturnType<ChatSurface['locator']>
): Promise<void> {
  await test.step('Jump from Inbox record back to the live message', async () => {
    const record = chat.locator('.ytcq-inbox-card .ytcq-inbox-message').filter({
      hasText: INBOX_KEYWORD
    }).first();
    const jumpButton = record.locator('.ytcq-profile-card-jump');
    await jumpButton.focus();
    await expect(jumpButton).toHaveCSS('opacity', '1');
    await expectClassAddedDuringAction(
      sourceMessage,
      'ytcq-message-jump-target',
      () => jumpButton.press('Enter')
    );
    await expect(chat.locator('.ytcq-inbox-card')).toHaveCount(0);
  });
}
