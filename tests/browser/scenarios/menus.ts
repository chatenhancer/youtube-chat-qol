/**
 * Browser scenarios for YouTube menu injection.
 *
 * Mock and live specs both open the visible YouTube menu buttons, then assert
 * that the extension injected its controls into the resulting menu.
 */
import { expect, test, type Locator } from '@playwright/test';
import {
  openMessageMenu,
  openSettingsMenu
} from '../support/menu-openers';
import type { BrowserScenario, ChatSurface } from './types';

export const settingsMenuScenario: BrowserScenario = async ({ chat }) => {
  const menu = await openSettingsMenu(chat);
  await expectSettingsMenuControlsInjected(menu);
  await closeNativeMenuStep(chat, 'Close settings menu');
};

export const messageMenuScenario: BrowserScenario = async ({ chat }) => {
  const { menu } = await openMessageMenu(chat);
  await expectMessageMenuActionsInjected(menu);
  await closeNativeMenuStep(chat, 'Close message context menu');
};

async function expectSettingsMenuControlsInjected(menu: Locator): Promise<void> {
  await test.step('Verify Translate chat setting is injected', async () => {
    await expect(menu.locator('.ytcq-settings-item').filter({ hasText: 'Translate chat' })).toBeVisible();
  });

  await test.step('Verify Inbox sound setting is injected', async () => {
    await expect(menu.locator('.ytcq-settings-item').filter({ hasText: 'Inbox sound' })).toBeVisible();
  });

  await test.step('Verify extension settings are inside the visible menu area', async () => {
    await expect.poll(async () => menu.evaluate((element) => {
      const list = element.querySelector<HTMLElement>('#items');
      const items = Array.from(element.querySelectorAll<HTMLElement>('.ytcq-settings-item'));
      if (!list || items.length < 2) return false;

      const bounds = list.getBoundingClientRect();
      return items.every((item) => {
        const rect = item.getBoundingClientRect();
        return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
      });
    }), {
      message: 'Expected extension settings rows to be visible without scrolling the native menu.'
    }).toBe(true);
  });
}

async function expectMessageMenuActionsInjected(menu: Locator): Promise<void> {
  await test.step('Verify Mark action is injected', async () => {
    const markAction = menu.locator('.ytcq-context-item[data-ytcq-action="mark-user"]').first();
    await expect(markAction).toBeVisible();
    await expect(markAction.locator('.ytcq-menu-label')).toHaveText(/^(Mark|Unmark)$/);
  });

  await test.step('Verify split Quote and Mention actions are injected', async () => {
    const splitActions = menu.locator('.ytcq-context-item[data-ytcq-action="reply-actions"]').first();
    await expect(splitActions).toBeVisible();
    await expect(splitActions.locator('.ytcq-context-split-button[data-ytcq-action="quote"]')).toBeVisible();
    await expect(splitActions.locator('.ytcq-context-split-button[data-ytcq-action="mention"]')).toBeVisible();
  });
}

async function closeNativeMenuStep(chat: ChatSurface, stepName: string): Promise<void> {
  await test.step(stepName, async () => {
    await closeNativeMenu(chat);
  });
}

async function closeNativeMenu(chat: ChatSurface): Promise<void> {
  await chat.locator('body').press('Escape').catch(() => undefined);
}
