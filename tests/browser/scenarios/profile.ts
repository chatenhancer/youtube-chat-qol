/**
 * Browser scenario for avatar recent-message cards.
 *
 * Shared scenarios use the first visible live-chat message so the same behavior
 * can be checked against both the deterministic fixture and real YouTube chat.
 * Fixture-only update checks are exported separately.
 */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import {
  appendMockFixtureMessage,
  isMockPageSurface
} from '../support/mock-page';
import { centerLocatorInViewport } from '../support/locator';
import { cleanVisibleText, getRichVisibleText } from '../support/text';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type BrowserScenario,
  type ChatSurface
} from './types';

export const profileCardRecentMessagesScenario: BrowserScenario = async ({ chat, context }) => {
  const source = await findRecentMessageSource(chat);
  await openProfileCardFromAvatar(chat, source);
  await expectProfileCardHasRecentMessages(chat, source);
  await expectProfileCardJumpToMessage(chat, source);
  await expectProfileChannelButtonOpensChannel(chat, context);
  await closeProfileCard(chat);
};

export const profileCardReceivesNewMessagesScenario: BrowserScenario = async ({ chat }) => {
  const source = await findRecentMessageSource(chat);
  await openProfileCardFromAvatar(chat, source);
  await expectProfileCardHasRecentMessages(chat, source);
  await appendAuthorMessageAndVerifyProfileCardUpdates(chat, source);
  await closeProfileCard(chat);
};

interface MessageSource {
  authorName: string;
  channelId: string;
  messageId: string;
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
      const messageText = await getRichVisibleText(message.locator('#message').first()).catch(() => '');
      if (!authorName || !messageText) continue;
      if (!hasMeaningfulText(messageText)) continue;

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
      const messageId = await message.getAttribute('id').catch(() => '') || '';

      return {
        authorName,
        channelId,
        messageId,
        messageText
      };
    }

    throw new Error('Could not find a recent message with readable author and text.');
  });
}

async function openProfileCardFromAvatar(chat: ChatSurface, source: MessageSource): Promise<void> {
  const sourceMessage = getSourceMessage(chat, source);
  const avatar = sourceMessage.locator('#author-photo').first();
  const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');

  await test.step('Wait for a chat avatar', async () => {
    await avatar.waitFor({ state: 'visible', timeout: 45_000 });
  });

  await test.step('Open recent-message profile card', async () => {
    await centerLocatorInViewport(sourceMessage);
    await avatar.click({ timeout: 2_000 });
    await expect(profileCard).toBeVisible();
  });
}

async function expectProfileCardHasRecentMessages(chat: ChatSurface, source: MessageSource): Promise<void> {
  await test.step('Verify profile card shows recent messages for the clicked author', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard.locator('.ytcq-profile-card-title')).toContainText(source.authorName);
    await expect(await getProfileCardRecord(chat, source)).toBeVisible();
  });
}

async function appendAuthorMessageAndVerifyProfileCardUpdates(chat: ChatSurface, source: MessageSource): Promise<void> {
  await test.step('Append a new author message and verify the card updates', async () => {
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

async function expectProfileChannelButtonOpensChannel(
  chat: ChatSurface,
  context: BrowserContext
): Promise<void> {
  const youtubeProfileUrlPattern = '**://www.youtube.com/**';
  await test.step('Click profile channel button and verify it opens YouTube', async () => {
    if (isMockPageSurface(chat)) {
      await context.route(youtubeProfileUrlPattern, (route) => route.fulfill({
        body: '<!doctype html><title>Mock channel</title>',
        contentType: 'text/html',
        status: 200
      }));
    }

    try {
      const popupPromise = context.waitForEvent('page');
      await chat.locator('.ytcq-profile-card-channel').click();
      const popup = await popupPromise;

      try {
        await expect.poll(async () => getOpenedProfileUrl(popup.url()), {
          message: 'Profile channel button should open the selected author channel.',
          timeout: isMockPageSurface(chat) ? 5_000 : 15_000
        }).toMatch(/^https:\/\/www\.youtube\.com\/(?:@|channel\/)/);
      } finally {
        await popup.close().catch(() => undefined);
      }
    } finally {
      if (isMockPageSurface(chat)) {
        await context.unroute(youtubeProfileUrlPattern);
      }
    }
  });
}

async function expectProfileCardJumpToMessage(chat: ChatSurface, source: MessageSource): Promise<void> {
  await test.step('Jump from profile card record back to the live message', async () => {
    const sourceMessage = getSourceMessage(chat, source);
    const record = await getProfileCardRecord(chat, source);

    await centerLocatorInViewport(record);
    await record.hover();
    const jumpButton = record.locator('.ytcq-profile-card-jump');
    await expect(jumpButton).toHaveCSS('opacity', '1');
    await jumpButton.click();
    await expect(sourceMessage).toHaveClass(/ytcq-message-jump-target/, { timeout: 2_000 });
  });
}

async function getProfileCardRecord(chat: ChatSurface, source: MessageSource): Promise<Locator> {
  if (source.messageId) {
    const liveMessageRecord = chat.locator(`.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message[data-ytcq-live-message-id="${escapeCssString(source.messageId)}"]`).first();
    if (await liveMessageRecord.count()) return liveMessageRecord;
  }

  const records = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message');

  await expect.poll(async () => findProfileCardRecordIndex(records, source.messageText), {
    message: 'Profile card should contain the exact recent message record.',
    timeout: 10_000
  }).toBeGreaterThanOrEqual(0);

  const index = await findProfileCardRecordIndex(records, source.messageText);
  return records.nth(index);
}

async function findProfileCardRecordIndex(records: Locator, expectedText: string): Promise<number> {
  const count = await records.count();

  for (let index = 0; index < count; index += 1) {
    const text = await getRichVisibleText(records.nth(index).locator('.ytcq-profile-card-message-text').first(), {
      ignoredSelector: '.ytcq-translation, .ytcq-replaced-translation-icon'
    }).catch(() => '');
    if (text === expectedText) return index;
  }

  return -1;
}

async function closeProfileCard(chat: ChatSurface): Promise<void> {
  await test.step('Close profile card', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await profileCard.locator('.ytcq-profile-card-close').click();
    await expect(profileCard).toHaveCount(0);
  });
}

function getSourceMessage(chat: ChatSurface, source: MessageSource): ReturnType<ChatSurface['locator']> {
  if (source.messageId) {
    return chat.locator(`${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssString(source.messageId)}"]`).first();
  }

  return chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).filter({
    has: chat.locator('#author-name').filter({ hasText: source.authorName })
  }).filter({
    has: chat.locator('#message').filter({ hasText: source.messageText })
  }).last();
}

function hasMeaningfulText(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function getOpenedProfileUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.hostname === 'consent.youtube.com') {
      const continueUrl = url.searchParams.get('continue');
      if (continueUrl) return continueUrl;
    }
  } catch {
    return value;
  }

  return value;
}
