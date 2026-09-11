/**
 * Browser scenarios for YouTube menu injection.
 *
 * Mock and live specs both open the visible YouTube menu buttons, then assert
 * that the extension injected its controls into the resulting menu.
 */
import { expect, test, type Locator } from '@playwright/test';
import {
  closeOpenMenus,
  openChatEnhancerMenu,
  openMessageMenu,
  openSettingsMenu
} from '../support/menu-openers';
import type { BrowserScenario, ChatSurface } from './types';

export const settingsMenuScenario: BrowserScenario = async ({ chat, page }) => {
  const menu = await openSettingsMenu(chat);
  const entry = menu.locator('[data-ytcq-action="chat-enhancer"]');
  const nativeRows = menu.locator('#items > :not(.ytcq-settings-item)');
  const nativeCount = await nativeRows.count();
  await expect(menu.locator('.ytcq-settings-item:visible')).toHaveCount(1);
  await expect(entry).toHaveText('Chat Enhancer');
  const nativeRow = (await nativeRows.first().boundingBox())!;
  const labelColor = await entry.locator('.ytcq-paper-item').evaluate(element => getComputedStyle(element).color);
  await expect(entry.locator('.ytcq-submenu-chevron')).toHaveCSS('fill', labelColor);
  await entry.press('Enter');
  await expectSettingsMenuControlsInjected(menu);
  const backRow = (await menu.locator('[data-ytcq-action="settings-back"]').boundingBox())!;
  expect(backRow.height).toBeCloseTo(nativeRow.height, 0);
  expect(backRow.y).toBeCloseTo(nativeRow.y, 0);
  await expect(nativeRows.first()).toBeHidden();
  const translate = menu.locator('[data-ytcq-setting="targetLanguage"] .ytcq-paper-item');
  await expect(translate).toBeFocused();
  await translate.press('ArrowDown');
  const sound = menu.locator('[data-ytcq-setting="sound"] .ytcq-paper-item');
  await expect(sound).toBeFocused();
  await sound.press('Escape');
  await expect(entry).toBeVisible();
  await expect(nativeRows).toHaveCount(nativeCount);
  await expect(nativeRows.first()).toBeVisible();
  await entry.press('ArrowRight');
  await expect(translate).toBeVisible();
  await menu.locator('[data-ytcq-action="settings-back"]').click();
  await expect(entry).toBeVisible();
  await entry.click();
  await closeNativeMenuStep(chat, 'Close settings menu');
  const reopened = await openSettingsMenu(chat);
  await expect(reopened.locator('.ytcq-settings-item:visible')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reopened.locator('[data-ytcq-action="chat-enhancer"]').click();
  expect(await reopened.locator('#items').evaluate(list => list.getAnimations().length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await closeNativeMenuStep(chat, 'Close reopened settings menu');
};

export const settingsMenuButtonTargetScenario: BrowserScenario = async ({ chat }) => {
  await test.step('Keep the settings button off-center inside its header container', async () => {
    await chat.locator('#live-chat-header-context-menu').evaluate((element) => {
      (element as HTMLElement).style.paddingRight = '80px';
    });
  });

  const menu = await openChatEnhancerMenu(chat);
  await expectSettingsMenuControlsInjected(menu);
  await closeNativeMenuStep(chat, 'Close settings menu');
};

export const messageMenuScenario: BrowserScenario = async ({ chat }) => {
  const { menu } = await openMessageMenu(chat);
  await expectMessageMenuActionsInjected(menu);
  await closeNativeMenuStep(chat, 'Close message context menu');
};

export const nativeMenuStacksAboveExtensionPanelScenario: BrowserScenario = async ({
  chat,
  page
}) => {
  await chat.locator('.ytcq-inbox-button').click();
  const panel = chat.locator('.ytcq-inbox-card');
  await expect(panel).toBeVisible();

  try {
    const grip = panel.locator('.ytcq-panel-drag-grip');
    const gripBox = await grip.boundingBox();
    if (!gripBox) throw new Error('Inbox drag grip is not visible.');
    const gripCenterX = gripBox.x + gripBox.width / 2;
    const gripCenterY = gripBox.y + gripBox.height / 2;
    await page.mouse.move(gripCenterX, gripCenterY);
    await page.mouse.down();
    await page.mouse.move(gripCenterX + 4, gripCenterY + 4);
    await page.mouse.up();

    await panel.evaluate((element) => {
      Object.assign((element as HTMLElement).style, {
        bottom: 'auto',
        height: '260px',
        left: 'auto',
        right: '16px',
        top: '64px',
        transform: '',
        width: '340px'
      });
    });

    const menu = await openSettingsMenu(chat);
    await expect.poll(async () => menu.evaluate((menuElement) => {
      const panelElement = document.querySelector<HTMLElement>('.ytcq-inbox-card');
      if (!panelElement) return { nativeMenuOnTop: false, overlaps: false };

      const menuRect = menuElement.getBoundingClientRect();
      const panelRect = panelElement.getBoundingClientRect();
      const left = Math.max(menuRect.left, panelRect.left);
      const right = Math.min(menuRect.right, panelRect.right);
      const top = Math.max(menuRect.top, panelRect.top);
      const bottom = Math.min(menuRect.bottom, panelRect.bottom);
      if (right <= left || bottom <= top) {
        return { nativeMenuOnTop: false, overlaps: false };
      }

      const topElement = document.elementFromPoint(
        left + (right - left) / 2,
        top + (bottom - top) / 2
      );
      return {
        nativeMenuOnTop: Boolean(topElement && (
          topElement === menuElement || menuElement.contains(topElement)
        )),
        overlaps: true
      };
    }), {
      message: 'Expected the native YouTube menu to cover the overlapping extension panel.'
    }).toEqual({ nativeMenuOnTop: true, overlaps: true });
  } finally {
    await closeOpenMenus(chat);
    if (await panel.count()) {
      await panel.locator('.ytcq-profile-card-close').click();
      await expect(panel).toHaveCount(0);
    }
  }
};

export async function expectSettingsMenuControlsInjected(menu: Locator): Promise<void> {
  await test.step('Verify Translate setting is injected', async () => {
    await expect(menu.locator('.ytcq-settings-item').filter({ hasText: 'Translate' })).toBeVisible();
  });

  await test.step('Verify alert sounds setting is injected', async () => {
    await expect(menu.locator('.ytcq-settings-item').filter({ hasText: 'Alert sounds' })).toBeVisible();
  });

  await test.step('Verify extension settings are inside the visible menu area', async () => {
    await expect.poll(async () => menu.evaluate((element) => {
      const list = element.querySelector<HTMLElement>('#items');
      const items = Array.from(element.querySelectorAll<HTMLElement>('.ytcq-settings-submenu-item'));
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

export async function expectMessageMenuActionsInjected(menu: Locator): Promise<void> {
  await test.step('Verify Save is absent from the message menu', async () => {
    await expect(menu.locator('[data-ytcq-action="save-message"]')).toHaveCount(0);
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
