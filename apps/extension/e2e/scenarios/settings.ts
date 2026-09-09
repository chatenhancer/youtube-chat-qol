/**
 * Browser scenarios for extension settings behavior.
 *
 * These checks verify that the visible YouTube and popup controls persist the
 * shared option fields that feature modules consume.
 */
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { getExtensionId } from '../support/extension';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../support/extension-storage';
import { openSettingsMenu } from '../support/menu-openers';
import { expectSettingsMenuControlsInjected } from './menus';
import type { BrowserScenario, ChatSurface } from './types';

const SETTINGS_INITIAL_VALUES = {
  composerTranslateLanguage: '',
  targetLanguage: '',
  lastTranslationTarget: 'ja',
  translationDisplay: 'replace',
  liteModeEnabled: false,
  messageDensity: 'default',
  sound: false,
  startupEffect: true
};

export const settingsMenuBehaviorScenario: BrowserScenario = async ({ chat, context }) => {
  await withExtensionStorageValues(context, 'sync', SETTINGS_INITIAL_VALUES, async () => {
    const menu = await openSettingsMenu(chat);
    await expectSettingsMenuControlsInjected(menu);
    await toggleTranslationFromChatSettings({ context, menu });
    await toggleAlertSoundsFromChatSettings({ context, menu });
    await closeNativeMenu(chat);
  });
};

export const popupSettingsBehaviorScenario: BrowserScenario = async ({ context }) => {
  await withExtensionStorageValues(context, 'sync', SETTINGS_INITIAL_VALUES, async () => {
    const popup = await openExtensionPopup(context);

    try {
      await changePopupTranslationTarget({ context, popup });
      await changePopupTranslationDisplay({ context, popup });
      await changePopupMessageDensity({ context, popup });
      await changePopupLiteMode({ context, popup });
      await changePopupAlertSounds({ context, popup });
      await changePopupStartupEffect({ context, popup });
    } finally {
      await popup.close();
    }
  });
};

async function toggleTranslationFromChatSettings({
  context,
  menu
}: {
  context: BrowserContext;
  menu: Locator;
}): Promise<void> {
  const item = menu.locator('.ytcq-settings-item[data-ytcq-setting="targetLanguage"]').first();

  await test.step('Verify Translate starts off in chat settings', async () => {
    await expect(item).toHaveAttribute('aria-checked', 'false');
  });

  await test.step('Enable Translate from chat settings', async () => {
    await item.click();
    await expectStorageValue(context, 'targetLanguage', 'ja');
    await expectStorageValue(context, 'lastTranslationTarget', 'ja');
    await expect(item).toHaveAttribute('aria-checked', 'true');
  });

  await test.step('Disable Translate from chat settings', async () => {
    await item.click();
    await expectStorageValue(context, 'targetLanguage', '');
    await expect(item).toHaveAttribute('aria-checked', 'false');
  });
}

async function toggleAlertSoundsFromChatSettings({
  context,
  menu
}: {
  context: BrowserContext;
  menu: Locator;
}): Promise<void> {
  const item = menu.locator('.ytcq-settings-item[data-ytcq-setting="sound"]').first();

  await test.step('Verify alert sounds start off in chat settings', async () => {
    await expect(item).toHaveAttribute('aria-checked', 'false');
  });

  await test.step('Enable alert sounds from chat settings', async () => {
    await item.click();
    await expectStorageValue(context, 'sound', true);
    await expect(item).toHaveAttribute('aria-checked', 'true');
  });

  await test.step('Disable alert sounds from chat settings', async () => {
    await item.click();
    await expectStorageValue(context, 'sound', false);
    await expect(item).toHaveAttribute('aria-checked', 'false');
  });
}

async function changePopupTranslationTarget({
  context,
  popup
}: {
  context: BrowserContext;
  popup: Page;
}): Promise<void> {
  await test.step('Set popup translation target', async () => {
    await expect(popup.locator('#targetLanguage')).toHaveAccessibleName(/^Chat translation\b/);
    await popup.locator('#targetLanguage').selectOption('ja');
    await expectStorageValue(context, 'targetLanguage', 'ja');
    await expectStorageValue(context, 'lastTranslationTarget', 'ja');
  });
}

