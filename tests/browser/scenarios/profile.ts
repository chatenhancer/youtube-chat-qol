/**
 * Browser scenario for avatar recent-message cards.
 *
 * Shared scenarios use the first visible live-chat message so the same behavior
 * can be checked against both the deterministic fixture and real YouTube chat.
 * Fixture-only update checks are exported separately.
 */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import { appendMockFixtureMessage, isMockPageSurface } from '../support/mock-page';
import { centerLocatorInViewport } from '../support/locator';
import { cleanVisibleText, getRichVisibleText } from '../support/text';
import { NORMAL_CHAT_MESSAGE_SELECTOR, type BrowserScenario, type ChatSurface } from './types';

export const profileCardRecentMessagesScenario: BrowserScenario = async ({ chat, context }) => {
  const source = await openStableProfileCardFromRecentMessage(chat);
  await expectProfileCardHasRecentMessages(chat, source);
  await expectProfileAvatarRingToggle(chat, source);
  await expectProfileCardJumpToMessage(chat, source);
  await expectProfileChannelButtonOpensChannel(chat, context);
  await closeProfileCard(chat);
};

export const profileCardReceivesNewMessagesScenario: BrowserScenario = async ({ chat }) => {
  const source = await openStableProfileCardFromRecentMessage(chat);
  await expectProfileCardHasRecentMessages(chat, source);
  await appendAuthorMessageAndVerifyProfileCardUpdates(chat, source);
  await closeProfileCard(chat);
};

export const profileCardHistoryPagingScenario: BrowserScenario = async ({ chat }) => {
  await test.step('Page through retained profile history around an older feed message', async () => {
    if (!isMockPageSurface(chat)) {
      throw new Error('Profile history paging requires the deterministic mock chat page.');
    }

    const author = '@ProfileHistoryViewer';
    const channel = 'profile-history-channel';
    const messageIds: string[] = [];
    for (let index = 0; index < 30; index += 1) {
      const messageId = await appendMockFixtureMessage(chat, {
        author,
        channel,
        text: `Profile history ${index}`
      });
      if (messageId) messageIds.push(messageId);
    }
    expect(messageIds).toHaveLength(30);

    const originMessageId = messageIds[15];
    const originMessage = chat.locator(
      `${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssString(originMessageId)}"]`
    );
    await centerLocatorInViewport(originMessage);
    await originMessage.locator('#author-photo').click();

    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    const list = profileCard.locator('.ytcq-profile-card-messages');
    const records = list.locator('.ytcq-profile-card-message');
    const originRecord = records.filter({ hasText: 'Profile history 15' });
    await expect(records).toHaveCount(12);
    await expect(originRecord).toHaveClass(/ytcq-profile-card-message-origin/);
    await expect(originRecord).toBeVisible();

    await list.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(records).toHaveCount(21);
    await expect(records.first()).toContainText('Profile history 0');

    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await expect(records).toHaveCount(30);
    await expect(records.last()).toContainText('Profile history 29');

    await closeProfileCard(chat);
  });
};

export const profileCardAeroOriginHighlightScenario: BrowserScenario = async ({ chat }) => {
  await test.step('Keep the profile origin message highlighted in Aero', async () => {
    if (!isMockPageSurface(chat)) {
      throw new Error('Aero profile origin styling requires the deterministic mock chat page.');
    }

    const root = chat.locator('html');
    const previousSkin = await root.evaluate((element) => ({
      skin: element.getAttribute('data-ytcq-chat-skin'),
      theme: element.getAttribute('data-ytcq-chat-skin-theme')
    }));

    try {
      await root.evaluate((element) => {
        element.setAttribute('data-ytcq-chat-skin', 'aero');
        element.setAttribute('data-ytcq-chat-skin-theme', 'light');
      });

      const source = await openStableProfileCardFromRecentMessage(chat);
      const originRecord = await getProfileCardRecord(chat, source);
      await expect(originRecord).toHaveClass(/ytcq-profile-card-message-origin/);

      for (const theme of ['light', 'dark'] as const) {
        await root.evaluate((element, value) => {
          element.setAttribute('data-ytcq-chat-skin-theme', value);
        }, theme);
        await expect(originRecord, `Expected an Aero ${theme} origin-message highlight.`).toHaveCSS(
          'box-shadow',
          /inset/
        );
      }
    } finally {
      await closeProfileCardIfPresent(chat);
      await root.evaluate((element, attributes) => {
        for (const [name, value] of Object.entries({
          'data-ytcq-chat-skin': attributes.skin,
          'data-ytcq-chat-skin-theme': attributes.theme
        })) {
          if (value === null) element.removeAttribute(name);
          else element.setAttribute(name, value);
        }
      }, previousSkin);
    }
  });
};

