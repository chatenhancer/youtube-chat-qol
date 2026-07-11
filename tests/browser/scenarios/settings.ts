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
import type { BrowserScenario, ChatSurface } from './types';

const SETTINGS_INITIAL_VALUES = {
  composerTranslateLanguage: '',
  targetLanguage: '',
  lastTranslationTarget: 'ja',
  translationDisplay: 'replace',
  liteModeEnabled: false,
  sound: false,
  startupEffect: true
};

export const settingsMenuBehaviorScenario: BrowserScenario = async ({ chat, context }) => {
  await withExtensionStorageValues(context, 'sync', SETTINGS_INITIAL_VALUES, async () => {
    const menu = await openSettingsMenu(chat);
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
    await expect(
      popup.locator('label:has(#liteModeEnabled) .option-beta-badge')
    ).toHaveText('Beta');
    await popup.locator('#liteModeEnabled').setChecked(true);
    await expectStorageValue(context, 'liteModeEnabled', true);
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
    const control = popup.locator('#startupEffect');
    if (await control.isDisabled()) return;

    await control.setChecked(false);
    await expectStorageValue(context, 'startupEffect', false);
  });
}

async function openExtensionPopup(context: BrowserContext): Promise<Page> {
  return test.step('Open extension popup', async () => {
    const extensionId = await getExtensionId(context);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
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