async function changePopupTranslationDisplay({
  context,
  popup
}: {
  context: BrowserContext;
  popup: Page;
}): Promise<void> {
  await test.step('Set popup translation display mode', async () => {
    await expect(popup.locator('#translationDisplay')).toHaveAccessibleName(/^Translation appearance\b/);
    await popup.locator('#translationDisplay').selectOption('below');
    await expectStorageValue(context, 'translationDisplay', 'below');
  });
}

async function changePopupLiteMode({
  context,
  popup
}: {
  context: BrowserContext;
  popup: Page;
}): Promise<void> {
  await test.step('Enable Lite mode from the popup', async () => {
    await expect(popup.locator('#liteModeEnabled')).toHaveAccessibleName(/Lite mode/);
    await popup.locator('#liteModeEnabled').setChecked(true);
    await expectStorageValue(context, 'liteModeEnabled', true);
  });
}

async function changePopupMessageDensity({
  context,
  popup
}: {
  context: BrowserContext;
  popup: Page;
}): Promise<void> {
  await test.step('Set message density from the popup', async () => {
    const control = popup.locator('#messageDensity');
    await expect(control).toBeVisible();
    await expect(popup.locator('#messageDensityLabel')).toHaveText('Message density');
    await expect(control.locator('option')).toHaveText(['Default', 'Compact']);
    await control.selectOption('compact');
    await expectStorageValue(context, 'messageDensity', 'compact');
  });
}

async function changePopupAlertSounds({
  context,
  popup
}: {
  context: BrowserContext;
  popup: Page;
}): Promise<void> {
  await test.step('Set popup alert sounds option', async () => {
    await popup.locator('#sound').setChecked(true);
    await expectStorageValue(context, 'sound', true);
  });
}

async function changePopupStartupEffect({
  context,
  popup
}: {
  context: BrowserContext;
  popup: Page;
}): Promise<void> {
  await test.step('Set popup startup effect option', async () => {
    const group = popup.locator('#appearanceMoreSettingsGroup');
    const option = popup.locator('#startupEffectOption');
    const moreSettings = popup.locator('#appearanceMoreSettingsToggle');
    const control = popup.locator('#startupEffect');
    await expect(group).toBeHidden();
    await expect(moreSettings).toHaveText('Show more');
    await expect(moreSettings).toHaveAttribute('aria-expanded', 'false');
    await expect(moreSettings).toHaveAttribute('aria-controls', 'appearanceMoreSettingsGroup');
    await moreSettings.click();
    await expect(moreSettings).toHaveAttribute('aria-expanded', 'true');
    await expect(moreSettings).toBeHidden();
    await expect(group).toBeVisible();
    await expect(option).toBeVisible();
    // Verify the revealed control is usable before Playwright can scroll it.
    // Animated layout and scroll anchoring can leave a few pixels of padding
    // below it without hiding the control.
    await expect(control).toBeInViewport({ ratio: 1 });

    if (!(await control.isDisabled())) {
      await control.setChecked(false);
      await expectStorageValue(context, 'startupEffect', false);
    }

    await popup.reload();
    await expect(group).toBeHidden();
    await expect(moreSettings).toBeVisible();
    await expect(moreSettings).toHaveAttribute('aria-expanded', 'false');
  });
}

async function openExtensionPopup(context: BrowserContext): Promise<Page> {
  return test.step('Open extension popup', async () => {
    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const settingsTab = popup.locator('#settingsTab');
    await expect(settingsTab).toBeVisible({ timeout: 10_000 });
    await settingsTab.click();
    await expect(settingsTab).toHaveAttribute('aria-selected', 'true');
    return popup;
  });
}

async function expectStorageValue(
  context: BrowserContext,
  key: string,
  expectedValue: unknown
): Promise<void> {
  await expect.poll(async () => {
    const values = await getExtensionStorageValues(context, 'sync', [key]);
    return values[key];
  }, {
    message: `Expected extension sync storage ${key} to equal ${String(expectedValue)}.`,
    timeout: 5_000
  }).toEqual(expectedValue);
}

async function closeNativeMenu(chat: ChatSurface): Promise<void> {
  await test.step('Close chat settings menu', async () => {
    await chat.locator('body').press('Escape').catch(() => undefined);
  });
}