export const profileMentionOpensRecentMessagesScenario: BrowserScenario = async ({ chat }) => {
  await test.step('Open mentioned-user history from an inline handle', async () => {
    if (!isMockPageSurface(chat)) {
      throw new Error('Clickable profile mentions require the deterministic mock chat page.');
    }

    const mentionedAuthor = '@MentionedProfileViewer';
    const mentionText = mentionedAuthor.toLowerCase();
    const mentionedChannel = 'mentioned-profile-channel';
    const nestedAuthor = '@NestedProfileViewer';
    const nestedMentionText = nestedAuthor.toLowerCase();
    const nestedHistoryText = `Nested profile history ${Date.now()}`;
    const historyText = `Please ask ${nestedMentionText} next`;
    await appendMockFixtureMessage(chat, {
      author: nestedAuthor,
      channel: 'nested-profile-channel',
      text: nestedHistoryText
    });
    await appendMockFixtureMessage(chat, {
      author: mentionedAuthor,
      channel: mentionedChannel,
      text: historyText
    });
    const mentionMessageId = await appendMockFixtureMessage(chat, {
      author: '@MentioningProfileViewer',
      channel: 'mentioning-profile-channel',
      text: `Please ask ${mentionText}, not @mentionedprofile or @NoMatchingProfileViewer`
    });
    expect(mentionMessageId).not.toBeNull();

    const mentionMessage = chat.locator(
      `${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssString(mentionMessageId || '')}"]`
    );
    const mention = mentionMessage.locator('.ytcq-profile-mention').filter({
      hasText: mentionText
    });
    await expect(mention).toBeVisible();
    await expect(mention).toHaveAttribute('role', 'button');
    await expect(mentionMessage.locator('.ytcq-profile-mention')).toHaveCount(1);
    await mention.click();

    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard.locator('.ytcq-profile-card-title')).toHaveText(mentionedAuthor);
    await expect(
      profileCard.locator('.ytcq-profile-card-message').filter({ hasText: historyText })
    ).toBeVisible();

    const nestedMention = profileCard.locator('.ytcq-profile-mention').filter({
      hasText: nestedMentionText
    });
    await expect(nestedMention).toBeVisible();
    const nestedMentionRect = await nestedMention.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top };
    });
    await nestedMention.click();

    await expect(profileCard.locator('.ytcq-profile-card-title')).toHaveText(nestedAuthor);
    await expect(
      profileCard.locator('.ytcq-profile-card-message').filter({ hasText: nestedHistoryText })
    ).toBeVisible();
    await expectProfileCardPositionedFromAnchor(profileCard, nestedMentionRect);
    await closeProfileCard(chat);
  });
};

async function expectProfileCardPositionedFromAnchor(
  profileCard: Locator,
  anchorRect: { left: number; right: number; top: number }
): Promise<void> {
  const position = await profileCard.evaluate((element, anchor) => {
    const margin = 8;
    const cardRect = element.getBoundingClientRect();
    let expectedLeft = anchor.right + margin;
    if (expectedLeft + cardRect.width + margin > window.innerWidth) {
      expectedLeft = anchor.left - cardRect.width - margin;
    }

    let expectedTop = anchor.top;
    if (expectedTop + cardRect.height + margin > window.innerHeight) {
      expectedTop = window.innerHeight - cardRect.height - margin;
    }

    return {
      actualLeft: Math.round(cardRect.left),
      actualTop: Math.round(cardRect.top),
      expectedLeft: Math.max(margin, Math.round(expectedLeft)),
      expectedTop: Math.max(margin, Math.round(expectedTop))
    };
  }, anchorRect);

  expect(
    position.actualLeft,
    'Nested profile card should use the clicked mention’s x position.'
  ).toBe(position.expectedLeft);
  expect(
    position.actualTop,
    'Nested profile card should use the clicked mention’s y position.'
  ).toBe(position.expectedTop);
}

interface MessageSource {
  authorName: string;
  channelId: string;
  messageId: string;
  messageText: string;
  targetId: string;
}

const PROFILE_TARGET_ATTRIBUTE = 'data-ytcq-browser-profile-target';
let nextProfileTargetId = 0;

