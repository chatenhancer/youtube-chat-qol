/**
 * Browser scenario for conversation focus mode.
 *
 * Controlled-message checks use the same scenario against the mock renderer
 * and YouTube's native continuation renderer.
 */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import { BOOKMARKS_STORAGE_KEY } from '../../src/shared/bookmarks';
import { clearChatComposerIfVisible } from '../support/composer';
import { withExtensionStorageValues } from '../support/extension-storage';
import {
  requireControlledChat,
  type ControlledChat
} from '../support/controlled-chat';
import { closeFocusPromptIfPresent } from '../support/focus-panel';
import { centerLocatorInViewport } from '../support/locator';
import { cleanVisibleText } from '../support/text';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type ChatSurface
} from './types';

export const focusPanelOpensFromAuthorScenario: BrowserScenario = async ({ chat }) => {
  const source = await openCollapsedFocusPromptFromRecentMessage(chat);
  await expandFocusPanel(chat);
  await expectFocusPanelContainsSourceMessage(chat, source);
  await cleanUpFocusPanel(chat);
};

export const focusPanelReceivesNewMessagesScenario: BrowserScenario = async ({
  chat,
  context,
  controlledChat
}) => {
  const incoming = requireControlledChat(controlledChat);
  const channelId = 'UCParityFocusViewer';
  const messageId = await incoming.injectMessage({
    author: '@ParityFocusViewer',
    channel: channelId,
    text: 'Controlled focus source message'
  });
  const source = await openCollapsedFocusPromptFromRecentMessage(
    chat,
    chat.locator(`#${messageId}`)
  );
  source.channelId = channelId;
  await expandFocusPanel(chat);
  await expectFocusPanelContainsSourceMessage(chat, source);
  await expectFocusMessageActionsAndJump(chat, context, source);
  await expectFocusHeaderActionsAndRingToggle(chat);
  await deliverFocusedAuthorMessageAndVerifyItAppears(chat, incoming, source);
  await cleanUpFocusPanel(chat);
};

interface MessageSource {
  authorName: string;
  channelId: string;
  text: string;
  targetId: string;
}

const FOCUS_TARGET_ATTRIBUTE = 'data-ytcq-browser-focus-target';
let nextFocusTargetId = 0;

async function openCollapsedFocusPromptFromRecentMessage(
  chat: ChatSurface,
  preferredMessage?: Locator
): Promise<MessageSource> {
  return test.step('Click a recent author handle to open collapsed focus prompt', async () => {
    const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR);
    await messages.last().waitFor({ state: 'visible', timeout: 45_000 });

    const count = await messages.count();
    const firstCandidate = Math.max(0, count - 20);
    const candidates = [
      ...(preferredMessage ? [preferredMessage] : []),
      ...Array.from(
        { length: count - firstCandidate },
        (_value, offset) => messages.nth(count - 1 - offset)
      )
    ];
    for (const candidate of candidates) {
      const message = await freezeFocusMessageTarget(chat, candidate);
      if (!message) continue;

      await centerLocatorInViewport(message);
      const sourceBeforeClick = await readMessageSource(message);
      if (!sourceBeforeClick) continue;
      const clicked = await message.locator('#author-name').first()
        .click({ timeout: 2_000 })
        .then(() => true, () => false);
      if (!clicked) continue;

      const focusPrompt = chat.locator('.ytcq-focus-card-collapsed');
      if (await focusPrompt.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const sourceAfterClick = await readMessageSource(message);
        if (sourceAfterClick && isSameMessageSource(sourceBeforeClick, sourceAfterClick)) {
          return sourceAfterClick;
        }
        await closeFocusPromptIfPresent(chat);
      }
    }

    throw new Error('Could not click a recent message author to open the focus prompt.');
  });
}

async function freezeFocusMessageTarget(chat: ChatSurface, message: Locator): Promise<Locator | null> {
  const targetId = `focus-card-${Date.now()}-${nextFocusTargetId++}`;
  const didFreeze = await message.evaluate((element, { attribute, value }) => {
    if (!(element instanceof HTMLElement) || !element.isConnected) return false;
    element.setAttribute(attribute, value);
    return true;
  }, {
    attribute: FOCUS_TARGET_ATTRIBUTE,
    value: targetId
  }).catch(() => false);

  return didFreeze ? chat.locator(`[${FOCUS_TARGET_ATTRIBUTE}="${escapeCssString(targetId)}"]`).first() : null;
}

