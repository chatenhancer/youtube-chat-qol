/** Browser coverage for message appearance in native and Lite feeds. */
import { expect, test, type Locator } from '@playwright/test';
import {
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { requireControlledChat } from '../support/controlled-chat';
import { openSettingsMenu } from '../support/menu-openers';
import {
  getNativeTimestampsEnabled,
  setNativeTimestampsEnabled
} from './lite-mode/real-youtube-timestamps';
import type { BrowserScenario } from './types';

export const compactMessageDensityScenario: BrowserScenario = async ({
  chat,
  context,
  controlledChat
}) => {
  await withExtensionStorageValues(
    context,
    'sync',
    { chatSkin: 'custom:aero', liteModeEnabled: false, messageDensity: 'default' },
    async () => {
      const incomingChat = requireControlledChat(controlledChat);
      const messageText = 'Compact message density check';
      await incomingChat.injectMessage({
        author: '@DensityCheck',
        text: messageText
      });

      const row = chat
        .locator('yt-live-chat-text-message-renderer')
        .filter({ hasText: messageText })
        .last();
      const avatar = row.locator('#author-photo');
      const message = row.locator('#message');
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'custom');
      await expect
        .poll(() => chat.locator('html').getAttribute('data-ytcq-message-density'))
        .toBeNull();

      const defaultMetrics = await getMessageMetrics(row, avatar, message);

      await test.step('Apply maximum compaction independently of the selected theme', async () => {
        await setExtensionStorageValues(context, 'sync', { messageDensity: 'compact' });
        await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'custom');
        await expect(chat.locator('html')).toHaveAttribute(
          'data-ytcq-message-density',
          'compact'
        );
        await expect(row).toHaveCSS('min-height', '24px');
        await expect(row).toHaveCSS('padding-top', '2px');
        await expect(row).toHaveCSS('padding-left', '12px');
        await expect(avatar).toHaveCSS('width', '20px');
        await expect(avatar).toHaveCSS('margin-right', '8px');

        const compactMetrics = await getMessageMetrics(row, avatar, message);
        expect(compactMetrics.height).toBeLessThan(defaultMetrics.height);
        expect(compactMetrics.fontFamily).toBe(defaultMetrics.fontFamily);
        expect(compactMetrics.fontSize).toBe(defaultMetrics.fontSize);
        expect(compactMetrics.textColor).toBe(defaultMetrics.textColor);
      });

      await test.step('Keep compact density in Lite mode', async () => {
        try {
          await setExtensionStorageValues(context, 'sync', { liteModeEnabled: true });
          const liteRow = chat
            .locator('.ytcq-lite-message')
            .filter({ hasText: messageText })
            .last();
          await expect(liteRow).toBeVisible({ timeout: 20_000 });
          await expect(liteRow).toHaveCSS('min-height', '24px');
          await expect(liteRow).toHaveCSS('padding-top', '2px');
          await expect(liteRow).toHaveCSS('padding-left', '12px');
          await expect(liteRow.locator('#author-photo')).toHaveCSS('width', '20px');
          await expect(liteRow.locator('#message')).toHaveCSS(
            'font-size',
            defaultMetrics.fontSize
          );
        } finally {
          await setExtensionStorageValues(context, 'sync', { liteModeEnabled: false });
        }
      });
    }
  );
};

