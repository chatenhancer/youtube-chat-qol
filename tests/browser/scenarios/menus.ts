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
} from './menu-openers';
import type { BrowserScenario, ChatSurface } from './types';

export const settingsMenuScenario: BrowserScenario = {
  name: 'Chat settings menu receives extension controls',
  run: async ({ chat }) => {
    const menu = await openSettingsMenu(chat);
    await expectSettingsMenuControlsInjected(menu);
    await closeNativeMenuStep(chat, 'Close settings menu');
  }
};

export const messageMenuScenario: BrowserScenario = {
  name: 'Message context menu receives quote and mention actions',
  run: async ({ chat }) => {
    const menu = await openMessageMenu(chat);
    await expectMessageMenuActionsInjected(menu);
    await closeNativeMenuStep(chat, 'Close message context menu');
  }
};

async function expectSettingsMenuControlsInjected(menu: Locator): Promise<void> {
  await test.step('Verify Translate chat setting is injected', async () => {
    await expect(menu.locator('.ytcq-settings-item').filter({ hasText: 'Translate chat' })).toBeVisible();
  });

  await test.step('Verify Inbox sound setting is injected', async () => {
    await expect(menu.locator('.ytcq-settings-item').filter({ hasText: 'Inbox sound' })).toBeVisible();
  });
}

async function expectMessageMenuActionsInjected(menu: Locator): Promise<void> {
  await test.step('Verify Quote action is injected', async () => {
    await expect(menu.locator('.ytcq-context-item').filter({ hasText: 'Quote' })).toBeVisible();
  });

  await test.step('Verify Mention action is injected', async () => {
    await expect(menu.locator('.ytcq-context-item').filter({ hasText: 'Mention' })).toBeVisible();
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
