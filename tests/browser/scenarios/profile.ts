/**
 * Browser scenario for avatar recent-message cards.
 *
 * It uses the first visible live-chat message so the same behavior can be
 * checked against both the deterministic fixture and real YouTube chat.
 */
import { expect, test } from '@playwright/test';
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

export const profileScenario: BrowserScenario = async ({ chat }) => {
  const source = await findRecentMessageSource(chat);
  await openProfileCardFromAvatar(chat, source);
  await expectProfileCardHasRecentMessages(chat, source);
  await expectMockProfileCardReceivesNewMessages(chat, source);
  await closeProfileCard(chat);
};

interface MessageSource {
  authorName: string;
  channelId: string;
  messageText: string;
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
      const messageText = cleanVisibleText(await message.locator('#message').first().innerText().catch(() => ''));
      if (!authorName || !messageText) continue;

      const channelId = await message.evaluate((element) => {
        const data = (element as HTMLElement & {
          data?: { authorExternalChannelId?: string };
        }).data;
        return data?.authorExternalChannelId || '';
      }).catch(() => '');

      return {
        authorName,
        channelId,
        messageText
      };
    }

    throw new Error('Could not find a recent message with readable author and text.');
  });
}

async function openProfileCardFromAvatar(chat: ChatSurface, source: MessageSource): Promise<void> {
  const avatar = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).filter({
    has: chat.locator('#author-name').filter({ hasText: source.authorName })
  }).last().locator('#author-photo');
  const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');

  await test.step('Wait for a chat avatar', async () => {
    await avatar.waitFor({ state: 'visible', timeout: 45_000 });
  });

  await test.step('Open recent-message profile card', async () => {
    await avatar.click({ timeout: 2_000 }).catch(async () => {
      await avatar.dispatchEvent('click');
    });
    await expect(profileCard).toBeVisible();
  });
}

async function expectProfileCardHasRecentMessages(chat: ChatSurface, source: MessageSource): Promise<void> {
  await test.step('Verify profile card shows recent messages for the clicked author', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard.locator('.ytcq-profile-card-title')).toContainText(source.authorName);
    await expect(profileCard.locator('.ytcq-profile-card-message').filter({
      hasText: source.messageText
    }).first()).toBeVisible();
  });
}

async function expectMockProfileCardReceivesNewMessages(chat: ChatSurface, source: MessageSource): Promise<void> {
  if (!isMockPageSurface(chat)) return;

  await test.step('Mock-only: append a new author message and verify the card updates', async () => {
    const text = `Profile follow-up ${Date.now()}`;
    await appendMockFixtureMessage(chat, {
      author: source.authorName,
      channel: source.channelId || undefined,
      text
    });

    await expect(chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message').filter({
      hasText: text
    }).first()).toBeVisible({ timeout: 10_000 });
  });
}

async function closeProfileCard(chat: ChatSurface): Promise<void> {
  await test.step('Close profile card', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await profileCard.locator('.ytcq-profile-card-close').click();
    await expect(profileCard).toHaveCount(0);
  });
}
