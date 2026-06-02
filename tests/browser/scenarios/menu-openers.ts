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
import {
  centerLocatorInViewport,
  clickLocatorAtCurrentCenter
} from '../helpers/locator';
import { cleanVisibleText } from '../helpers/text';

const MENU_POPUP_SELECTOR = 'ytd-menu-popup-renderer';
const SETTINGS_MENU_MARKER_SELECTOR = 'yt-live-chat-toggle-renderer, .ytcq-settings-item';
const MESSAGE_MENU_MARKER_SELECTOR = [
  'ytd-menu-service-item-renderer',
  'ytd-menu-navigation-item-renderer',
  '.ytcq-context-item[data-ytcq-action]'
].join(',');

export interface OpenedMessageMenu {
  menu: Locator;
  message: Locator;
  authorName: string;
}

export async function openSettingsMenu(chat: ChatSurface): Promise<Locator> {
  await test.step('Click chat settings menu button', async () => {
    await closeOpenMenus(chat);
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

export async function openMessageMenu(chat: ChatSurface): Promise<OpenedMessageMenu> {
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
      await centerLocatorInViewport(message);
      if (!await message.isVisible({ timeout: 500 }).catch(() => false)) continue;
      const authorName = await getMessageAuthorName(message);
      if (!authorName) continue;

      await message.hover({ timeout: 2_000 }).catch(() => undefined);
      const menuTargets = [
        message.locator('#menu button').first(),
        message.locator('#menu yt-icon-button').first(),
        message.locator('#menu').first()
      ];

      for (const menuTarget of menuTargets) {
        if (!await menuTarget.isVisible({ timeout: 500 }).catch(() => false)) continue;
        for (const activate of [
          () => clickLocatorAtCurrentCenter(menuTarget),
          () => menuTarget.press('Enter', { timeout: 1_000 }).then(() => true)
        ]) {
          await activate().catch(() => false);
          const openedMenu = await waitForVisibleMenu(
            chat,
            MESSAGE_MENU_MARKER_SELECTOR,
            'message context menu popup',
            1_000
          ).catch(() => null);
          if (openedMenu) return { menu: openedMenu, message, authorName };
          await closeOpenMenus(chat);
        }
      }
    }

    throw new Error('Could not open a real YouTube message context menu from recent visible chat rows.');
  });
}

async function closeOpenMenus(chat: ChatSurface): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const menu = await findVisibleNativeMenu(chat);
    if (!menu) return;
    await menu.press('Escape').catch(() => undefined);
    await chat.locator('body').press('Escape').catch(() => undefined);
    await menu.waitFor({ state: 'hidden', timeout: 500 }).catch(() => undefined);
  }
}

async function findVisibleNativeMenu(chat: ChatSurface): Promise<Locator | null> {
  const menus = chat.locator(MENU_POPUP_SELECTOR);
  const count = await menus.count();

  for (let index = count - 1; index >= 0; index -= 1) {
    const menu = menus.nth(index);
    const box = await menu.boundingBox().catch(() => null);
    if (
      box &&
      box.width > 0 &&
      box.height > 0 &&
      await menu.isVisible().catch(() => false)
    ) {
      return menu;
    }
  }

  return null;
}

async function getMessageAuthorName(message: Locator): Promise<string> {
  const authorName = await message.locator('#author-name').first()
    .innerText({ timeout: 500 })
    .catch(() => '');
  const cleanAuthorName = cleanAuthorNameText(authorName);
  return /^@?\S/.test(cleanAuthorName) ? cleanAuthorName : '';
}

function cleanAuthorNameText(text: string): string {
  const cleanAuthorName = cleanVisibleText(text);
  return cleanAuthorName.match(/^@[^\s]+/)?.[0] || cleanAuthorName;
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
    const rects = [
      element.getBoundingClientRect(),
      ...Array.from(element.querySelectorAll('.ytcq-context-item[data-ytcq-action]'))
        .map((child) => child.getBoundingClientRect())
    ];

    return rects.every((rect) => {
      return rect.width >= 48 &&
        rect.height >= 24 &&
        rect.top >= 0 &&
        rect.bottom <= window.innerHeight;
    });
  }).catch(() => false);
}
