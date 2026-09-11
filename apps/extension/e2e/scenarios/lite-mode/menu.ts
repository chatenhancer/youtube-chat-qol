import { expect } from '@playwright/test';
import { closeOpenMenus, openChatEnhancerMenu } from '../../support/menu-openers';
import type { ChatSurface } from '../types';

export async function toggleLiteModeFromMenu(chat: ChatSurface): Promise<void> {
  const menu = await openChatEnhancerMenu(chat);
  await menu.locator('[data-ytcq-setting="liteModeEnabled"]').click();
  await closeOpenMenus(chat);
}

export async function expectLiteModeMenuState(chat: ChatSurface, enabled: boolean): Promise<void> {
  const menu = await openChatEnhancerMenu(chat);
  await expect(menu.locator('[data-ytcq-setting="liteModeEnabled"]')).toHaveAttribute('aria-checked', String(enabled));
  await closeOpenMenus(chat);
}
