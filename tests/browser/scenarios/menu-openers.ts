/**
 * Menu opener helpers for browser scenarios.
 *
 * Mock and live tests use the same visible YouTube selectors here. The mock
 * fixture provides just enough menu behavior for those clicks to create a
 * native-looking menu node, so scenarios do not need fixture-specific hooks.
 */
import { expect, test } from '@playwright/test';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type ChatSurface
} from './types';

export async function openSettingsMenu(chat: ChatSurface): Promise<void> {
  await test.step('Click chat settings menu button', async () => {
    await closeOpenMenus(chat);
    const menuButton = chat.locator([
      'yt-live-chat-header-renderer #live-chat-header-context-menu button',
      'yt-live-chat-header-renderer #live-chat-header-context-menu yt-icon-button',
      'yt-live-chat-header-renderer #live-chat-header-context-menu'
    ].join(',')).first();
    await menuButton.click({ force: true, timeout: 10_000 });
  });

  await test.step('Wait for native settings menu popup', async () => {
    await expect(chat.locator('ytd-menu-popup-renderer').last()).toBeVisible({ timeout: 10_000 });
  });
}

export async function openMessageMenu(chat: ChatSurface): Promise<void> {
  await test.step('Close any open native menus', async () => {
    await closeOpenMenus(chat);
  });

  await test.step('Find a visible message with a menu button', async () => {
    const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).filter({
      has: chat.locator('#menu')
    });
    await messages.last().waitFor({ state: 'visible', timeout: 45_000 });
  });

  await test.step('Click a message menu button', async () => {
    const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).filter({
      has: chat.locator('#menu')
    });
    const count = await messages.count();
    const firstCandidate = Math.max(0, count - 8);
    for (let index = count - 1; index >= firstCandidate; index -= 1) {
      const message = messages.nth(index);
      await message.scrollIntoViewIfNeeded({ timeout: 2_000 }).catch(() => undefined);
      if (!await message.isVisible({ timeout: 500 }).catch(() => false)) continue;

      await message.hover({ timeout: 2_000 }).catch(() => undefined);
      const menuTargets = [
        message.locator('#menu button').first(),
        message.locator('#menu yt-icon-button').first(),
        message.locator('#menu').first()
      ];

      for (const menuTarget of menuTargets) {
        if (!await menuTarget.isVisible({ timeout: 500 }).catch(() => false)) continue;
        await menuTarget.click({ force: true, timeout: 1_000 }).catch(() => undefined);
        if (await waitForMessageMenu(chat)) return;
        await menuTarget.dispatchEvent('click').catch(() => undefined);
        if (await waitForMessageMenu(chat)) return;
      }
    }

    throw new Error('Could not open a real YouTube message context menu from recent visible chat rows.');
  });
}

async function closeOpenMenus(chat: ChatSurface): Promise<void> {
  await chat.locator('body').press('Escape').catch(() => undefined);
}

async function waitForMessageMenu(chat: ChatSurface): Promise<boolean> {
  return chat.locator('ytd-menu-popup-renderer').last()
    .isVisible({ timeout: 1_000 })
    .catch(() => false);
}
