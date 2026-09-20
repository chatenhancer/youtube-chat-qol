/** Browser coverage for compact chat message density. */
import { expect, test, type Locator } from '@playwright/test';
import {
  setExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { requireControlledChat } from '../support/controlled-chat';
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
