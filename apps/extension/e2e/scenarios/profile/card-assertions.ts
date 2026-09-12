/** Profile-card interactions and user-visible assertions. */
import { expect, test, type BrowserContext, type Locator } from '@playwright/test';
import type { ControlledChat } from '../../support/controlled-chat';
import {
  centerLocatorInViewport,
  expectClassAddedDuringAction
} from '../../support/locator';
import { isMockPageSurface } from '../../support/mock-page';
import type { ChatSurface } from '../types';
import {
  getProfileCardRecord,
  getProfileSourceMessage,
  type ProfileMessageSource
} from './card-fixture';

export async function expectProfileCardPositionedFromAnchor(
  profileCard: Locator,
  anchorRect: { left: number; right: number; top: number }
): Promise<void> {
  await expect
    .poll(
      async () =>
        profileCard.evaluate((element, anchor) => {
          const anchorGap = 8;
          const cardRect = element.getBoundingClientRect();
          let expectedLeft = anchor.right + anchorGap;
          if (expectedLeft + cardRect.width > window.innerWidth) {
            expectedLeft = anchor.left - cardRect.width - anchorGap;
          }

          let expectedTop = anchor.top;
          if (expectedTop + cardRect.height > window.innerHeight) {
            expectedTop = window.innerHeight - cardRect.height;
          }

          return {
            x: Math.round(cardRect.left) - Math.max(0, Math.round(expectedLeft)),
            y: Math.round(cardRect.top) - Math.max(0, Math.round(expectedTop))
          };
        }, anchorRect),
      {
        message: 'Nested profile card should settle at the clicked mention’s position.'
      }
    )
    .toEqual({ x: 0, y: 0 });
}

export async function expectProfileCardHasRecentMessages(
  chat: ChatSurface,
  source: ProfileMessageSource
): Promise<void> {
  await test.step('Verify profile card shows recent messages for the clicked author', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    await expect(profileCard.locator('.ytcq-profile-card-title')).toContainText(source.authorName);
    await expect(await getProfileCardRecord(chat, source)).toBeVisible();
    await profileCard.locator('.ytcq-profile-card-avatar-button').hover();
    const openIcon = profileCard.locator('.ytcq-profile-card-avatar-open-icon');
    await expect(openIcon).toHaveCSS('opacity', '1');
    await expect(openIcon.locator('path')).toHaveCSS('stroke', 'rgb(255, 255, 255)');
  });
}

export async function expectProfileAvatarRingToggle(
  chat: ChatSurface,
  source: ProfileMessageSource
): Promise<void> {
  await test.step('Add and remove an avatar ring from the profile header', async () => {
    const profileCard = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
    const toggle = profileCard.locator('.ytcq-avatar-ring-toggle');
    const sourceMessage = getProfileSourceMessage(chat, source);
    const sourceAvatar = sourceMessage.locator('#author-photo').first();
    const sourceAuthor = sourceMessage.locator('#author-name').first();
    const profileAuthor = profileCard.locator('.ytcq-profile-card-author');
    const initialAuthorColors = isMockPageSurface(chat)
      ? {
          profile: await profileAuthor.evaluate((element) => getComputedStyle(element).color),
          source: await sourceAuthor.evaluate((element) => getComputedStyle(element).color)
        }
      : null;

    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveAttribute('title', /Remove user bookmark\nUser bookmarked .+/);
    await expect(sourceAvatar).toHaveClass(/ytcq-avatar-ring-active/);
    await expect(sourceAuthor).toHaveClass(/ytcq-remembered-author-active/);
    await expect(profileAuthor).toHaveClass(/ytcq-remembered-author-active/);
    if (initialAuthorColors) {
      await expect(sourceAuthor).not.toHaveCSS('color', initialAuthorColors.source);
      await expect(profileAuthor).not.toHaveCSS('color', initialAuthorColors.profile);
    }

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
    await expect(sourceAuthor).not.toHaveClass(/ytcq-remembered-author-active/);
    await expect(profileAuthor).not.toHaveClass(/ytcq-remembered-author-active/);
    if (initialAuthorColors) {
      await expect(sourceAuthor).toHaveCSS('color', initialAuthorColors.source);
      await expect(profileAuthor).toHaveCSS('color', initialAuthorColors.profile);
    }
  });
}

export async function deliverAuthorMessageAndVerifyProfileCardUpdates(
  chat: ChatSurface,
  controlledChat: ControlledChat,
  source: ProfileMessageSource
): Promise<void> {
  await test.step('Deliver a new author message and verify the card updates', async () => {
    const text = `Profile follow-up ${Date.now()}`;
    await controlledChat.injectMessage({
      author: source.authorName,
      channel: source.channelId || undefined,
      text
    });

    await expect(
      chat
        .locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message')
        .filter({ hasText: text })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
}

export async function expectProfileChannelButtonOpensChannel(
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
      const channelButton = chat.locator('.ytcq-profile-card-channel');
      // Do not spend the popup timeout waiting for the button to become
      // actionable. Await both operations so click failures are handled too.
      await channelButton.click({ trial: true });
      const [popup] = await Promise.all([
        context.waitForEvent('page'),
        channelButton.click()
      ]);

      try {
        await expect
          .poll(async () => getOpenedProfileUrl(popup.url()), {
            message: 'Profile channel button should open the selected author channel.',
            timeout: isMockPageSurface(chat) ? 5_000 : 15_000
          })
          .toMatch(/^https:\/\/www\.youtube\.com\/(?:@|channel\/)/);
        await expect(
          chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)')
        ).toBeVisible();
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

export async function expectProfileCardJumpToMessage(
  chat: ChatSurface,
  source: ProfileMessageSource
): Promise<void> {
  await test.step('Jump from profile card record back to the live message', async () => {
    const sourceMessage = getProfileSourceMessage(chat, source);
    const record = await getProfileCardRecord(chat, source);

    await centerLocatorInViewport(record);
    const jumpButton = record.locator('.ytcq-profile-card-jump');
    await jumpButton.focus();
    await expect(jumpButton).toHaveCSS('opacity', '1');
    await expectClassAddedDuringAction(
      sourceMessage,
      'ytcq-message-jump-target',
      () => jumpButton.press('Enter')
    );
  });
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
