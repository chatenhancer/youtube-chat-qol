/** YouTube Studio intentionally does not expose the Lite mode control. */
import { expect } from '@playwright/test';
import type { BrowserScenario } from '../types';
import { closeOpenMenus, openChatEnhancerMenu } from '../../support/menu-openers';

export const liteModeUnavailableInStudioScenario: BrowserScenario = async ({ chat }) => {
  await expect(chat.locator('.ytcq-lite-mode-button')).toHaveCount(0);
  const menu = await openChatEnhancerMenu(chat);
  await expect(menu.locator('[data-ytcq-setting="liteModeEnabled"]')).toHaveCount(0);
  await closeOpenMenus(chat);
};