async function openStableProfileCardFromRecentMessage(chat: ChatSurface): Promise<MessageSource> {
  return test.step('Open recent-message profile card from a stable avatar', async () => {
    const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR);
    await messages.last().waitFor({ state: 'visible', timeout: 45_000 });

    const count = await messages.count();
    const firstCandidate = Math.max(0, count - 20);
    for (let index = count - 1; index >= firstCandidate; index -= 1) {
      const targetId = await freezeProfileMessageTarget(messages.nth(index)).catch(() => '');
      if (!targetId) continue;
      const sourceMessage = chat
        .locator(`[${PROFILE_TARGET_ATTRIBUTE}="${escapeCssString(targetId)}"]`)
        .first();
      await centerLocatorInViewport(sourceMessage);

      const sourceBeforeClick = await readProfileMessageSource(sourceMessage, targetId);
      if (!sourceBeforeClick) continue;

      const avatar = sourceMessage.locator('#author-photo').first();
      if (!(await avatar.isVisible({ timeout: 500 }).catch(() => false))) continue;

      await avatar.click({ timeout: 2_000 }).catch(() => undefined);
      const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
      if (!(await profileCard.isVisible({ timeout: 5_000 }).catch(() => false))) continue;

      const sourceAfterClick = await readProfileMessageSource(sourceMessage, targetId);
      const cardAuthor = cleanVisibleText(
        await profileCard
          .locator('.ytcq-profile-card-title')
          .innerText()
          .catch(() => '')
      );
      if (
        sourceAfterClick &&
        cardAuthor === sourceAfterClick.authorName &&
        isSameProfileMessageSource(sourceBeforeClick, sourceAfterClick)
      ) {
        return sourceAfterClick;
      }

      await closeProfileCardIfPresent(chat);
    }

    throw new Error('Could not open a profile card from a stable recent message.');
  });
}

async function readProfileMessageSource(
  message: Locator,
  targetId: string
): Promise<MessageSource | null> {
  const authorName = cleanVisibleText(
    await message
      .locator('#author-name')
      .first()
      .innerText()
      .catch(() => '')
  );
  const messageText = await getRichVisibleText(message.locator('#message').first()).catch(() => '');
  if (!authorName || !messageText || !hasMeaningfulText(messageText)) return null;

  const channelId = await message
    .evaluate((element) => {
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
    })
    .catch(() => '');
  const messageId = (await message.getAttribute('id').catch(() => '')) || '';

  return {
    authorName,
    channelId,
    messageId,
    messageText,
    targetId
  };
}

async function freezeProfileMessageTarget(message: Locator): Promise<string> {
  const targetId = `profile-card-${Date.now()}-${nextProfileTargetId++}`;
  const didFreeze = await message.evaluate(
    (element, { attribute, value }) => {
      if (!(element instanceof HTMLElement) || !element.isConnected) return false;
      element.setAttribute(attribute, value);
      return true;
    },
    {
      attribute: PROFILE_TARGET_ATTRIBUTE,
      value: targetId
    }
  );

  if (!didFreeze)
    throw new Error('Could not stabilize the live chat profile target before clicking it.');
  return targetId;
}

function isSameProfileMessageSource(first: MessageSource, second: MessageSource): boolean {
  const messageIdMatches =
    !first.messageId || !second.messageId || first.messageId === second.messageId;
  return (
    messageIdMatches &&
    first.authorName === second.authorName &&
    first.channelId === second.channelId &&
    first.messageText === second.messageText &&
    first.targetId === second.targetId
  );
}

async function expectProfileCardHasRecentMessages(
  chat: ChatSurface,
  source: MessageSource
): Promise<void> {
  await test.step('Verify profile card shows recent messages for the clicked author', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard.locator('.ytcq-profile-card-title')).toContainText(source.authorName);
    await expect(await getProfileCardRecord(chat, source)).toBeVisible();
  });
}

async function expectProfileAvatarRingToggle(
  chat: ChatSurface,
  source: MessageSource
): Promise<void> {
  await test.step('Add and remove an avatar ring from the profile header', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    const toggle = profileCard.locator('.ytcq-avatar-ring-toggle');
    const sourceAvatar = getSourceMessage(chat, source).locator('#author-photo').first();

    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('title', /Forget user\nUser remembered .+/);
    await expect(sourceAvatar).toHaveClass(/ytcq-avatar-ring-active/);

    await profileCard.locator('.ytcq-profile-card-title').hover();
    await expect
      .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe('rgba(0, 0, 0, 0)');
    await toggle.hover();
    await expect
      .poll(() => toggle.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe('rgba(0, 0, 0, 0)');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(sourceAvatar).not.toHaveClass(/ytcq-avatar-ring-active/);
  });
}