async function readMessageSource(message: Locator): Promise<MessageSource | null> {
  const authorName = cleanVisibleText(await message.locator('#author-name').first().innerText().catch(() => ''));
  const text = cleanVisibleText(await message.locator('#message').first().innerText().catch(() => ''));
  if (!authorName || !text) return null;
  const targetId = await message.getAttribute(FOCUS_TARGET_ATTRIBUTE).catch(() => '') || '';

  const channelId = await message.evaluate((element) => {
    const author = element.querySelector('#author-name');
    const link = author?.closest('a[href]') || element.querySelector('a[href*="/channel/"]');
    const href = link?.getAttribute('href') || '';
    try {
      const url = new URL(href, 'https://www.youtube.com');
      const [kind, id] = url.pathname.split('/').filter(Boolean);
      return kind === 'channel' ? id : '';
    } catch {
      return '';
    }
  }).catch(() => '');

  return {
    authorName,
    channelId,
    text,
    targetId
  };
}

function isSameMessageSource(first: MessageSource, second: MessageSource): boolean {
  return first.authorName === second.authorName &&
    first.channelId === second.channelId &&
    first.text === second.text &&
    first.targetId === second.targetId;
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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

async function expectFocusMessageActionsAndJump(
  chat: ChatSurface,
  context: BrowserContext,
  source: MessageSource
): Promise<void> {
  await test.step('Jump to the source message from its Focus row', async () => {
    const row = chat.locator('.ytcq-focus-message-them').filter({
      has: chat.locator('.ytcq-focus-bubble').filter({ hasText: source.text })
    }).first();
    const bookmarkButton = row.locator('.ytcq-bookmark-toggle');
    const jumpButton = row.locator('.ytcq-bookmark-toggle + .ytcq-focus-message-jump');

    await chat.locator('.ytcq-focus-header').hover();
    await expect(bookmarkButton).toHaveCSS('opacity', '0');
    await expect(jumpButton).toHaveCSS('opacity', '0');
    await row.hover();
    await expect(bookmarkButton).toHaveCSS('opacity', '1');
    await expect(jumpButton).toHaveCSS('opacity', '1');

    await test.step('Flash only the message bubble when saving a Focus message', async () => {
      await withExtensionStorageValues(context, 'local', { [BOOKMARKS_STORAGE_KEY]: {} }, async () => {
        const bubble = row.locator('.ytcq-focus-bubble');
        await expect(bookmarkButton).toHaveAttribute('aria-pressed', 'false');
        await bookmarkButton.click();
        await expect(bubble).toHaveClass(/ytcq-bookmark-saved/);
        await expect(row).not.toHaveClass(/ytcq-bookmark-saved/);
        await expect(row.locator('.ytcq-focus-message-meta-row')).not.toHaveClass(/ytcq-bookmark-saved/);
        await expect(bubble).not.toHaveClass(/ytcq-bookmark-saved/);
        await expect(bookmarkButton).toHaveAttribute('aria-pressed', 'true');
      });
    });

    await jumpButton.click();
    const sourceMessage = chat.locator(
      `[${FOCUS_TARGET_ATTRIBUTE}="${escapeCssString(source.targetId)}"]`
    ).first();
    await expect(sourceMessage).toHaveClass(/ytcq-message-jump-target/);
  });
}

async function expectFocusHeaderActionsAndRingToggle(chat: ChatSurface): Promise<void> {
  await test.step('Verify the Focus header actions and toggle the author ring', async () => {
    const panel = chat.locator('.ytcq-focus-card-expanded');
    const toggle = panel.locator('.ytcq-focus-header-actions .ytcq-avatar-ring-toggle');
    const channelButton = panel.locator('.ytcq-focus-channel');
    const closeButton = panel.locator('.ytcq-focus-close');
    const avatar = panel.locator('.ytcq-focus-avatar');
    const author = panel.locator('.ytcq-focus-author-name');
    const initialState = await toggle.getAttribute('aria-pressed');
    const nextState = initialState === 'true' ? 'false' : 'true';

    await expect(toggle).toBeVisible();
    await expect(channelButton).toHaveAttribute('aria-label', /channel/i);
    await expect(panel.locator('.ytcq-avatar-ring-toggle + .ytcq-focus-channel')).toBeVisible();
    await expect(panel.locator('.ytcq-focus-channel + .ytcq-focus-close')).toBeVisible();
    await expect(closeButton).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', nextState);
    if (nextState === 'true') {
      await expect(avatar).toHaveClass(/ytcq-avatar-ring-active/);
      await expect(author).toHaveClass(/ytcq-remembered-author-active/);
    } else {
      await expect(avatar).not.toHaveClass(/ytcq-avatar-ring-active/);
      await expect(author).not.toHaveClass(/ytcq-remembered-author-active/);
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', initialState || 'false');
  });
}

async function deliverFocusedAuthorMessageAndVerifyItAppears(
  chat: ChatSurface,
  controlledChat: ControlledChat,
  source: MessageSource
): Promise<void> {
  await test.step('Deliver a new focused-author message and verify it appears', async () => {
    const text = `Focus follow-up ${Date.now()}`;
    await controlledChat.injectMessage({
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
