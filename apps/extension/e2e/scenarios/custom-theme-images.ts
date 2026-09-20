import { expect, test } from '@playwright/test';
import type { BrowserScenario } from './types';
import { getExtensionId, getExtensionServiceWorker } from '../support/extension';
import { clearChatComposer, setChatComposerText } from '../support/composer';
import { expectThemeContrast } from '../support/theme-contrast';

export const customThemeImagesScenario: BrowserScenario = async ({ chat, context }) => {
  const worker = await getExtensionServiceWorker(context);
  const editor = await context.newPage();
  try {
    await editor.setViewportSize({ width: 1280, height: 960 });
    await editor.goto(`chrome-extension://${await getExtensionId(context)}/themes.html`);
    await expect(editor.locator('#themeName')).toBeEnabled();
    const preview = editor.frameLocator('#themePreview');
    const header = preview.locator('yt-live-chat-header-renderer');

    await test.step('Image contrast follows the actual background in preview and applied chat', async () => {
      await setChatComposerText(chat, 'Image contrast preview');
      await preview.locator('#previewDraft').fill('Image contrast preview');
      const files = await editor.evaluate(() => ['#000000', '#ffffff'].map(color => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 2;
        const context = canvas.getContext('2d')!;
        context.fillStyle = color;
        context.fillRect(0, 0, 2, 2);
        return canvas.toDataURL('image/png').split(',')[1];
      }));
      await editor.locator('#themeName').fill('Image contrast');
      for (const area of ['header', 'chat', 'composer']) {
        await editor.locator(`[data-theme-area="${area}"]`).click();
        await editor.locator('[data-theme-field="fill"]').selectOption('image');
        for (const [index, field] of ['image', 'darkImage'].entries()) {
          await editor.locator(`[data-theme-field="${field}"]`).setInputFiles({ name: `${field}.png`, mimeType: 'image/png', buffer: Buffer.from(files[index], 'base64') });
          await expect(editor.locator('[data-theme-field="imageText"]')).toBeEnabled();
        }
      }
      for (const finish of ['flat', 'glossy', 'glass']) {
        await editor.locator('[data-theme-field="finish"]').selectOption(finish);
        await editor.locator('#themeSaveApply').click();
        await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
        for (const mode of ['light', 'dark']) {
          await editor.locator(`[data-theme-mode="${mode}"]`).click();
          await chat.locator('html').evaluate((element, mode) => element.toggleAttribute('dark', mode === 'dark'), mode);
          const background = mode === 'light' ? '#000000' : '#ffffff';
          for (const frame of [preview, chat]) {
            for (const selector of ['yt-live-chat-header-renderer', 'yt-live-chat-text-message-renderer #message', 'yt-live-chat-message-input-renderer', 'button#send-button, #send-button button']) {
              await expectThemeContrast(frame.locator(selector).first(), background);
            }
            await expectThemeContrast(frame.locator('yt-live-chat-text-message-renderer #author-name').first(), background);
          }
          // The preview has YouTube's separate input surface; the minimal chat fixture does not.
          await expectThemeContrast(preview.locator('#previewDraft'), '--ytcq-theme-composer-input');
          await expectThemeContrast(chat.locator('yt-live-chat-message-input-renderer #author-name'), background);
          await test.info().attach(`image-contrast-${finish}-${mode}`, { body: await preview.locator('#chatPreview').screenshot(), contentType: 'image/png' });
        }
      }
      await clearChatComposer(chat);
      await preview.locator('#previewDraft').fill('');
      await editor.locator('[data-theme-area="header"]').click();
      const contrast = editor.getByRole('combobox', { name: 'Text over image', exact: true });
      await contrast.selectOption('light');
      await expect(header).toHaveCSS('color', 'rgb(241, 241, 241)');
      await contrast.press('Control+z');
      await expect(contrast).toHaveValue('auto');
      await expect(header).toHaveCSS('color', 'rgb(15, 15, 15)');
      await contrast.selectOption('light');
      await editor.locator('#themeSaveApply').click();
      await expect(chat.locator('yt-live-chat-header-renderer')).toHaveCSS('color', 'rgb(241, 241, 241)');
      await editor.reload();
      await expect(editor.getByRole('combobox', { name: 'Text over image', exact: true })).toHaveValue('light');
      await editor.locator('#themeDelete').click();
      await editor.locator('.popup-reset-dialog .popup-reset-dialog-confirm').click();
      await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-chat-skin');
    });

    await test.step('GIF backgrounds keep their animation through upload, saving, and reopening', async () => {
      const buffer = Buffer.from('R0lGODlhAQABAIAAACAwRGBAYCH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAAQABAAACAkQBACH5BAAyAAAALAAAAAABAAEAAAICTAEAOw==', 'base64');
      const source = `data:image/gif;base64,${buffer.toString('base64')}`;
      await editor.locator('#themeName').fill('Animated');
      await editor.locator('[data-theme-field="fill"]').selectOption('image');
      for (const key of ['image', 'darkImage']) {
        const picker = editor.locator(`[data-theme-field="${key}"]`);
        await expect(picker).toHaveAttribute('accept', /image\/gif/);
        await picker.setInputFiles({ name: 'background.gif', mimeType: 'image/gif', buffer });
        await expect(picker.locator('..').locator('img')).toHaveAttribute('src', source);
      }
      await editor.locator('[data-theme-details="artwork"] summary').click();
      await editor.locator('[data-theme-field="avatarFrame"]').setInputFiles({ name: 'frame.gif', mimeType: 'image/gif', buffer });
      await editor.locator('#themeSaveApply').click();
      await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
      const applied = await worker.evaluate(async () => (await chrome.storage.local.get('ytcqAppliedCustomTheme:v1'))['ytcqAppliedCustomTheme:v1']);
      expect(applied.avatarFrame).toBe(source);
      expect(applied.surfaces.header).toMatchObject({ image: source, darkImage: source });
      await editor.reload();
      const thumbnail = editor.locator('[data-theme-field="image"]').locator('..').locator('img');
      await expect(thumbnail).toHaveAttribute('src', source);
      const firstFrame = await thumbnail.screenshot({ animations: 'allow' });
      await expect.poll(async () => (await thumbnail.screenshot({ animations: 'allow' })).equals(firstFrame)).toBe(false);
      for (const mode of ['light', 'dark']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
        for (const frame of [preview, chat]) await expect(frame.locator('yt-live-chat-header-renderer')).toHaveCSS('background-image', /data:image\/gif;base64,/);
      }
      await editor.locator('[data-theme-field="image"]').setInputFiles({ name: 'large.gif', mimeType: 'image/gif', buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
      await expect(editor.locator('.theme-status')).toHaveText('Choose a smaller image (PNG, JPEG, WebP: up to 10 MB; GIF: up to 2 MB).');
      await expect(thumbnail).toHaveAttribute('src', source);
      await editor.locator('#themeDelete').click();
      await editor.locator('.popup-reset-dialog .popup-reset-dialog-confirm').click();
      await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-chat-skin');
    });

  } finally {
    await editor.close();
  }
};
