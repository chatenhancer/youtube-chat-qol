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
export const settingsMenuScenario: BrowserScenario = async ({ chat }) => {
  const nativeMenu = await openSettingsMenu(chat);
  await expect(nativeMenu.locator('.ytcq-settings-item')).toHaveCount(0);
  const nativeRow = (await nativeMenu.locator('#items > *').first().boundingBox())!;
  await closeOpenMenus(chat);
  const button = chat.locator('.ytcq-settings-button');
  await expect(button).toHaveCount(1);
  await button.hover();
  await expect(chat.locator('.ytcq-settings-menu')).toHaveCount(0);
  await button.press('Enter');
  const menu = chat.locator('.ytcq-settings-menu');
  await expectSettingsMenuControlsInjected(menu);
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.locator('[data-ytcq-action="settings-back"]')).toHaveCount(0);
  const translate = menu.locator('[data-ytcq-setting="targetLanguage"]');
  await expect(translate).toBeFocused();
  const settingRowHeights = await menu.locator('[data-ytcq-setting]').evaluateAll(rows =>
    rows.map(row => row.getBoundingClientRect().height)
  );
  for (const height of settingRowHeights) expect(height).toBeCloseTo(nativeRow.height, 0);
  await translate.press('ArrowDown');
  const sound = menu.locator('[data-ytcq-setting="sound"]');
  await expect(sound).toBeFocused();
  await sound.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.press('ArrowDown');
  await expect(translate).toBeFocused();
  await button.click();
  await expect(menu).toHaveCount(0);
  await button.click();
  await chat.locator('#live-chat-header-context-menu').getByRole('button').click();
  await expect(menu).toHaveCount(0);
  await expect(nativeMenu).toBeVisible();
  await expect(nativeMenu.locator('.ytcq-settings-item')).toHaveCount(0);
  await closeOpenMenus(chat);
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
      const items = Array.from(element.querySelectorAll<HTMLElement>('.ytcq-settings-item'));
      if (items.length < 2) return false;

      const bounds = element.getBoundingClientRect();
      return items.every((item) => {
        const rect = item.getBoundingClientRect();
        return rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1;
      });
    }), {
      message: 'Expected quick settings rows to fit inside the menu.'
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
