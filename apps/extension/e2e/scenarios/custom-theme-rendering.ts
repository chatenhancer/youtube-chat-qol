import { expect, test } from '@playwright/test';
import type { BrowserScenario } from './types';
import { getExtensionId } from '../support/extension';
import { clearChatComposer } from '../support/composer';
import { installThemeWatchFixture } from '../support/theme-watch-fixture';
import { openChatEnhancerMenu, closeOpenMenus } from '../support/menu-openers';
import { closeProfileCardIfPresent, getProfileCardRecord, getProfileSourceMessage, openStableProfileCardFromRecentMessage } from './profile/card-fixture';

export const customThemeRenderingScenario: BrowserScenario = async ({ page, context }) => {
  const watchUrl = await installThemeWatchFixture(page);
  await page.goto(watchUrl);
  const chat = page.frameLocator('iframe#chatframe');
  const outerFrame = page.locator('ytd-live-chat-frame');
  await expect(chat.locator('.ytcq-inbox-button')).toBeVisible();
  const editor = await context.newPage();
  try {
    await editor.setViewportSize({ width: 1280, height: 960 });
    await editor.goto(`chrome-extension://${await getExtensionId(context)}/themes.html`);
    await expect(editor.locator('#themeName')).toBeEnabled();
    const preview = editor.frameLocator('#themePreview');
    await editor.locator('#themeName').fill('Rendering example');
    await editor.locator('[data-theme-field="fill"]').selectOption('solid');
    await editor.locator('[data-theme-field="color"]').fill('#662244');
    await editor.locator('[data-theme-field="border"]').fill('#ff7700');

    await test.step('New palette controls reach real chat menus, Inbox tags, buttons, fonts, and jump highlights', async () => {
      await editor.locator('[data-theme-field="secondary"]').fill('#a622dd');
      await editor.locator('[data-theme-field="accent"]').fill('#bb2255');
      await editor.locator('[data-theme-field="font"]').selectOption('mono');
      for (const finish of ['flat', 'glossy', 'glass']) {
        await editor.locator('[data-theme-field="finish"]').selectOption(finish);
        await editor.locator('#themeSaveApply').click();
        await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
        for (const mode of ['light', 'dark']) {
          await page.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
          await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
          await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin-theme', mode);
          const frameBorder = await outerFrame.evaluate(element => getComputedStyle(element).borderColor);
          await expect(chat.locator('yt-live-chat-header-renderer')).toHaveCSS('border-bottom', `1px solid ${frameBorder}`);
          const menu = await openChatEnhancerMenu(chat);
          await editor.locator(`[data-theme-mode="${mode}"]`).click();
          await preview.locator('#previewMenuButton').click();
          await expect(menu).toHaveCSS('border-radius', finish === 'glass' ? '4px' : '12px');
          await expect(menu.locator('.native-setting-label')).toHaveCSS('color', await preview.locator('.preview-native-menu-item .ytcq-menu-label').first().evaluate(element => getComputedStyle(element).color));
          await preview.locator('#previewMenuButton').click();
          await closeOpenMenus(chat);
          await chat.locator('.ytcq-inbox-button').click();
          const card = chat.locator('.ytcq-inbox-card');
          if (await card.locator('.ytcq-inbox-keyword-toggle').getAttribute('aria-expanded') !== 'true') {
            await card.locator('.ytcq-inbox-keyword-toggle').click();
          }
          if (!await card.locator('.ytcq-inbox-keyword-chip').count()) {
            await card.locator('.ytcq-inbox-keyword-input').fill('theme-check');
            await card.locator('.ytcq-inbox-keyword-add').click();
          }
          await card.locator('.ytcq-inbox-keyword-input').focus();
          await page.mouse.move(0, 0);
          await expect(card.locator('.ytcq-inbox-keyword-chip').first()).toHaveCSS('font-family', /Consolas/);
          await expect(card.locator('.ytcq-inbox-keyword-count')).toHaveCSS('background-color', 'rgb(166, 34, 221)');
          const add = card.locator('.ytcq-inbox-keyword-add');
          await expect(add).toHaveCSS('border-radius', finish === 'glass' ? '4px' : '12px');
          if (await preview.locator('#previewInboxIcon').getAttribute('aria-expanded') !== 'true') await preview.locator('#previewInboxIcon').click();
          const previewAdd = editor.frameLocator('#themePreview').locator('.preview-inbox-card .ytcq-inbox-keyword-add');
          await editor.locator(`[data-theme-mode="${mode}"]`).click();
          await expect(add).toHaveCSS('color', await previewAdd.evaluate(element => getComputedStyle(element).color));
          await expect(add).toHaveCSS('background-image', await previewAdd.evaluate(element => getComputedStyle(element).backgroundImage));
          const tagHighlight = await card.locator('.ytcq-inbox-keyword-chip').first().evaluate(element => ({
            image: getComputedStyle(element).backgroundImage,
            color: getComputedStyle(element).backgroundColor
          }));
          await card.locator('.ytcq-profile-card-close').click();
          const source = await openStableProfileCardFromRecentMessage(chat);
          const profile = chat.locator('.ytcq-profile-card:not(.ytcq-inbox-card)');
          const ringToggle = profile.locator('.ytcq-avatar-ring-toggle');
          await ringToggle.click();
          for (const avatar of [getProfileSourceMessage(chat, source).locator('#author-photo'), profile.locator('.ytcq-profile-card-avatar-button')]) {
            await expect(avatar).toHaveClass(/ytcq-avatar-ring-active/);
            await expect(avatar).toHaveCSS('box-shadow', /0px 0px 0px 2px/);
          }
          await ringToggle.click();
          const record = await getProfileCardRecord(chat, source);
          const jump = record.locator('.ytcq-profile-card-jump');
          await jump.focus();
          await expect(jump).toHaveCSS('opacity', '1');
          await jump.press('Enter');
          const target = chat.locator('.ytcq-message-jump-target').first();
          const highlight = await target.evaluate(element => ({
            image: getComputedStyle(element, '::before').backgroundImage,
            color: getComputedStyle(element, '::before').backgroundColor
          }));
          expect(highlight).toEqual(tagHighlight);
          await closeProfileCardIfPresent(chat);
        }
      }
    });
    await test.step('Gothic quick-toggle labels fit in both the preview and a narrower YouTube frame', async () => {
      await editor.locator('[data-theme-field="font"]').selectOption('gothic');
      await editor.locator('#themeSaveApply').click();
      await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
      const menu = await openChatEnhancerMenu(chat);
      await preview.locator('#previewMenuButton').click();
      const sample = preview.locator('#previewSettingsMenu');
      for (const target of [menu, sample]) {
        const label = target.locator('[data-ytcq-action="picture-in-picture"] .ytcq-menu-label');
        await expect(label).toHaveText('Floating player');
        await expect(label).toHaveCSS('font-family', /Manufacturing Consent/);
        await expect(label).toHaveCSS('height', '14px');
      }
      const actual = await menu.locator('.ytcq-settings-grid').boundingBox();
      const expected = await sample.locator('.ytcq-settings-grid').boundingBox();
      expect(Math.abs(actual!.height - expected!.height)).toBeLessThan(1);
      await test.info().attach('theme-gothic-menu-youtube', { body: await menu.screenshot(), contentType: 'image/png' });
      await test.info().attach('theme-gothic-menu-preview', { body: await sample.screenshot(), contentType: 'image/png' });
      await closeOpenMenus(chat);
      await preview.locator('#previewMenuButton').click();
      await editor.locator('[data-theme-field="font"]').selectOption('mono');
      await editor.locator('#themeSaveApply').click();
      await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
    });
    await test.step('Emoji search matches composer corners and neutral themes retain YouTube’s search and category fills', async () => {
      await chat.locator('#emoji-picker-button yt-live-chat-icon-toggle-button-renderer#emoji button').click();
      const picker = chat.locator('yt-emoji-picker-renderer');
      await expect(editor.locator('[data-theme-field="surfaceTint"]')).toHaveValue('0');
      for (const finish of ['flat', 'glossy', 'glass']) {
        await editor.locator('[data-theme-field="finish"]').selectOption(finish);
        await editor.locator('#themeSaveApply').click();
        await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
        for (const mode of ['light', 'dark']) {
          await editor.locator(`[data-theme-mode="${mode}"]`).click();
          await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
          await expect(chat.locator('html')).toHaveAttribute('data-ytcq-chat-skin-theme', mode);
          await expect(picker.locator('#search-panel')).toHaveCSS('border-width', '0px');
          await expect(picker.locator('#search-panel')).toHaveCSS('box-shadow', 'none');
          const field = picker.locator(finish === 'glass' ? '#search' : '#search-panel');
          const radius = await preview.locator('#input-container').evaluate(element => getComputedStyle(element).borderRadius);
          await expect(field).toHaveCSS('border-radius', radius);
          await expect(field).toHaveCSS('corner-shape', /^(round|superellipse\(1\))$/);
          await expect(picker.locator('#search')).toHaveCSS('border-width', finish === 'glass' ? '1px' : '0px');
          await expect(picker.locator('#search input')).toHaveCSS('border-width', '0px');
          await expect(picker.locator('#search input')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expect(picker.locator('#search .underline')).toBeHidden();
          const heading = picker.locator('yt-emoji-picker-category-renderer #title');
          await expect(heading).toBeVisible();
          await expect(heading).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          if (finish === 'glass') {
            await expect(picker.locator('#search-panel')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          } else {
            await expect(field).toHaveCSS('background-color', mode === 'dark' ? 'rgb(68, 68, 68)' : 'rgb(249, 249, 249)');
            expect((await field.boundingBox())!.height).toBe(32);
            await expect(picker.locator('#search')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
            await expect(heading).toHaveCSS('background-color', mode === 'dark' ? 'rgba(40, 40, 40, 0.8)' : 'rgba(247, 247, 247, 0.8)');
          }
          await test.info().attach(`theme-${finish}-${mode}-emoji-picker`, { body: await picker.screenshot(), contentType: 'image/png' });
        }
      }
    });
    await test.step('Bundled fonts load on YouTube and survive saving and reopening', async () => {
      await chat.locator('yt-emoji-picker-renderer [role="option"]').first().click();
      const frequentTitle = chat.locator('.ytcq-frequent-emoji-label');
      await expect(frequentTitle).toHaveText('MOST USED');
      await expect(frequentTitle).toHaveCSS('font-family', /Consolas/);
      await clearChatComposer(chat);
      for (const [id, family] of [
        ['gothic', 'Manufacturing Consent'], ['playful', 'Dongle'],
        ['pixel', 'Pixelify Sans'], ['elegant', 'Instrument Serif']
      ]) {
        await editor.locator('[data-theme-field="font"]').selectOption(id);
        await editor.locator('#themeSaveApply').click();
        await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
        await expect(chat.locator('yt-live-chat-text-message-renderer #message').first()).toHaveCSS('font-family', new RegExp(family));
        await expect(frequentTitle).toHaveCSS('font-family', new RegExp(family));
        expect(await chat.locator('html').evaluate(async (element, family) => {
          const fonts = await element.ownerDocument.fonts.load(`13px "${family}"`);
          return fonts.some(font => font.family === family && font.status === 'loaded');
        }, family)).toBe(true);
      }
      await editor.reload();
      await expect(editor.locator('#themeName')).toBeEnabled();

      await expect(editor.locator('[data-theme-field="font"]')).toHaveValue('elegant');
    });
  } finally {
    await editor.close();
    await page.unroute(watchUrl);
  }
};
