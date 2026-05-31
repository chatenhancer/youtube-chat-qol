/**
 * Menu opener helpers for browser scenarios.
 *
 * Mock and live tests use the same visible YouTube selectors here. The mock
 * fixture provides just enough menu behavior for those clicks to create a
 * native-looking menu node, so scenarios do not need fixture-specific hooks.
 */
import { expect, test, type Locator } from '@playwright/test';
import {
  NORMAL_CHAT_MESSAGE_SELECTOR,
  type ChatSurface
} from './types';

const MENU_POPUP_SELECTOR = 'ytd-menu-popup-renderer';
const SETTINGS_MENU_MARKER_SELECTOR = 'yt-live-chat-toggle-renderer, .ytcq-settings-item';
const MESSAGE_MENU_MARKER_SELECTOR = [
  'ytd-menu-service-item-renderer',
  'ytd-menu-navigation-item-renderer',
  '.ytcq-context-item'
].join(',');

export async function openSettingsMenu(chat: ChatSurface): Promise<Locator> {
  await test.step('Click chat settings menu button', async () => {
    await closeOpenMenus(chat);
    await resetOuterPageScroll(chat);
    const menuButton = chat.locator([
      'yt-live-chat-header-renderer #live-chat-header-context-menu button',
      'yt-live-chat-header-renderer #live-chat-header-context-menu yt-icon-button',
      'yt-live-chat-header-renderer #live-chat-header-context-menu'
    ].join(',')).first();
    await menuButton.click({ timeout: 10_000 });
  });

  return test.step('Wait for native settings menu popup', async () => waitForVisibleMenu(
    chat,
    SETTINGS_MENU_MARKER_SELECTOR,
    'native settings menu popup',
    10_000
  ));
}

export async function openMessageMenu(chat: ChatSurface): Promise<Locator> {
  await test.step('Close any open native menus', async () => {
    await closeOpenMenus(chat);
  });

  await test.step('Find a visible message with a menu button', async () => {
    const messages = chat.locator(NORMAL_CHAT_MESSAGE_SELECTOR).filter({
      has: chat.locator('#menu')
    });
    await messages.last().waitFor({ state: 'visible', timeout: 45_000 });
  });

  return test.step('Click a message menu button', async () => {
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
        const openedMenu = await waitForVisibleMenu(
          chat,
          MESSAGE_MENU_MARKER_SELECTOR,
          'message context menu popup',
          1_000
        ).catch(() => null);
        if (openedMenu) return openedMenu;
        await menuTarget.dispatchEvent('click').catch(() => undefined);
        const dispatchedMenu = await waitForVisibleMenu(
          chat,
          MESSAGE_MENU_MARKER_SELECTOR,
          'message context menu popup',
          1_000
        ).catch(() => null);
        if (dispatchedMenu) return dispatchedMenu;
        await closeOpenMenus(chat);
      }
    }

    throw new Error('Could not open a real YouTube message context menu from recent visible chat rows.');
  });
}

async function closeOpenMenus(chat: ChatSurface): Promise<void> {
  await chat.locator('body').press('Escape').catch(() => undefined);
}

async function resetOuterPageScroll(chat: ChatSurface): Promise<void> {
  await chat.locator('body').evaluate(() => {
    try {
      window.parent?.scrollTo(0, 0);
    } catch {
      // Live chat may be isolated differently by the browser; normal click
      // actionability still protects us from clicking through top-page chrome.
    }
  }).catch(() => undefined);
}

async function waitForVisibleMenu(
  chat: ChatSurface,
  markerSelector: string,
  menuDescription: string,
  timeout: number
): Promise<Locator> {
  await expect.poll(async () => {
    const menu = await findVisibleMenu(chat, markerSelector);
    return menu !== null;
  }, {
    message: `Expected ${menuDescription} to become visible.`,
    timeout
  }).toBe(true);

  const menu = await findVisibleMenu(chat, markerSelector);
  if (!menu) {
    throw new Error(`Expected ${menuDescription} to be visible, but only hidden or unrelated menu nodes were found.`);
  }

  return menu;
}

async function findVisibleMenu(chat: ChatSurface, markerSelector: string): Promise<Locator | null> {
  const menus = chat.locator(MENU_POPUP_SELECTOR).filter({
    has: chat.locator(markerSelector)
  });
  const count = await menus.count();

  for (let index = count - 1; index >= 0; index -= 1) {
    const menu = menus.nth(index);
    if (
      await menu.isVisible().catch(() => false) &&
      await hasUsableMenuBox(menu)
    ) {
      return menu;
    }
  }

  return null;
}

// YouTube can leave collapsed popup shells in the DOM near chat edges; those
// are technically visible to Playwright but cannot receive a real user click.
async function hasUsableMenuBox(menu: Locator): Promise<boolean> {
  return menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width >= 48 && rect.height >= 24;
  }).catch(() => false);
}
