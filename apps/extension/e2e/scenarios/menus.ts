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
  const menu = await openChatEnhancerMenu(chat);
  await expectSettingsMenuControlsInjected(menu);
  await expect(chat.locator('.ytcq-settings-button')).toHaveCount(0);
  await expect(menu.locator('#items > :not(.ytcq-settings-grid)').first()).toBeVisible();
  await expect(menu.locator('.ytcq-settings-grid')).toHaveCount(1);
  const measurements = await menu.locator('.ytcq-settings-grid .ytcq-settings-item').evaluateAll(items =>
    items.map(item => {
      const bounds = item.getBoundingClientRect();
      const icon = item.querySelector('.ytcq-menu-icon')!.getBoundingClientRect();
      const label = item.querySelector('.ytcq-menu-label')!.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height, center: (icon.top + label.bottom - bounds.top - bounds.bottom) / 2 };
    })
  );
  for (const item of measurements) {
    expect(item.width).toBeCloseTo(measurements[0].width, 1);
    expect(item.height).toBeCloseTo(measurements[0].height, 1);
    expect(item.center).toBeCloseTo(0, 1);
  }
  const translate = menu.locator('[data-ytcq-setting="targetLanguage"]');
  await menu.locator('#items > :not(.ytcq-settings-grid)').last().press('ArrowDown');
  await expect(translate).toBeFocused();
  await translate.press('ArrowRight');
  const sound = menu.locator('[data-ytcq-setting="sound"]');
  await expect(sound).toBeFocused();
  await sound.press('Home');
  await expect(translate).toBeFocused();
  await translate.press('ArrowDown');
  await expect(menu.locator('[data-ytcq-setting="liteModeEnabled"]')).toBeFocused();
  await closeOpenMenus(chat);
  await expect(menu).not.toBeVisible();
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