export const minimalMessageAppearanceScenario: BrowserScenario = async ({
  chat,
  context,
  controlledChat
}) => {
  const originalDark = await chat.locator('html').evaluate(element => element.hasAttribute('dark'));
  await withExtensionStorageValues(
    context,
    'sync',
    { chatSkin: 'custom:aero', liteModeEnabled: false, messageDensity: 'default' },
    async () => {
      const incomingChat = requireControlledChat(controlledChat);
      const author = '@AppearanceViewer';
      const text = 'Minimal appearance keeps membership and verified badges';
      await incomingChat.injectMessage({
        author,
        avatarUrl: 'https://www.youtube.com/favicon.ico',
        badges: ['member', 'verified'],
        text
      });
      const membershipText = 'Badge alignment';
      await incomingChat.injectMessage({
        author: '@BadgeViewer',
        avatarUrl: 'https://www.youtube.com/favicon.ico',
        badges: ['member'],
        text: membershipText
      });
      const nativeRow = chat.locator('yt-live-chat-text-message-renderer').filter({ hasText: text }).last();
      await expect(nativeRow).toBeVisible({ timeout: 20_000 });
      const messageFontSize = await nativeRow.locator('#message').evaluate(element => getComputedStyle(element).fontSize);
      // Logged-out YouTube chat can omit the native timestamp control.
      const timestampMenu = await openSettingsMenu(chat);
      const hasTimestampSetting = await timestampMenu.locator('yt-live-chat-toggle-renderer')
        .filter({ hasText: /timestamps/i }).count() > 0;
      await chat.locator('body').press('Escape');
      const originalTimestamps = hasTimestampSetting ? await getNativeTimestampsEnabled(chat) : null;

      try {
        for (const liteModeEnabled of [false, true]) {
          await test.step(`Minimal preserves badges and actions in ${liteModeEnabled ? 'Lite' : 'native'} chat`, async () => {
            await setExtensionStorageValues(context, 'sync', { liteModeEnabled, messageDensity: 'default' });
            if (hasTimestampSetting) await setNativeTimestampsEnabled(chat, true);
            const selector = liteModeEnabled ? '.ytcq-lite-message' : 'yt-live-chat-text-message-renderer';
            const row = chat.locator(selector).filter({ hasText: text }).last();
            await expect(row).toBeVisible({ timeout: 20_000 });
            await expect(row.locator('#author-photo')).toHaveAttribute('title', `View ${author}`);
            await expect.poll(() => row.locator('#message-container').evaluate(element =>
              getComputedStyle(element, '::before').content
            )).toBe('""');
            if (hasTimestampSetting) await expect(row.locator('#timestamp')).toBeVisible();
            const timestampsVisible = await row.locator('#timestamp').isVisible();
            const authorFontSize = await row.locator('#author-name').evaluate(element => getComputedStyle(element).fontSize);
            await setExtensionStorageValues(context, 'sync', { messageDensity: 'minimal' });

            for (const dark of [false, true]) {
              await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value), dark);
              await expect(row.locator('#author-name')).toHaveCSS('font-size', '0px');
              await expect(row.locator('#timestamp')).toBeHidden();
              expect(await row.locator('#message-container').evaluate(element =>
                getComputedStyle(element, '::before').content
              )).toBe('none');
              await expect(row.locator('#author-photo')).toBeVisible();
              await expect(row.locator('#author-photo')).toHaveCSS('width', '20px');
              await expect(row.locator('#chat-badges')).toBeVisible();
              await expect(row.locator('#chip-badges')).toBeVisible();
              await expect(row.locator('#message')).toHaveCSS('font-size', messageFontSize);
              await expect(row.locator('#message')).toHaveText(text);
              await expect(row.locator('#author-name')).toContainText(author);
              expect(await row.locator('#author-name').evaluate(element => {
                return Array.from(element.childNodes).filter(node => node.nodeType === Node.TEXT_NODE)
                  .every(node => {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    return range.getBoundingClientRect().width === 0;
                  });
              })).toBe(true);
              if (liteModeEnabled) {
                const membershipRow = chat.locator(selector).filter({ hasText: membershipText }).last();
                const centers = await membershipRow.evaluate(element => {
                  const center = (selector: string) => {
                    const rect = element.querySelector(selector)!.getBoundingClientRect();
                    return rect.y + rect.height / 2;
                  };
                  return {
                    avatar: center('#author-photo'),
                    badge: center('.ytcq-lite-author-badge'),
                    message: center('#message')
                  };
                });
                expect(Math.abs(centers.badge - centers.avatar), JSON.stringify(centers)).toBeLessThanOrEqual(2);
                expect(Math.abs(centers.badge - centers.message), JSON.stringify(centers)).toBeLessThanOrEqual(2);
              }
              await test.info().attach(`minimal-${liteModeEnabled ? 'lite' : 'native'}-${dark ? 'dark' : 'light'}`, {
                body: await row.screenshot({ animations: 'disabled' }), contentType: 'image/png'
              });
            }

            // Keyboard activation keeps the Lite avatar reachable in a fast-moving live feed.
            if (liteModeEnabled) await row.locator('#author-photo').press('Enter');
            else await row.locator('#author-photo').click();
            const profile = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
            await expect(profile.locator('.ytcq-profile-card-title')).toHaveText(author);
            await expect(profile.locator('.ytcq-profile-card-title')).not.toHaveCSS('font-size', '0px');
            await profile.locator('.ytcq-profile-card-close').click();

            const incomingText = `Incoming minimal message in ${liteModeEnabled ? 'Lite' : 'native'} chat`;
            // Lite has discarded the native list that single-message ingress waits for.
            const incomingMessage = { author: '@NewAppearanceViewer', text: incomingText };
            if (liteModeEnabled) await incomingChat.injectMessages([incomingMessage]);
            else await incomingChat.injectMessage(incomingMessage);
            const incomingRow = chat.locator(selector).filter({ hasText: incomingText }).last();
            await expect(incomingRow).toBeVisible({ timeout: 20_000 });
            await expect(incomingRow.locator('#author-name')).toHaveCSS('font-size', '0px');
            await expect(incomingRow.locator('#timestamp')).toBeHidden();
            expect(await incomingRow.locator('#message-container').evaluate(element =>
              getComputedStyle(element, '::before').content
            )).toBe('none');
            await expect(incomingRow.locator('#author-photo')).toBeVisible();
            if (liteModeEnabled) await expect(incomingRow.locator('.ytcq-lite-author-chip')).toBeHidden();

            for (const messageDensity of ['compact', 'default']) {
              await setExtensionStorageValues(context, 'sync', { messageDensity });
              await expect(row.locator('#author-name')).toHaveCSS('font-size', authorFontSize);
              expect(await row.locator('#message-container').evaluate(element =>
                getComputedStyle(element, '::before').content
              )).toBe('""');
              expect(await incomingRow.locator('#message-container').evaluate(element =>
                getComputedStyle(element, '::before').content
              )).toBe('""');
              await expect(row.locator('#timestamp')).toBeVisible({ visible: timestampsVisible });
              await expect(row.locator('#chat-badges')).toBeVisible();
              await expect(row.locator('#chip-badges')).toBeVisible();
              await expect(incomingRow.locator('#author-name')).toBeVisible();
              await expect(incomingRow.locator('#timestamp')).toBeVisible({ visible: timestampsVisible });
            }

            if (hasTimestampSetting) {
              await setExtensionStorageValues(context, 'sync', { messageDensity: 'minimal' });
              await setNativeTimestampsEnabled(chat, false);
              for (const messageDensity of ['compact', 'default']) {
                await setExtensionStorageValues(context, 'sync', { messageDensity });
                await expect(row.locator('#timestamp')).toBeHidden();
                await expect(incomingRow.locator('#timestamp')).toBeHidden();
              }
            }
          });
        }
      } finally {
        if (originalTimestamps !== null) await setNativeTimestampsEnabled(chat, originalTimestamps);
        await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value), originalDark);
      }
    }
  );
};

async function getMessageMetrics(
  row: Locator,
  avatar: Locator,
  message: Locator
): Promise<{
  fontFamily: string;
  fontSize: string;
  height: number;
  textColor: string;
}> {
  const [height, avatarSize, messageText] = await Promise.all([
    row.evaluate((element) => element.getBoundingClientRect().height),
    avatar.evaluate((element) => getComputedStyle(element).width),
    message.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize
      };
    })
  ]);

  expect(Number.parseFloat(avatarSize)).toBeGreaterThan(0);
  return {
    fontFamily: messageText.fontFamily,
    fontSize: messageText.fontSize,
    height,
    textColor: messageText.color
  };
}
