import { expect, test } from '@playwright/test';
import type { BrowserScenario } from './types';
import { getExtensionId, getExtensionServiceWorker } from '../support/extension';
import { clearChatComposer, setChatComposerText } from '../support/composer';
import { expectThemeContrast } from '../support/theme-contrast';
import { installNativeThemeSurfaces } from '../support/theme-watch-fixture';

export const customThemeImagesScenario: BrowserScenario = async ({ chat, context }) => {
  await installNativeThemeSurfaces(chat);
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
      await editor.getByRole('tab', { name: 'Background', exact: true }).click();
      for (const area of ['header', 'chat', 'composer']) {
        await editor.locator(`[data-theme-area="${area}"]`).click();
        await editor.locator('[data-theme-field="fill"]').selectOption('image');
        for (const [index, field] of ['image', 'darkImage'].entries()) {
          await editor.locator(`[data-theme-field="${field}"]`).setInputFiles({ name: `${field}.png`, mimeType: 'image/png', buffer: Buffer.from(files[index], 'base64') });
          await expect(editor.locator('[data-theme-field="imageText"]')).toBeEnabled();
        }
      }
      await editor.getByRole('tab', { name: 'Style', exact: true }).click();
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
          for (const input of [preview.locator('#previewDraft'), chat.locator('#input[contenteditable]')]) {
            await expectThemeContrast(input, '--ytcq-theme-composer-input');
          }
          const participants = chat.locator('yt-live-chat-participant-list-renderer');
          await expect(participants.locator('#header')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
          await expectThemeContrast(participants.locator('#header'), background);
          await expectThemeContrast(participants.getByRole('button', { name: 'Back' }), background);
          await clearChatComposer(chat);
          await expectThemeContrast(chat.locator('yt-live-chat-text-input-field-renderer #label'), '--ytcq-theme-composer-input');
          for (const draft of ['', 'a', 'Two lines\nof draft']) {
            await chat.locator('#input[contenteditable]').fill(draft);
            for (const selector of ['#input[contenteditable]', '#emoji-picker-button', '.ytcq-composer-translate-button']) {
              const offset = await chat.locator(selector).evaluate(element => {
                const input = element.closest('#input-container')!.getBoundingClientRect();
                const rect = element.getBoundingClientRect();
                // Native YouTube centers the text and bottom-aligns the icon group.
                return Math.abs(element.matches('[contenteditable]')
                  ? rect.y + rect.height / 2 - input.y - input.height / 2
                  : rect.bottom - input.bottom);
              });
              expect(offset, `${finish}/${mode}: ${selector} keeps YouTube's alignment`).toBeLessThan(1);
            }
          }
          await expectThemeContrast(chat.locator('yt-live-chat-message-input-renderer #author-name'), background);
          if (finish === 'glass') {
            await chat.locator('#emoji-picker-button yt-live-chat-icon-toggle-button-renderer#emoji button').click();
            const picker = chat.locator('yt-emoji-picker-renderer');
            // Native YouTube nests the picker inside the composer, whose image
            // can need the opposite text color from the picker's own panel.
            await picker.evaluate(node => node.ownerDocument.querySelector('yt-live-chat-message-input-renderer')!.append(node));
            await expectThemeContrast(picker.locator('yt-emoji-picker-category-renderer #title'), 'background-color', 3);
            await expectThemeContrast(picker.locator('#search input'), '--ytcq-theme-input', 3, '::placeholder');
            const field = await picker.locator('#search').boundingBox();
            const input = await picker.locator('#search input').boundingBox();
            expect(Math.abs(input!.y + input!.height / 2 - field!.y - field!.height / 2)).toBeLessThan(1);
            await picker.getByRole('option').first().click();
          }
          await test.info().attach(`image-contrast-${finish}-${mode}`, { body: await preview.locator('#chatPreview').screenshot(), contentType: 'image/png' });
        }
      }
      await clearChatComposer(chat);
      await preview.locator('#previewDraft').fill('');
      await editor.getByRole('tab', { name: 'Background', exact: true }).click();
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
      await editor.getByRole('tab', { name: 'Background', exact: true }).click();
      await expect(editor.getByRole('combobox', { name: 'Text over image', exact: true })).toHaveValue('light');
      await editor.locator('#themeDelete').click();
      await editor.locator('.popup-reset-dialog .popup-reset-dialog-confirm').click();
      await expect(chat.locator('html')).not.toHaveAttribute('data-ytcq-chat-skin');
    });

    await test.step('GIF backgrounds keep their animation through upload, saving, and reopening', async () => {
      const buffer = Buffer.from('R0lGODlhAQABAIAAACAwRGBAYCH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAAQABAAACAkQBACH5BAAyAAAALAAAAAABAAEAAAICTAEAOw==', 'base64');
      const source = `data:image/gif;base64,${buffer.toString('base64')}`;
      // Valid GIF comments keep the two animation frames while making its
      // base64 data exceed the browser's 2 MiB CSS custom-property limit.
      const commentBlock = Buffer.concat([Buffer.from([255]), Buffer.alloc(255)]);
      const largeBuffer = Buffer.concat([
        buffer.subarray(0, -1), Buffer.from([0x21, 0xfe]),
        ...Array<Buffer>(7_000).fill(commentBlock), Buffer.from([0, 0x3b])
      ]);
      const largeSource = `data:image/gif;base64,${largeBuffer.toString('base64')}`;
      await editor.locator('#themeName').fill('Animated');
      await editor.getByRole('tab', { name: 'Background', exact: true }).click();
      await editor.locator('[data-theme-field="fill"]').selectOption('image');
      for (const key of ['image', 'darkImage']) {
        const picker = editor.locator(`[data-theme-field="${key}"]`);
        await expect(picker).toHaveAttribute('accept', /image\/gif/);
        await picker.setInputFiles({ name: 'background.gif', mimeType: 'image/gif', buffer });
        await expect(picker.locator('..').locator('img')).toHaveAttribute('src', source);
      }
      await editor.getByRole('tab', { name: 'Details', exact: true }).click();
      await editor.locator('[data-theme-field="avatarFrame"]').setInputFiles({ name: 'frame.gif', mimeType: 'image/gif', buffer });
      await editor.getByRole('tab', { name: 'Background', exact: true }).click();
      await editor.locator('[data-theme-area="chat"]').click();
      await editor.locator('[data-theme-field="fill"]').selectOption('image');
      await editor.locator('[data-theme-field="image"]').setInputFiles({ name: 'large-background.gif', mimeType: 'image/gif', buffer: largeBuffer });
      await expect(editor.locator('[data-theme-field="imageText"]')).toBeEnabled();
      const feed = preview.locator('yt-live-chat-item-list-renderer');
      await expect(feed).toHaveCSS('background-image', /url\("blob:/);
      await editor.locator('#themeSaveApply').click();
      await expect(editor.locator('.theme-status')).toHaveText('Theme saved and applied.');
      const applied = await worker.evaluate(async () => (await chrome.storage.local.get('ytcqAppliedCustomTheme:v1'))['ytcqAppliedCustomTheme:v1']);
      expect(applied.avatarFrame).toBe(source);
      expect(applied.surfaces.header).toMatchObject({ image: source, darkImage: source });
      expect(applied.surfaces.chat.image).toBe(largeSource);
      await editor.reload();
      await editor.getByRole('tab', { name: 'Background', exact: true }).click();
      const thumbnail = editor.locator('[data-theme-field="image"]').locator('..').locator('img');
      await expect(thumbnail).toHaveAttribute('src', source);
      const firstFrame = await thumbnail.screenshot({ animations: 'allow' });
      await expect.poll(async () => (await thumbnail.screenshot({ animations: 'allow' })).equals(firstFrame)).toBe(false);
      for (const mode of ['light', 'dark']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        await chat.locator('html').evaluate((element, value) => element.toggleAttribute('dark', value === 'dark'), mode);
        for (const frame of [preview, chat]) {
          await expect(frame.locator('yt-live-chat-header-renderer')).toHaveCSS('background-image', /data:image\/gif;base64,/);
          await expect(frame.locator('yt-live-chat-item-list-renderer')).toHaveCSS('background-image', /url\("blob:/);
        }
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