async function appendAuthorMessageAndVerifyProfileCardUpdates(
  chat: ChatSurface,
  source: MessageSource
): Promise<void> {
  await test.step('Append a new author message and verify the card updates', async () => {
    const text = `Profile follow-up ${Date.now()}`;
    await appendMockFixtureMessage(chat, {
      author: source.authorName,
      channel: source.channelId || undefined,
      text
    });

    await expect(
      chat
        .locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message')
        .filter({
          hasText: text
        })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
}

async function expectProfileChannelButtonOpensChannel(
  chat: ChatSurface,
  context: BrowserContext
): Promise<void> {
  const youtubeProfileUrlPattern = '**://www.youtube.com/**';
  await test.step('Click profile channel button and verify it opens YouTube', async () => {
    if (isMockPageSurface(chat)) {
      await context.route(youtubeProfileUrlPattern, (route) =>
        route.fulfill({
          body: '<!doctype html><title>Mock channel</title>',
          contentType: 'text/html',
          status: 200
        })
      );
    }

    try {
      const popupPromise = context.waitForEvent('page');
      await chat.locator('.ytcq-profile-card-channel').click();
      const popup = await popupPromise;

      try {
        await expect
          .poll(async () => getOpenedProfileUrl(popup.url()), {
            message: 'Profile channel button should open the selected author channel.',
            timeout: isMockPageSurface(chat) ? 5_000 : 15_000
          })
          .toMatch(/^https:\/\/www\.youtube\.com\/(?:@|channel\/)/);
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

async function expectProfileCardJumpToMessage(
  chat: ChatSurface,
  source: MessageSource
): Promise<void> {
  await test.step('Jump from profile card record back to the live message', async () => {
    const sourceMessage = getSourceMessage(chat, source);
    const record = await getProfileCardRecord(chat, source);

    await centerLocatorInViewport(record);
    const jumpButton = record.locator('.ytcq-profile-card-jump');
    await jumpButton.focus();
    await expect(jumpButton).toHaveCSS('opacity', '1');
    await jumpButton.press('Enter');
    await expect(sourceMessage).toHaveClass(/ytcq-message-jump-target/, { timeout: 2_000 });
  });
}

async function getProfileCardRecord(chat: ChatSurface, source: MessageSource): Promise<Locator> {
  if (source.messageId) {
    const liveMessageRecord = chat
      .locator(
        `.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message[data-ytcq-live-message-id="${escapeCssString(source.messageId)}"]`
      )
      .first();
    if (await liveMessageRecord.count()) return liveMessageRecord;
  }

  const records = chat.locator(
    '.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message'
  );

  await expect
    .poll(async () => findProfileCardRecordIndex(records, source.messageText), {
      message: 'Profile card should contain the exact recent message record.',
      timeout: 10_000
    })
    .toBeGreaterThanOrEqual(0);

  const index = await findProfileCardRecordIndex(records, source.messageText);
  return records.nth(index);
}

async function findProfileCardRecordIndex(records: Locator, expectedText: string): Promise<number> {
  const count = await records.count();

  for (let index = 0; index < count; index += 1) {
    const text = await getRichVisibleText(
      records.nth(index).locator('.ytcq-profile-card-message-text').first(),
      {
        ignoredSelector: '.ytcq-translation, .ytcq-replaced-translation-icon'
      }
    ).catch(() => '');
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

async function closeProfileCardIfPresent(chat: ChatSurface): Promise<void> {
  const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
  if (!(await profileCard.isVisible({ timeout: 500 }).catch(() => false))) return;

  await profileCard
    .locator('.ytcq-profile-card-close')
    .click()
    .catch(() => undefined);
  await expect(profileCard)
    .toHaveCount(0, { timeout: 2_000 })
    .catch(() => undefined);
}

function getSourceMessage(
  chat: ChatSurface,
  source: MessageSource
): ReturnType<ChatSurface['locator']> {
  if (source.targetId) {
    return chat
      .locator(`[${PROFILE_TARGET_ATTRIBUTE}="${escapeCssString(source.targetId)}"]`)
      .first();
  }

  if (source.messageId) {
    return chat
      .locator(`${NORMAL_CHAT_MESSAGE_SELECTOR}[id="${escapeCssString(source.messageId)}"]`)
      .first();
  }

  return chat
    .locator(NORMAL_CHAT_MESSAGE_SELECTOR)
    .filter({
      has: chat.locator('#author-name').filter({ hasText: source.authorName })
    })
    .filter({
      has: chat.locator('#message').filter({ hasText: source.messageText })
    })
    .last();
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
