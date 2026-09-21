import { expect, test, type Page } from '@playwright/test';
import { expectThemeContrast } from '../support/theme-contrast';
import type { BrowserScenario } from './types';
import { getExtensionId } from '../support/extension';
import { clearChatComposer, setChatComposerText } from '../support/composer';
import { installThemeWatchFixture } from '../support/theme-watch-fixture';
import { openChatEnhancerMenu, openMessageMenu, closeOpenMenus } from '../support/menu-openers';
import { installMockPlaygroundBackend, createMockPlaygroundSnapshot } from '../support/playground-backend';
import { withExtensionStorageValues } from '../support/extension-storage';
import { openGamesCard, getGameCard } from './playground/interactions';
import { closeProfileCardIfPresent, getProfileCardRecord, openStableProfileCardFromRecentMessage } from './profile/card-fixture';

export const customThemesScenario: BrowserScenario = async ({ page, context }) => {
  const watchUrl = await installThemeWatchFixture(page);
  const extensionId = await getExtensionId(context);
  const worker = context.serviceWorkers()[0];
  // Start with the released Aero selection and no custom-theme library.
  await worker.evaluate(async () => {
    await chrome.storage.local.remove(['ytcqCustomThemes:v1', 'ytcqAppliedCustomTheme:v1']);
    await chrome.storage.sync.set({ chatSkin: 'aero' });
  });
  await page.goto(watchUrl);
  const chat = page.frameLocator('iframe#chatframe');
  const outerFrame = page.locator('ytd-live-chat-frame');
  await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
  // Match YouTube's flexible feed so the composer meets the iframe's bottom corners.
  await chat.locator('yt-live-chat-item-list-renderer').evaluate(element => {
    (element as HTMLElement).style.flex = '1';
  });
  await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'custom');
  await expect(outerFrame).toHaveCSS('border-color', 'rgb(197, 197, 197)');
  await expect(outerFrame).toHaveCSS('border-radius', '12px');
  await expect(outerFrame).toHaveCSS('overflow', 'hidden');
  await expect(page.locator('iframe#chatframe')).toHaveCSS('border-radius', '0px');
  await test.step('Aero has a single outer edge and native menu highlights in light and dark mode', async () => {
    for (const [mode, highlight] of [
      ['light', 'linear-gradient(rgba(255, 255, 255, 0.6), rgba(230, 236, 245, 0.8) 90%, rgba(255, 255, 255, 0.8))'],
      ['dark', 'linear-gradient(rgba(156, 224, 255, 0.28), rgba(56, 157, 219, 0.2) 46%, rgba(4, 88, 145, 0.24) 47%, rgba(39, 172, 222, 0.3))']
    ]) {
      await page.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
      await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
      await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin-theme', mode);
      await expect(outerFrame).toHaveCSS('border-color', mode === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(197, 197, 197)');
      const header = chat.locator('yt-live-chat-header-renderer');
      await expect(header).toHaveCSS('color', 'rgb(255, 255, 255)');
      await expect(chat.locator('.ytcq-inbox-button')).toHaveCSS('color', 'rgb(255, 255, 255)');
      const composer = chat.locator('yt-live-chat-message-input-renderer');
      expect(await composer.evaluate(element => Math.abs(innerHeight - element.getBoundingClientRect().bottom))).toBeLessThan(1);
      await expect(header).toHaveCSS('border-top-width', '0px');
      await expect(header).toHaveCSS('border-bottom-color', mode === 'dark' ? 'rgb(63, 63, 63)' : 'rgb(197, 197, 197)');
      await expect(header).not.toHaveCSS('box-shadow', /0px -?1px 0px 0px inset/);
      await expect(composer).toHaveCSS('border-bottom-width', '0px');
      await expect(composer).not.toHaveCSS('box-shadow', /inset/);
      for (const [area, surface] of [['header', header], ['composer', composer]] as const) {
        await test.info().attach(`aero-${mode}-${area}-edge`, { body: await surface.screenshot(), contentType: 'image/png' });
      }
      await test.info().attach(`aero-${mode}-frame-corners`, { body: await outerFrame.screenshot(), contentType: 'image/png' });
      await chat.locator('.ytcq-inbox-button').click();
      await expect(chat.locator('.ytcq-inbox-card')).toHaveCSS('border-radius', '18px');
      await expect(chat.locator('.ytcq-inbox-keyword-add')).toHaveCSS('border-radius', '4px');
      await expect(chat.locator('.ytcq-inbox-keyword-input')).toHaveCSS('border-radius', '4px');
      const icon = chat.locator('.ytcq-inbox-card-icon');
      const iconStyle = await icon.evaluate(element => {
        const style = getComputedStyle(element);
        return { image: style.backgroundImage, color: style.backgroundColor, foreground: style.color };
      });
      await test.info().attach(`aero-${mode}-panel-icon`, { body: await chat.locator('.ytcq-inbox-card').screenshot(), contentType: 'image/png' });
      await chat.locator('.ytcq-inbox-card .ytcq-profile-card-close').click();
      for (const menuType of ['header', 'message']) {
        const menu = menuType === 'header' ? await openChatEnhancerMenu(chat) : (await openMessageMenu(chat)).menu;
        await expect(menu).toHaveCSS('border-radius', '4px');
        if (menuType === 'header') {
          const activeToggle = menu.locator('.ytcq-settings-item[aria-checked="true"] .ytcq-paper-item').first();
          await expect(activeToggle).toHaveCSS('background-image', iconStyle.image);
          await expect(activeToggle).toHaveCSS('background-color', iconStyle.color);
          if (mode === 'light') await expect(activeToggle).toHaveCSS('color', iconStyle.foreground);
        }
        const list = menu.locator('tp-yt-paper-listbox#items');
        await expect(list).toHaveCSS('border-radius', '0px');
        await expect(list).toHaveCSS('box-shadow', 'none');
        const row = menu.locator('tp-yt-paper-item').first();
        await row.hover();
        await expect(row).toHaveCSS('background-image', highlight);
        await expect(row.locator('..')).toHaveCSS('background-image', 'none');
        await test.info().attach(`aero-${mode}-${menuType}-highlight`, { body: await page.screenshot(), contentType: 'image/png' });
        await closeOpenMenus(chat);
      }
    }
    await page.locator('html').evaluate(element => element.removeAttribute('dark'));
    await chat.locator('html').evaluate(element => element.removeAttribute('dark'));
  });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 350, height: 465 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  let editor: Page | undefined;
  let lightBorder = '';
  let darkBorder = '';
  async function openEditor(): Promise<Page> {
    const opened = context.waitForEvent('page');
    await popup.locator('#editThemes').click();
    const result = await opened;
    await result.waitForURL(`chrome-extension://${extensionId}/themes.html`);
    await result.setViewportSize({ width: 1280, height: 960 });
    await expect(result.locator('#themeName')).toBeEnabled();
    await result.locator('#themeEditorPicker').selectOption('');
    await expect(result.locator('#themeSave')).toBeDisabled();
    await expect(result.locator('#themeSaveApply')).toBeDisabled();
    await expect(result.frameLocator('#themePreview').locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'custom');
    return result;
  }
  try {
    await popup.locator('#settingsTab').click();
    await expect(popup.locator('#chatSkin')).toHaveValue('custom:aero');
    expect(await worker.evaluate(() => chrome.storage.sync.get('chatSkin'))).toEqual({ chatSkin: 'aero' });
    await expect(popup.locator('#editThemes')).toHaveAccessibleName('Theme editor');
    const title = await popup.locator('#chatSkin').boundingBox();
    const editButton = await popup.locator('#editThemes').boundingBox();
    expect(editButton!.x - title!.x - title!.width).toBeGreaterThanOrEqual(0);
    expect(editButton!.x - title!.x - title!.width).toBeLessThan(16);
    expect(editButton!.height).toBeLessThanOrEqual(28);
    await expect(popup.locator('#editThemes')).toHaveCSS('border-top-width', '1px');
    const controlRadius = await popup.locator('#chatSkin').evaluate(element => getComputedStyle(element).borderRadius);
    await expect(popup.locator('#editThemes')).toHaveCSS('border-radius', controlRadius);
    await test.info().attach('themes-popup-entry', { body: await popup.screenshot(), contentType: 'image/png' });
    editor = await openEditor();
    await expect(editor).toHaveTitle('Theme editor');
    await expect(editor.getByRole('heading', { name: 'Theme editor', exact: true })).toBeVisible();
    await expect(popup.locator('#themeEditor')).toHaveCount(0);
    await expect(editor.locator('#themeBack')).toHaveCount(0);
    const preview = editor.frameLocator('#themePreview');
    await editor.locator('[data-theme-mode="light"]').click();
    const header = preview.locator('yt-live-chat-header-renderer');
    await expect(editor.locator('[data-theme-area]')).toHaveCount(3);
    await expect(editor.locator('#themeEditorPicker option')).toHaveText(['New theme', 'Aero · Preinstalled']);
    const controlsBounds = await editor.locator('.theme-controls').boundingBox();
    const previewBounds = await editor.locator('#themePreview').boundingBox();
    expect(controlsBounds!.x + controlsBounds!.width).toBeLessThan(previewBounds!.x);

    await test.step('The editor shares popup controls and onboarding preview details', async () => {
      const radius = await popup.locator('#chatSkin').evaluate(element => getComputedStyle(element).borderRadius);
      await expect(editor!.locator('#themeName')).toHaveCSS('border-radius', radius);
      await expect(editor!.locator('#themeEditorPicker')).toHaveCSS('border-radius', radius);
      const font = 'Inter, Arial, sans-serif';
      for (const selector of ['body', '#themeName', '#themeEditorPicker', '#themeSaveApply']) {
        await expect(editor!.locator(selector)).toHaveCSS('font-family', font);
      }
      for (const selector of ['.preview-top-chat', '.preview-message-featured #message', '#previewDraft']) {
        await expect(preview.locator(selector)).toHaveCSS('font-family', font);
      }
      const fontPicker = editor!.locator('[data-theme-field="font"]');

      await editor!.getByRole('tab', { name: 'Style', exact: true }).click();
      await fontPicker.selectOption('mono');
      await expect(preview.locator('.preview-message-featured #message')).toHaveCSS('font-family', /Consolas/);
      await fontPicker.selectOption('default');

      await expect(preview.locator('.preview-message-featured #message')).toHaveCSS('font-family', font);
      await expect(editor!.locator('.preview-title img')).toBeVisible();
      await expect(editor!.locator('.preview-hover-hint')).toHaveCount(0);
      await editor!.getByRole('tab', { name: 'Background', exact: true }).click();
      for (const selector of ['.theme-modes', '.theme-areas']) {
        const group = editor!.locator(selector);
        const start = await group.evaluate(element => element.style.getPropertyValue('--ytcq-popup-tab-highlight-x'));
        await group.locator('button').last().hover();
        await expect(group).toHaveClass(/popup-tab-highlight-animated/);
        expect(await group.evaluate(element => element.style.getPropertyValue('--ytcq-popup-tab-highlight-x'))).not.toBe(start);
        await expect(group.locator('button').first()).toHaveAttribute('aria-pressed', 'true');
      }
      await expect(preview.locator('.preview-message #author-photo').first()).toHaveCSS('border-radius', '50%');
      await expect(preview.locator('#previewMenuButton')).toHaveCSS('cursor', 'pointer');
      await preview.locator('#previewMenuButton').hover();
      await expect(preview.locator('#previewChatMenuTooltip')).toBeHidden();
    });

    await test.step('Save actions require a nonempty theme name', async () => {
      await editor!.getByRole('tab', { name: 'Colors', exact: true }).click();
      await editor!.locator('[data-theme-field="accent"]').fill('#334455');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeDisabled();
      await editor!.locator('#themeName').fill('   ');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeDisabled();
      const apply = editor!.locator('#themeSaveApply');
      const background = await apply.evaluate(element => getComputedStyle(element).backgroundColor);
      const hint = editor!.locator('#themeSaveApply').locator('..');
      await hint.hover();
      await expect(hint.getByRole('tooltip')).toHaveText('Enter a theme name');
      await expect(apply).toHaveCSS('background-color', background);
      await expect(hint).toHaveCSS('cursor', 'not-allowed');
      await editor!.locator('#themeDelete').click();
      await expect(editor!.locator('#themeName')).toHaveValue('');
    });

    await test.step('Edits and Save update the sample chat without changing YouTube', async () => {
      await editor!.locator('[data-theme-mode="light"]').click();
      await editor!.locator('#themeName').fill('Ocean');
      await expect(editor!.locator('#themeSave')).toBeEnabled();
      await expect(editor!.locator('#themeSaveApply')).toBeEnabled();
      await expect(editor!.locator('#themeSaveApply')).toHaveText('Save and use');
      await editor!.getByRole('tab', { name: 'Background', exact: true }).click();
      await editor!.locator('[data-theme-field="fill"]').selectOption('solid');
      await editor!.locator('[data-theme-field="color"]').fill('#126688');

      await editor!.getByRole('tab', { name: 'Colors', exact: true }).click();
      await editor!.locator('[data-theme-field="accent"]').fill('#bb2255');
      await editor!.locator('[data-theme-field="border"]').fill('#556677');
      await expect(preview.locator('.chat-preview')).toHaveCSS('border-color', 'rgb(85, 102, 119)');
      lightBorder = await preview.locator('.chat-preview').evaluate(element => getComputedStyle(element).borderColor);

      await editor!.getByRole('tab', { name: 'Background', exact: true }).click();
      await editor!.locator('[data-theme-area="header"]').click();
      await editor!.locator('[data-theme-mode="dark"]').click();

      await expect(preview.locator('.chat-preview')).not.toHaveCSS('border-color', lightBorder);
      await expect.poll(() => preview.locator('.chat-preview').evaluate(element => element.getAnimations().length)).toBe(0);
      darkBorder = await preview.locator('.chat-preview').evaluate(element => getComputedStyle(element).borderColor);
      await editor!.locator('[data-theme-mode="light"]').click();

      await expect(header).toHaveCSS('background-color', 'rgb(18, 102, 136)');
      await expect(preview.locator('.chat-preview')).toHaveCSS('border-color', lightBorder);
      await expect(outerFrame).toHaveCSS('border-color', 'rgb(197, 197, 197)');
      await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'custom');
      await editor!.locator('#themeSave').click();
      await expect(editor!.locator('.theme-status')).toHaveText('Theme saved. The applied theme is unchanged.');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeEnabled();
      await expect(editor!.locator('#themeSaveApply')).toHaveText('Use theme');
      await expect(editor!.locator('#themeSaveApply').locator('..')).toHaveAttribute('aria-label', 'Use theme');
      await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'custom');
      await expect(outerFrame).toHaveCSS('border-color', 'rgb(197, 197, 197)');
      await expect(popup.locator('#chatSkin option')).toContainText(['Default', 'Aero', 'Ocean']);
      await editor!.locator('#themeDelete').click();
      await expect(editor!.locator('.popup-reset-dialog-message')).toHaveText('Delete this theme?\n\nOcean');
      await editor!.locator('.popup-reset-dialog').getByRole('button', { name: 'Close', exact: true }).click();
    });

    await editor.getByRole('button', { name: 'Use theme', exact: true }).click();
    await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
    await expect(editor.locator('#themeSave')).toBeDisabled();
    await expect(editor.locator('#themeSaveApply')).toBeDisabled();
    await expect(chat.locator('yt-live-chat-header-renderer')).toHaveCSS('background-color', 'rgb(18, 102, 136)');
    await expect(outerFrame).toHaveCSS('border-color', lightBorder);
    await test.step('Flat themes keep Default’s neutral profile rows in both appearances', async () => {
      for (const mode of ['light', 'dark']) {
        await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
        await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin-theme', mode);
        const source = await openStableProfileCardFromRecentMessage(chat);
        const row = await getProfileCardRecord(chat, source);
        await page.mouse.move(0, 0);
        await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(row).toHaveCSS('background-image', 'linear-gradient(rgba(128, 128, 128, 0.1), rgba(128, 128, 128, 0.1)), none');
        await row.hover();
        await expect(row).toHaveCSS('background-image', 'linear-gradient(rgba(128, 128, 128, 0.16), rgba(128, 128, 128, 0.16)), none');
        await test.info().attach(`theme-flat-${mode}-profile`, { body: await chat.locator('.ytcq-profile-card').screenshot(), contentType: 'image/png' });
        await closeProfileCardIfPresent(chat);
        await chat.locator('.ytcq-inbox-button').click();
        const inbox = chat.locator('.ytcq-inbox-card');
        if (await inbox.locator('.ytcq-inbox-keyword-toggle').getAttribute('aria-expanded') !== 'true') {
          await inbox.locator('.ytcq-inbox-keyword-toggle').click();
        }
        await expectThemeContrast(inbox.locator('.ytcq-inbox-keyword-add'), 'background-color', 2.25);
        await expectThemeContrast(inbox.locator('.ytcq-inbox-card-icon'), 'background-color', 2.25);
        await inbox.locator('.ytcq-profile-card-close').click();
      }
      await chat.locator('html').evaluate(element => element.removeAttribute('dark'));
    });
    await test.step('Black and white accents stay readable in the preview and native chat', async () => {
      await setChatComposerText(chat, 'Contrast preview');
      await preview.locator('#previewDraft').fill('Contrast preview');
      for (const [mode, accent] of [['dark', '#000000'], ['light', '#ffffff']]) {
        await editor!.locator(`[data-theme-mode="${mode}"]`).click();
        await page.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
        await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
        await editor!.getByRole('tab', { name: 'Colors', exact: true }).click();
        await editor!.locator('[data-theme-field="accent"]').fill(accent);
        await editor!.getByRole('tab', { name: 'Style', exact: true }).click();
        for (const finish of ['flat', 'glossy']) {
          await editor!.locator('[data-theme-field="finish"]').selectOption(finish);
          await editor!.locator('#themeSaveApply').click();
          await expect(editor!.locator('.theme-status')).toHaveText('Theme saved and applied.');
          // Compare the resting colors in both frames, outside their hover states.
          await page.mouse.move(0, 0);
          await editor!.mouse.move(0, 0);
          for (const [selector, background] of [
            ['#send-button:is(button), #send-button button', '--ytcq-theme-composer-color'],
            ['.ytcq-composer-translate-button', '--ytcq-theme-composer-input']
          ]) {
            await expectThemeContrast(chat.locator(selector), background);
            await expectThemeContrast(preview.locator(selector), background);
            await expect(chat.locator(selector)).toHaveCSS('color', await preview.locator(selector).evaluate(element => getComputedStyle(element).color));
          }
          const menu = await openChatEnhancerMenu(chat);
          await preview.locator('#previewMenuButton').click();
          const activeLabel = '.ytcq-settings-item[aria-checked="true"] .ytcq-menu-label';
          const actionContrast = finish === 'flat' ? 2.25 : 4.5;
          await expectThemeContrast(menu.locator(activeLabel).first(), '--ytcq-theme-panels-color', actionContrast);
          await expectThemeContrast(preview.locator(activeLabel).first(), '--ytcq-theme-panels-color', actionContrast);
          await test.info().attach(`contrast-${mode}-${finish}-menu`, { body: await menu.screenshot(), contentType: 'image/png' });
          await closeOpenMenus(chat);
          await preview.locator('#previewMenuButton').click();
          await chat.locator('.ytcq-inbox-button').click();
          await preview.locator('#previewInboxIcon').click();
          for (const selector of ['.ytcq-inbox-keyword-add', '.ytcq-inbox-card-icon']) {
            const minimum = selector === '.ytcq-inbox-card-icon' ? 2.25 : actionContrast;
            await expectThemeContrast(chat.locator(selector), 'background-color', minimum);
            await expectThemeContrast(preview.locator(selector), 'background-color', minimum);
          }
          await test.info().attach(`contrast-${mode}-${finish}-panel`, { body: await chat.locator('.ytcq-inbox-card').screenshot(), contentType: 'image/png' });
          await chat.locator('.ytcq-inbox-card .ytcq-profile-card-close').click();
          await preview.locator('.preview-inbox-card .ytcq-profile-card-close').click();
        }
      }
      await clearChatComposer(chat);
      await preview.locator('#previewDraft').fill('');
      await editor!.getByRole('tab', { name: 'Colors', exact: true }).click();
      await editor!.locator('[data-theme-field="accent"]').fill('#bb2255');
      await editor!.getByRole('tab', { name: 'Style', exact: true }).click();
      await editor!.locator('[data-theme-field="finish"]').selectOption('flat');
      await editor!.locator('#themeSaveApply').click();
      await expect(editor!.locator('.theme-status')).toHaveText('Theme saved and applied.');
    });
    await test.step('Native menus, quick controls, and the game lobby share the theme colors', async () => {
      const menu = await openChatEnhancerMenu(chat);
      await expect(menu).toHaveCSS('border-radius', '12px');
      await expect(menu.locator('.native-setting-label')).toHaveCSS('color', 'rgb(15, 15, 15)');
      await menu.locator('yt-live-chat-toggle-renderer tp-yt-paper-item').click();
      const sound = menu.locator('[data-ytcq-setting="sound"]');
      if (await sound.getAttribute('aria-checked') !== 'true') await sound.click();
      await expectThemeContrast(sound.locator('.ytcq-menu-label'), '--ytcq-theme-panels-color', 2.25);
      const action = await sound.locator('.ytcq-menu-label').evaluate(element => getComputedStyle(element).color);
      await expect(menu.locator('.toggle-bar')).toHaveCSS('background-color', action);
      await closeOpenMenus(chat);
      const backend = await installMockPlaygroundBackend(context, { snapshot: createMockPlaygroundSnapshot() });
      await withExtensionStorageValues(context, 'sync', { playgroundEnabled: true, playgroundGamesAvailable: true }, async () => {
        const card = await openGamesCard(chat, backend);
        await expectThemeContrast(card.locator('.ytcq-games-card-icon'), 'background-color', 2.25);
        expect(await card.locator('.ytcq-menu-toggle').evaluate(element => getComputedStyle(element, '::after').backgroundColor)).toBe(action);
        const game = getGameCard(card, 'Chess');
        await game.hover();
        await expect(game).toHaveCSS('background-color', 'color(srgb 0.733333 0.133333 0.333333 / 0.18)');
        await card.locator('.ytcq-profile-card-close').click();
      });
    });
    await test.step('The composer has one themed divider in YouTube and in the preview', async () => {
      await expect(chat.locator('#panel-pages')).toHaveCSS('border-top', `1px solid ${lightBorder}`);
      await expect(chat.locator('yt-live-chat-message-input-renderer')).toHaveCSS('border-top-width', '0px');
      await expect(preview.locator('yt-live-chat-message-input-renderer')).toHaveCSS('border-top', `1px solid ${lightBorder}`);
    });
    await page.reload();
    await expect(chat.locator('yt-live-chat-header-renderer')).toHaveCSS('background-color', 'rgb(18, 102, 136)');
    await expect(outerFrame).toHaveCSS('border-color', lightBorder);

    await test.step('The outer outline follows YouTube light and dark mode', async () => {
      await page.evaluate(() => document.documentElement.setAttribute('dark', ''));
      await expect(outerFrame).toHaveCSS('border-color', darkBorder);
      await page.evaluate(() => document.documentElement.removeAttribute('dark'));
      await expect(outerFrame).toHaveCSS('border-color', lightBorder);
    });

    await test.step('Apply availability follows the active theme across pages', async () => {
      await editor!.reload();
      await expect(editor!.locator('#themeName')).toHaveValue('Ocean');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeDisabled();
      await editor!.locator('#themeName').fill('  Ocean  ');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeDisabled();
      await editor!.locator('#themeName').fill('Ocean');
      await popup.locator('#chatSkin').selectOption('system');
      await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-chat-skin');
      await expect(outerFrame).toHaveCSS('border-color', 'rgb(176, 176, 176)');
      await expect(page.locator('iframe#chatframe')).toHaveCSS('border-radius', '12px 12px 0px 0px');
      await expect(chat.locator('#panel-pages')).toHaveCSS('border-top', '1px solid rgb(51, 51, 51)');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeEnabled();
      await expect(editor!.locator('#themeSaveApply')).toHaveText('Use theme');
      await popup.locator('#chatSkin').selectOption({ label: 'Ocean' });
      await expect(editor!.locator('#themeSaveApply')).toBeDisabled();
      await expect(outerFrame).toHaveCSS('border-color', lightBorder);
    });

    await test.step('Editing and saving an applied theme retains its applied appearance', async () => {
      await editor!.locator('[data-theme-mode="light"]').click();
      await editor!.getByRole('tab', { name: 'Background', exact: true }).click();
      await editor!.locator('[data-theme-field="color"]').fill('#662244');
      await expect(editor!.locator('#themeSave')).toBeEnabled();
      await expect(editor!.locator('#themeSaveApply')).toBeEnabled();
      await expect(editor!.locator('#themeSaveApply')).toHaveText('Save and use');
      await editor!.locator('[data-theme-field="color"]').fill('#126688');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeDisabled();
      await editor!.locator('[data-theme-field="color"]').fill('#662244');
      await expect(header).toHaveCSS('background-color', 'rgb(102, 34, 68)');

      await editor!.getByRole('tab', { name: 'Colors', exact: true }).click();
      await editor!.locator('[data-theme-field="border"]').fill('#ff7700');
      await expect(preview.locator('.chat-preview')).not.toHaveCSS('border-color', lightBorder);
      await expect(outerFrame).toHaveCSS('border-color', lightBorder);
      await editor!.locator('#themeSave').click();
      await expect(editor!.locator('.theme-status')).toHaveText('Theme saved. The applied theme is unchanged.');
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeEnabled();
      await expect(chat.locator('yt-live-chat-header-renderer')).toHaveCSS('background-color', 'rgb(18, 102, 136)');
      await expect(outerFrame).toHaveCSS('border-color', lightBorder);
      await editor!.reload();
      await editor!.locator('[data-theme-mode="light"]').click();
      await expect(editor!.locator('#themeSave')).toBeDisabled();
      await expect(editor!.locator('#themeSaveApply')).toBeEnabled();
      await expect(editor!.locator('#themeSaveApply')).toHaveText('Use theme');
      await expect(header).toHaveCSS('background-color', 'rgb(102, 34, 68)');
      await expect(chat.locator('yt-live-chat-header-renderer')).toHaveCSS('background-color', 'rgb(18, 102, 136)');
    });

    await editor.locator('#themeName').fill('Unsaved name');
    await expect(editor.locator('#themeSaveApply')).toHaveText('Save and use');
    await editor.locator('#themeEditorPicker').selectOption('');
    await editor.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(editor.locator('#themeName')).toHaveValue('Unsaved name');
    await editor.locator('#themeEditorPicker').selectOption('');
    await editor.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(editor.locator('#themeName')).toHaveValue('');

    await test.step('Image backgrounds and clearing a new theme stay local to the preview', async () => {
      await editor!.locator('#themeName').fill('Temporary');
      await editor!.getByRole('tab', { name: 'Background', exact: true }).click();
      await editor!.locator('[data-theme-field="fill"]').selectOption('gradient');
      await expect(header).toHaveCSS('background-image', /linear-gradient/);
      await editor!.locator('[data-theme-field="fill"]').selectOption('image');
      await editor!.setViewportSize({ width: 1280, height: 720 });
      await expectPageFits(editor!);
      await editor!.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectPageFits(editor!);
      await expect(editor!.getByRole('tabpanel', { name: 'Background' })).toBeVisible();
      await test.info().attach('themes-page-scrolled', { body: await editor!.screenshot(), contentType: 'image/png' });
      await editor!.setViewportSize({ width: 1280, height: 960 });
      const imagePicker = editor!.locator('[data-theme-field="image"]');
      await expect(imagePicker).toHaveCSS('opacity', '1');
      await expect(imagePicker).toHaveCSS('position', 'static');
      await imagePicker.setInputFiles({
        name: 'background.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')
      });
      await expect(editor!.locator('.theme-image-picker img')).toBeVisible();
      await expect(header).toHaveCSS('background-image', /data:image\/webp;base64,/);
      await expect(chat.locator('yt-live-chat-header-renderer')).toHaveCSS('background-color', 'rgb(18, 102, 136)');
      const removeImage = editor!.getByRole('button', { name: 'Remove image', exact: true });
      await expect(removeImage.locator('svg')).toBeVisible();
      await removeImage.click();
      await expect(editor!.locator('.theme-image-picker img')).toHaveCount(0);
      await expect(header).not.toHaveCSS('background-image', /data:image/);
      await editor!.keyboard.press('Control+z');
      await expect(editor!.locator('.theme-image-picker img')).toBeVisible();
      await expect(header).toHaveCSS('background-image', /data:image\/webp;base64,/);
      await editor!.locator('#themeDelete').click();
      await expect(editor!.locator('#themeName')).toHaveValue('');
      await expect(editor!.locator('[data-theme-field="fill"]')).toHaveValue('theme');
      await expect(editor!.locator('.popup-reset-dialog')).toHaveCount(0);
    });

    await test.step('Sample panels and menu interactions cannot change extension settings', async () => {
      const options = await worker.evaluate(() => chrome.storage.sync.get(null));
      await preview.locator('#previewInboxIcon').click();
      await expect(preview.locator('.ytcq-inbox-card')).toBeVisible();
      await expect(preview.locator('.ytcq-inbox-message-body')).toHaveCSS('font-family', 'Inter, Arial, sans-serif');
      await editor!.getByRole('tab', { name: 'Colors', exact: true }).click();
      await editor!.locator('[data-theme-field="accent"]').fill('#bbccdd');

      await editor!.getByRole('tab', { name: 'Style', exact: true }).click();
      await editor!.locator('[data-theme-field="finish"]').selectOption('glass');
      await expect(preview.locator('.ytcq-inbox-card')).toHaveCSS('backdrop-filter', /blur\(16px\)/);
      await preview.locator('.ytcq-inbox-card .ytcq-profile-card-close').click();
      await preview.locator('#previewMenuButton').click();
      await expect(preview.locator('.preview-native-menu-item .ytcq-menu-label').first()).toHaveCSS('font-family', 'Inter, Arial, sans-serif');
      await preview.locator('[data-ytcq-setting="sound"]').click();
      expect(await worker.evaluate(() => chrome.storage.sync.get(null))).toEqual(options);
      await preview.locator('#previewMenuButton').click();
      const avatar = preview.locator('.preview-message #author-photo').first();
      await avatar.click();
      const profile = preview.locator('.preview-profile-card');
      await profile.locator('.ytcq-avatar-ring-toggle').click();
      for (const target of [avatar, profile.locator('.preview-profile-avatar')]) {
        await expect(target).toHaveClass(/ytcq-avatar-ring-active/);
        await expect(target).toHaveCSS('box-shadow', /0px 0px 0px 2px/);
      }
      await profile.locator('.ytcq-avatar-ring-toggle').click();
      await profile.locator('.ytcq-profile-card-close').click();
    });

    await editor.locator('#themeEditorPicker').selectOption({ label: 'Ocean' });
    await editor.getByRole('button', { name: 'Discard', exact: true }).click();
    await editor.locator('#themeDelete').click();
    await expect(editor.locator('.popup-reset-dialog-message')).toContainText('Chat will return to Default.');
    await editor.locator('.popup-reset-dialog').getByRole('button', { name: 'Close', exact: true }).click();
    await expect(editor.locator('#themeEditorPicker option')).toHaveCount(3);
    await editor.locator('#themeDelete').click();
    await editor.locator('.popup-reset-dialog .popup-reset-dialog-confirm').click();
    await expect(editor.locator('#themeEditorPicker option')).toHaveText(['New theme', 'Aero · Preinstalled']);
    await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-chat-skin');
    await expect(outerFrame).toHaveCSS('border-color', 'rgb(176, 176, 176)');

    await editor.close();
    await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-chat-skin');

    await test.step('The editor works without a YouTube tab in light, dark, and narrow layouts', async () => {
      await page.goto('about:blank');
      editor = await openEditor();
      for (const colorScheme of ['light', 'dark'] as const) {
        await editor.emulateMedia({ colorScheme });
        await editor.locator(`[data-theme-mode="${colorScheme}"]`).click();
        await expect(editor.frameLocator('#themePreview').locator('yt-live-chat-header-renderer')).toHaveCSS('background-color', colorScheme === 'dark' ? 'rgb(15, 15, 15)' : 'rgb(255, 255, 255)');
        await expectPageFits(editor);
        await test.info().attach(`themes-page-${colorScheme}`, { body: await editor.screenshot(), contentType: 'image/png' });
      }
      await editor.setViewportSize({ width: 390, height: 844 });
      expect(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await test.info().attach('themes-page-narrow', { body: await editor.screenshot({ fullPage: true }), contentType: 'image/png' });
    });
  } catch (error) {
    if (editor && !editor.isClosed()) await test.info().attach('themes-page-failure', { body: await editor.screenshot(), contentType: 'image/png' });
    throw error;
  } finally {
    if (editor && !editor.isClosed()) await editor.close();
    await popup.close();
    await page.unroute(watchUrl);
  }
};

async function expectPageFits(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#themeSaveApply')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#themePreview')).toBeInViewport({ ratio: 1 });
}
