/**
 * Browser scenario for avatar recent-message cards.
 *
 * It uses the first visible live-chat message so the same behavior can be
 * checked against both the deterministic fixture and real YouTube chat.
 */
import { expect, test } from '@playwright/test';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type ChatSurface
} from './types';

export const profileScenario: BrowserScenario = {
  name: 'Profile card opens from a chat avatar',
  run: async ({ chat }) => {
    await openProfileCardFromAvatar(chat);
    await expectProfileCardHasRecentMessages(chat);
    await closeProfileCard(chat);
  }
};

async function openProfileCardFromAvatar(chat: ChatSurface): Promise<void> {
  const avatar = chat.locator(`${NORMAL_CHAT_MESSAGE_SELECTOR} #author-photo`).last();
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

async function expectProfileCardHasRecentMessages(chat: ChatSurface): Promise<void> {
  await test.step('Verify profile card has recent messages', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard.locator('.ytcq-profile-card-message').first()).toBeVisible();
  });
}

async function closeProfileCard(chat: ChatSurface): Promise<void> {
  await test.step('Close profile card', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await profileCard.locator('.ytcq-profile-card-close').click();
    await expect(profileCard).toHaveCount(0);
  });
}
