/** Profile interactions use sample chat data and leave real saved items alone. */
import { expect, type Locator } from '@playwright/test';
import { getExtensionStorageValues } from '../../support/extension-storage';
import type { ExtensionScenario } from '../types';
import { withOnboardingPage } from './fixture';

export const onboardingProfilePreviewScenario: ExtensionScenario = async ({ context }) => {
  await withOnboardingPage(context, async (onboarding) => {
    const savedKeys = ['ytcqAvatarRings', 'ytcqBookmarks'];
    const storedBefore = await getExtensionStorageValues(context, 'local', savedKeys);
    const messages = onboarding.locator('.preview-message');
    const card = onboarding.locator('.preview-profile-card');
    const draft = onboarding.locator('#previewDraft');
    await expect(messages).toHaveCount(3);

    for (let index = 0; index < 3; index++) {
      const message = messages.nth(index);
      const avatar = message.locator('#author-photo');
      const name = await message.locator('#author-name').innerText();
      const text = await message.locator('#message').innerText();
      await avatar.click();
      await expect(card).toBeVisible();
      await expect(card.locator('.ytcq-profile-card-title')).toHaveText(name);
      await expect(card.locator('.ytcq-profile-card-message')).toHaveCount(3);
      await expect(card.locator('.ytcq-profile-card-message-text').last()).toHaveText(text);
      await card.getByRole('button', { name: 'Remember user', exact: true }).click();
      await expect(avatar).toHaveClass(/ytcq-avatar-ring-active/u);
      await expect(message.locator('#author-name')).toHaveClass(/ytcq-remembered-author-active/u);
      const latest = card.locator('.ytcq-profile-card-message').last();
      await latest.hover();
      await latest.getByRole('button', { name: 'Bookmark', exact: true }).click();
      await expect(latest.locator('.ytcq-bookmark-toggle')).toHaveAttribute('aria-pressed', 'true');
      await card.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(avatar).toBeFocused();
      await avatar.press('Enter');
      await expect(card.getByRole('button', { name: 'Forget user', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(card.locator('.ytcq-bookmark-toggle').last()).toHaveAttribute('aria-pressed', 'true');
      await card.locator('.ytcq-profile-card-title').click();
      await expect(card).toHaveCount(0);
      await expect(draft).toHaveValue(`${name} `);
      await expect(draft).toBeFocused();
      await avatar.click();
      await card.locator('.ytcq-profile-card-message').last().press('Enter');
      await expect(draft).toHaveValue(`${name} : "${text}" `);
      await expect(card).toHaveCount(0);
      await avatar.click();
      await card.locator('.ytcq-profile-card-message').last().hover();
      await card.getByRole('button', { name: 'Jump to message', exact: true }).click();
      await expect(card).toHaveCount(0);
      await expect(message).toHaveClass(/ytcq-message-jump-target/u);
    }

    const avatar = messages.first().locator('#author-photo');
    for (const theme of ['light', 'dark'] as const) {
      await onboarding.emulateMedia({ colorScheme: theme });
      await avatar.click();
      await expect(card).toHaveCSS('color', theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(15, 15, 15)');
      await expect(card).toBeInViewport();
      await card.getByRole('button', { name: 'Close', exact: true }).press('Escape');
      await expect(avatar).toBeFocused();
    }

    await avatar.click();
    const grip = card.locator('.ytcq-panel-drag-grip');
    const before = (await card.boundingBox())!;
    const gripBounds = (await grip.boundingBox())!;
    await onboarding.mouse.move(gripBounds.x + gripBounds.width / 2, gripBounds.y + gripBounds.height / 2);
    await onboarding.mouse.down();
    await onboarding.mouse.move(gripBounds.x + gripBounds.width / 2 - 30, gripBounds.y + gripBounds.height / 2 + 20);
    await onboarding.mouse.up();
    const after = (await card.boundingBox())!;
    expect(Math.abs(after.x - before.x) + Math.abs(after.y - before.y)).toBeGreaterThan(10);
    await onboarding.locator('#onboardingLiteModeEnabled').click();
    await expect(card).toHaveCount(0);

    await onboarding.setViewportSize({ width: 390, height: 844 });
    await avatar.click();
    await expect(card).toBeInViewport();
    const mobileBounds = (await card.boundingBox())!;
    expect(mobileBounds.x).toBeGreaterThanOrEqual(0);
    expect(mobileBounds.x + mobileBounds.width).toBeLessThanOrEqual(390);
    await card.getByRole('button', { name: 'Close', exact: true }).click();
    expect(await getExtensionStorageValues(context, 'local', savedKeys)).toEqual(storedBefore);
    await draft.fill('');
  });
};

export const onboardingProfileInfoScenario: ExtensionScenario = async ({ context }) => {
  await withOnboardingPage(context, async (onboarding) => {
    const avatars = onboarding.locator('.preview-message #author-photo');
    const avatarInfo = onboarding.locator('#chatPreviewInfo');
    for (const avatar of await avatars.all()) {
      await expectAnchoredInfo(avatar, avatarInfo);
      await expect(avatarInfo).toContainText('recent messages');
    }
    const card = onboarding.locator('.preview-profile-card');
    const info = onboarding.locator('#previewProfileInfo');
    const pageCount = context.pages().length;
    for (const theme of ['light', 'dark'] as const) {
      await onboarding.emulateMedia({ colorScheme: theme });
      await avatars.first().click();
      await expect(avatarInfo).toBeHidden();
      const channel = card.getByRole('button', { name: 'Open channel', exact: true });
      await expect(channel).toBeDisabled();
      await expectAnchoredInfo(channel, info);
      await expect(info).toContainText('small window');
      const channelBounds = (await channel.boundingBox())!;
      await onboarding.mouse.click(channelBounds.x + channelBounds.width / 2, channelBounds.y + channelBounds.height / 2);
      await channel.press('Enter');
      await expect(card).toBeVisible();
      expect(context.pages()).toHaveLength(pageCount);
      await expect(onboarding.locator('#previewDraft')).toHaveValue('');
      await expectAnchoredInfo(card.locator('.ytcq-avatar-ring-toggle'), info);
      await expect(info).toContainText('highlight them in chat');
      for (const row of await card.locator('.ytcq-profile-card-message').all()) {
        await row.hover();
        await expectAnchoredInfo(row.locator('.ytcq-bookmark-toggle'), info);
        await expect(info).toContainText('Bookmarks');
      }
      const bookmark = card.locator('.ytcq-bookmark-toggle').last();
      await bookmark.click();
      await expect(bookmark).not.toHaveAttribute('title');
      await expectAnchoredInfo(card.locator('.ytcq-profile-card-jump'), info);
      await expect(info).toContainText('still in the feed');
      await expect(info).toHaveCSS('color', theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(15, 15, 15)');
      await card.getByRole('button', { name: 'Close', exact: true }).press('Shift+Tab');
      await expect(channel).toBeFocused();
      await expect(info).toBeVisible();
      await expect(channel).toHaveAttribute('aria-describedby', 'previewProfileInfo');
      await channel.press('Escape');
      await expect(info).toHaveCount(0);
    }

    // Floating cards must follow the same palette as the in-chat hints, even
    // when the system theme changes while an explanation is already open.
    for (const skin of ['aero', 'system']) {
      await onboarding.locator('#onboardingChatSkin').selectOption(skin);
      await avatars.first().click();
      await expectAnchoredInfo(card.locator('.ytcq-profile-card-channel'), info);
      for (const theme of ['dark', 'light'] as const) {
        await onboarding.emulateMedia({ colorScheme: theme });
        await expect(onboarding.locator('#chatPreview')).toHaveAttribute('data-chat-theme', theme);
        await expect(info).toHaveCSS('opacity', '1');
        await expect.poll(() => info.evaluate((element) => {
          const reference = document.querySelector('#previewInboxTooltip')!;
          return [null, '::before'].flatMap((pseudo) => {
            const actual = getComputedStyle(element, pseudo);
            const expected = getComputedStyle(reference, pseudo);
            return ['color', 'background-color', 'border-top-color', 'box-shadow']
              .filter((property) => actual.getPropertyValue(property) !== expected.getPropertyValue(property))
              .map((property) => ({ pseudo, property, actual: actual.getPropertyValue(property), expected: expected.getPropertyValue(property) }));
          });
        })).toEqual([]);
      }
      await card.getByRole('button', { name: 'Close', exact: true }).click();
    }
    await onboarding.setViewportSize({ width: 390, height: 844 });
    await onboarding.evaluate(() => { document.documentElement.dir = 'rtl'; });
    await avatars.last().click();
    await card.locator('.ytcq-profile-card-message').last().hover();
    await expectAnchoredInfo(card.locator('.ytcq-profile-card-jump'), info);
    await card.getByRole('button', { name: 'Close', exact: true }).click();
  });
};

async function expectAnchoredInfo(trigger: Locator, tooltip: Locator): Promise<void> {
  await trigger.hover();
  await expect(tooltip).toHaveCSS('opacity', '1');
  await expect(tooltip).not.toBeEmpty();
  await expect.poll(() => tooltip.evaluate((element) => {
    const anchor = document.querySelector(`[aria-describedby="${element.id}"]`)!.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const arrow = getComputedStyle(element, '::before');
    const arrowCenter = rect.left + element.clientLeft + parseFloat(arrow.left) + parseFloat(arrow.width) / 2;
    return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight &&
      Math.abs(arrowCenter - (anchor.left + anchor.width / 2)) <= 2 &&
      (rect.top >= anchor.bottom + 8 || rect.bottom <= anchor.top - 8);
  })).toBe(true);
}
