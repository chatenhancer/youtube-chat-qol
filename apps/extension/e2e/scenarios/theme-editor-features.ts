import { expect, test } from '@playwright/test';
import { getExtensionId, getExtensionServiceWorker } from '../support/extension';
import type { ExtensionScenario } from './types';

const backgroundFile = {
  name: 'background.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')
};

export const themeEditorFeaturesScenario: ExtensionScenario = async ({ context }) => {
  const extensionId = await getExtensionId(context);
  const worker = await getExtensionServiceWorker(context);
  const editor = await context.newPage();
  try {
    await editor.setViewportSize({ width: 1280, height: 960 });
    await editor.goto(`chrome-extension://${extensionId}/themes.html`);
    const preview = editor.frameLocator('#themePreview');
    const name = editor.locator('#themeName');
    await expect(name).toBeEnabled();
    await expect(preview.locator('#previewInboxIcon')).toHaveAttribute('aria-expanded', 'false');
    await editor.locator('[data-theme-mode="light"]').click();

    await test.step('The editor chat frame matches onboarding dimensions across viewport sizes', async () => {
      const onboarding = await context.newPage();
      try {
        await onboarding.goto(`chrome-extension://${extensionId}/onboarding.html`);
        await expect(onboarding.locator('#input-container')).toHaveCSS('border-radius', '18px');
        await expect(onboarding.locator('#input-container')).toHaveCSS('height', '36px');
        await expect(onboarding.locator('#input-container')).toHaveCSS('border-width', '0px');
        await expect(onboarding.locator('#input-container')).toHaveCSS('corner-shape', /^(round|superellipse\(1\))$/);
        for (const size of [
          { width: 1280, height: 960 }, { width: 1050, height: 960 },
          { width: 1280, height: 900 }, { width: 1280, height: 800 },
          { width: 720, height: 960 }, { width: 390, height: 844 }
        ]) {
          await editor.setViewportSize(size);
          await onboarding.setViewportSize(size);
          const expected = await onboarding.locator('#chatPreview').boundingBox();
          await expect.poll(async () => {
            const actual = await preview.locator('#chatPreview').boundingBox();
            return Math.max(Math.abs(actual!.width - expected!.width), Math.abs(actual!.height - expected!.height));
          }).toBeLessThan(1);
        }
      } finally {
        await onboarding.close();
        await editor.setViewportSize({ width: 1280, height: 960 });
      }
    });

    await test.step('Switching background areas preserves focus and the settled hover highlight', async () => {
      const group = editor.locator('.theme-areas');
      for (const area of ['chat', 'composer', 'header']) {
        const tab = group.locator(`[data-theme-area="${area}"]`);
        await tab.hover();
        await expect.poll(() => group.evaluate(element =>
          element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running')
        )).toBe(false);
        const position = await tab.evaluate(element => (element as HTMLElement).offsetLeft);
        await tab.click();
        await expect(tab).toBeFocused();
        await expect(tab).toHaveAttribute('aria-pressed', 'true');
        const positions = await group.evaluate(async element => {
          const samples: number[] = [];
          for (let frame = 0; frame < 16; frame++) {
            await new Promise(requestAnimationFrame);
            samples.push(new DOMMatrix(getComputedStyle(element, '::before').transform).m41);
          }
          return samples;
        });
        expect(positions.every(value => Math.abs(value - position) < 1)).toBe(true);
      }
    });

    await test.step('Decorative composer controls cannot focus inside an aria-hidden surface', async () => {
      for (const selector of ['.preview-emoji', '#previewComposerTranslateIcon', '#send-button button']) {
        const control = preview.locator(selector);
        await expect(control).toBeDisabled();
        await control.click({ force: true });
        await expect(control).not.toBeFocused();
        await expect(preview.locator('[aria-hidden="true"]:has(:focus)')).toHaveCount(0);
      }
      await preview.locator('#emoji-picker-button').hover();
      await expect(preview.locator('#previewEmojiPickerTooltip')).toBeHidden();
    });

    await test.step('The editor omits onboarding help while keeping preview interactions', async () => {
      await preview.locator('#previewMenuButton').hover();
      await expect(preview.locator('#previewChatMenuTooltip')).toBeHidden();
      const avatar = preview.locator('.preview-message #author-photo').first();
      await avatar.hover();
      await expect(preview.locator('.preview-floating-tooltip')).toHaveCount(0);
      await avatar.click();
      const profile = preview.locator('.preview-profile-card');
      await expect(profile).toBeVisible();
      const message = profile.locator('.ytcq-profile-card-message').first();
      await message.hover();
      await message.locator('.ytcq-bookmark-toggle').hover();
      await expect(preview.locator('.preview-tooltip:visible')).toHaveCount(0);
      await expect(preview.locator('.preview-floating-tooltip')).toHaveCount(0);
      await profile.locator('.ytcq-profile-card-close').click();
    });

    await test.step('Each disabled footer action explains its own reason on hover and keyboard focus', async () => {
      const hint = editor.locator('#themeSave').locator('..');
      await hint.hover();
      await expect(hint.getByRole('tooltip')).toHaveCount(1);
      await expect(hint.getByRole('tooltip')).toHaveText('Enter a theme name');
      await expect(hint.getByRole('tooltip')).toBeVisible();
      const resetHint = editor.locator('#themeReset').locator('..');
      await resetHint.hover();
      await expect(hint.getByRole('tooltip')).toBeHidden();
      await expect(resetHint.getByRole('tooltip')).toBeVisible();
      await expect(resetHint.getByRole('tooltip')).not.toHaveText('Enter a theme name');
      await hint.hover();
      await expect(hint.getByRole('tooltip')).toHaveCSS('border-width', '0px');
      await expect(hint.getByRole('tooltip')).toHaveCSS('background-color', 'rgba(18, 18, 18, 0.88)');
      await hint.focus();
      await editor.keyboard.press('Tab');
      await editor.keyboard.press('Shift+Tab');
      await editor.mouse.move(0, 0);
      await expect(hint.getByRole('tooltip')).toBeVisible();
      await test.info().attach('theme-editor-footer-tooltip', { body: await editor.screenshot(), contentType: 'image/png' });
    });

    await test.step('New themes start with neutral message rows and accent-colored actions', async () => {
      for (const mode of ['light', 'dark']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        await expect(preview.locator('#input-container')).toHaveCSS('border-radius', '18px');
        await expect(preview.locator('#input-container')).toHaveCSS('height', '36px');
        await expect(preview.locator('#input-container')).toHaveCSS('border-width', '0px');
        await expect(preview.locator('#input-container')).toHaveCSS('background-color', mode === 'dark' ? 'rgb(39, 39, 39)' : 'rgb(242, 242, 242)');
        await expect(preview.locator('#input-container')).toHaveCSS('corner-shape', /^(round|superellipse\(1\))$/);
        const primary = mode === 'dark' ? 'rgb(241, 241, 241)' : 'rgb(15, 15, 15)';
        const disabled = mode === 'dark' ? 'rgb(113, 113, 113)' : 'rgb(144, 144, 144)';
        await expect(preview.locator('.preview-emoji')).toHaveCSS('color', primary);
        await expect(preview.locator('#previewComposerTranslateIcon')).toHaveCSS('color', mode === 'dark' ? 'rgb(190, 190, 190)' : 'rgb(107, 107, 107)');
        await expect(preview.locator('#send-button button')).toHaveCSS('color', disabled);
        await preview.locator('#previewDraft').fill('Theme preview');
        await expect(preview.locator('#send-button button')).toHaveCSS('color', primary);
        await expect(preview.locator('#send-button button')).toBeDisabled();
        await preview.locator('#previewDraft').fill('');
        await expect(preview.locator('#send-button button')).toHaveCSS('color', disabled);
        await test.info().attach(`theme-default-${mode}-composer`, { body: await preview.locator('.preview-composer').screenshot(), contentType: 'image/png' });
        await preview.locator('#previewMenuButton').click();
        await expect(preview.locator('.preview-settings-menu')).toHaveCSS('border-radius', '12px');
        const activeToggle = preview.locator('.ytcq-settings-item[data-ytcq-setting="sound"] .ytcq-paper-item');
        await expect(activeToggle).toHaveCSS('color', 'rgb(62, 166, 255)');
        await expect(activeToggle).toHaveCSS('background-color', 'color(srgb 0.243137 0.65098 1 / 0.14)');
        await preview.locator('#previewMenuButton').click();
        await preview.locator('#previewInboxIcon').click();
        const panel = preview.locator('.preview-inbox-card');
        const row = panel.locator('.ytcq-profile-card-message').first();
        await expect(row).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(row).toHaveCSS('background-image', 'linear-gradient(rgba(128, 128, 128, 0.1), rgba(128, 128, 128, 0.1)), none');
        await expect(panel.locator('.ytcq-inbox-card-icon')).toHaveCSS('color', 'rgb(62, 166, 255)');
        await expect(panel.locator('.ytcq-inbox-card-icon')).toHaveCSS('background-color', 'color(srgb 0.243137 0.65098 1 / 0.12)');
        await expect(panel.locator('.ytcq-inbox-keyword-add')).toHaveCSS('color', 'rgb(62, 166, 255)');
        await expect(panel.locator('.ytcq-inbox-keyword-add')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await row.hover();
        await expect(row).toHaveCSS('background-image', 'linear-gradient(rgba(128, 128, 128, 0.16), rgba(128, 128, 128, 0.16)), none');
        await expect(preview.locator('.theme-area-highlight')).toHaveCount(0);
        await test.info().attach(`theme-default-${mode}-panel`, { body: await panel.screenshot(), contentType: 'image/png' });
        await editor.locator('[data-theme-area="header"]').click();
      }
      await editor.locator('[data-theme-mode="light"]').click();
    });

    await test.step('Area selection washes the full surface with contrast in either appearance', async () => {
      for (const mode of ['light', 'dark']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        await expect(preview.locator('.preview-chat-feed')).toHaveCSS('background-color', mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(15, 15, 15)');
        for (const [area, selector] of [
          ['chat', 'yt-live-chat-item-list-renderer'],
          ['composer', 'yt-live-chat-message-input-renderer'],
          ['header', 'yt-live-chat-header-renderer']
        ]) {
          await editor.locator(`[data-theme-area="${area}"]`).click();
          const surface = preview.locator(selector);
          const highlight = surface.locator('.theme-area-highlight');
          await expect(surface).toBeVisible();
          await expect(preview.locator('.theme-area-highlight')).toHaveCount(1);
          await expect(highlight).toHaveCSS('pointer-events', 'none');
          await expect(highlight).toHaveCSS('background-color', mode === 'light' ? 'rgba(0, 0, 0, 0.16)' : 'rgba(255, 255, 255, 0.12)');
          const coverage = await highlight.evaluate(element => {
            const animation = element.getAnimations().find(animation => animation.id === 'theme-area-highlight')!;
            animation.pause();
            animation.currentTime = 360;
            const rect = element.getBoundingClientRect();
            const parent = element.parentElement!.getBoundingClientRect();
            return { width: rect.width / parent.width, height: rect.height / parent.height };
          });
          expect(coverage.width).toBeGreaterThan(0.97);
          expect(coverage.height).toBeGreaterThan(0.97);
          expect(coverage.width).toBeLessThan(1.03);
          expect(coverage.height).toBeLessThan(1.03);
          await expect.poll(() => editor.locator('.theme-areas').evaluate(element =>
            element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running')
          )).toBe(false);
          await test.info().attach(`theme-area-${mode}-${area}`, { body: await editor.screenshot(), contentType: 'image/png' });
          // Leave the pulse paused: selecting the next area must replace it immediately.
        }
      }
      await preview.locator('.theme-area-highlight').evaluate(element => element.getAnimations()[0].finish());
      await expect(preview.locator('.theme-area-highlight')).toHaveCount(0);
      await editor.emulateMedia({ reducedMotion: 'reduce' });
      await editor.locator('[data-theme-area="header"]').click();
      const highlight = preview.locator('.theme-area-highlight');
      expect(await highlight.evaluate(element => (element.getAnimations()[0].effect as KeyframeEffect).getKeyframes()[0].opacity)).toBe('1');
      await highlight.evaluate(element => element.getAnimations()[0].finish());
      await expect(highlight).toHaveCount(0);
      await editor.emulateMedia({ reducedMotion: 'no-preference' });
      await editor.locator('[data-theme-mode="light"]').click();
    });

    await test.step('Aero is a protected local preset that can only be saved as a named copy', async () => {
      const preset = await worker.evaluate(async () => {
        const stored = await chrome.storage.local.get('ytcqCustomThemes:v1');
        return stored['ytcqCustomThemes:v1'].find((theme: { id: string }) => theme.id === 'aero');
      });
      expect(preset.name).toBe('Aero');
      await editor.locator('#themeEditorPicker').selectOption('aero');
      await expect(name).toHaveValue('Aero');
      await expect(editor.locator('.theme-preset-notice')).toHaveText('Aero is a preinstalled theme. Enter a different name to save this theme.');
      await expect(editor.locator('#themeDelete')).toBeDisabled();
      await expect(editor.locator('#themeSave')).toBeDisabled();
      const hint = editor.locator('#themeSave').locator('..');
      await hint.hover();
      await expect(hint.getByRole('tooltip')).toHaveText('Enter a name other than Aero to save your copy');
      await expect(preview.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'custom');
      await expect(editor.locator('[data-theme-field="fill"]')).toHaveValue('image');
      for (const mode of ['dark', 'light']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        await expect(preview.locator('#chatPreview')).toHaveCSS('box-shadow', 'none');
        await expect(preview.locator('#chatPreview')).toHaveCSS('border-color', mode === 'dark'
          ? 'rgb(63, 63, 63)' : 'rgb(197, 197, 197)');
        const header = preview.locator('yt-live-chat-header-renderer');
        const composer = preview.locator('yt-live-chat-message-input-renderer');
        await expect(composer.locator('#input-container')).toHaveCSS('border-radius', '6px');
        await expect(composer.locator('#input-container')).toHaveCSS('corner-shape', /^(round|superellipse\(1\))$/);
        for (const surface of [header, composer, preview.locator('yt-live-chat-item-list-renderer')]) {
          await expect(surface).toHaveCSS('background-image', /gradient/);
          await expect(surface).toHaveCSS('background-image', /url\("data:image\//);
        }
        await expect.poll(() => preview.locator('yt-live-chat-item-list-renderer').evaluate(element =>
          getComputedStyle(element).backgroundImage
        )).toContain(mode === 'dark' ? preset.surfaces.chat.darkImage : preset.surfaces.chat.image);
        await expect(header).toHaveCSS('border-bottom-width', '1px');
        await expect(header).toHaveCSS('border-bottom-color', mode === 'dark'
          ? 'rgb(63, 63, 63)' : 'rgb(197, 197, 197)');
        await expect(header).toHaveCSS('background-origin', /^padding-box(, padding-box)*$/);
        await expect(header).not.toHaveCSS('box-shadow', /0px -?1px 0px 0px inset/);
        await expect(composer).toHaveCSS('border-top-width', '1px');
        await expect(composer).not.toHaveCSS('box-shadow', /inset/);
        await test.info().attach(`theme-aero-${mode}-chat`, { body: await editor.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
        await preview.locator('#previewInboxIcon').click();
        await expect(preview.locator('.preview-inbox-card')).toHaveCSS('border-radius', '18px');
        await expect(preview.locator('.preview-inbox-card .ytcq-inbox-keyword-add')).toHaveCSS('border-radius', '4px');
        await expect(preview.locator('.preview-inbox-card .ytcq-inbox-keyword-input')).toHaveCSS('border-radius', '4px');
        await test.info().attach(`theme-aero-${mode}-preview`, { body: await editor.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
        const icon = preview.locator('.preview-inbox-card .ytcq-inbox-card-icon');
        if (mode === 'light') {
          await expect(icon).toHaveCSS('background-image', 'linear-gradient(rgb(198, 232, 249) 0%, rgb(102, 194, 238) 17%, rgb(67, 181, 235) 52%, rgb(57, 171, 225) 53%, rgb(60, 177, 232) 100%)');
          await expect(icon).toHaveCSS('color', 'rgb(255, 255, 255)');
        }
        const iconStyle = await icon.evaluate(element => {
          const style = getComputedStyle(element);
          return { image: style.backgroundImage, color: style.backgroundColor, foreground: style.color };
        });
        await preview.locator('.preview-inbox-card .ytcq-profile-card-close').click();
        await preview.locator('#previewMenuButton').click();
        await expect(preview.locator('.preview-settings-menu')).toHaveCSS('border-radius', '4px');
        const activeToggle = preview.locator('.ytcq-settings-grid .ytcq-settings-item[aria-checked="true"] .ytcq-paper-item').first();
        await expect(activeToggle).toHaveCSS('background-image', iconStyle.image);
        await expect(activeToggle).toHaveCSS('background-color', iconStyle.color);
        if (mode === 'light') await expect(activeToggle).toHaveCSS('color', iconStyle.foreground);
        await test.info().attach(`theme-aero-${mode}-menu`, { body: await editor.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
        await preview.locator('#previewMenuButton').click();
      }
      const originalHeader = await preview.locator('yt-live-chat-header-renderer').evaluate(element => getComputedStyle(element).backgroundImage);
      await expect(editor.locator('#themeReset')).toBeDisabled();
      await name.fill('Sky draft');
      await editor.locator('[data-theme-field="accent"]').fill('#123456');
      await editor.locator('#themeReset').click();
      await expect(name).toHaveValue('Aero');
      await expect(editor.locator('#themeReset')).toBeDisabled();
      await expect(editor.locator('.theme-preset-notice')).toBeVisible();
      await expect(editor.locator('#themeSave')).toBeDisabled();
      await expect(preview.locator('yt-live-chat-header-renderer')).toHaveCSS('background-image', originalHeader);
      await name.press('Control+z');
      await expect(name).toHaveValue('Sky draft');
      await expect(editor.locator('[data-theme-field="accent"]')).toHaveValue('#123456');
      await editor.locator('#themeReset').click();
      await name.fill('My sky');
      await editor.locator('#themeSave').click();
      await expect(editor.locator('.theme-status')).toHaveText('Theme saved. The applied theme is unchanged.');
      const saved = await worker.evaluate(async () => (await chrome.storage.local.get('ytcqCustomThemes:v1'))['ytcqCustomThemes:v1']);
      expect(saved.find((theme: { id: string }) => theme.id === 'aero')).toEqual(preset);
      const copy = saved.find((theme: { name: string }) => theme.name === 'My sky');
      expect(copy.id).not.toBe('aero');
      expect({ ...copy, id: preset.id, name: preset.name }).toEqual(preset);
      await expect(preview.locator('#input-container')).toHaveCSS('border-radius', '6px');
      await expect(preview.locator('yt-live-chat-header-renderer')).toHaveCSS('background-image', originalHeader);
      await expect(editor.locator('#themeDelete')).toBeEnabled();
      await expect(editor.locator('#themeSaveApply')).toBeEnabled();
      await hint.hover();
      await expect(hint.getByRole('tooltip')).toHaveText('Make a change before saving');
      await editor.locator('#themeSaveApply').hover();
      await expect(editor.locator('.theme-editor-footer [role="tooltip"]:visible')).toHaveCount(0);
    });

    await test.step('Image zoom changes only the image, and can be undone', async () => {
      await editor.locator('[data-theme-field="fill"]').selectOption('image');
      await editor.locator('[data-theme-field="image"]').setInputFiles(backgroundFile);
      if (!await editor.locator('[data-theme-details="image"]').getAttribute('open').then(value => value !== null)) await editor.locator('[data-theme-details="image"] summary').click();
      const header = preview.locator('yt-live-chat-header-renderer');
      const before = await header.boundingBox();
      const zoom = editor.locator('[data-theme-field="zoom"]');
      await zoom.fill('200');
      expect(await header.evaluate(element => getComputedStyle(element, '::after').transform)).toBe('matrix(2, 0, 0, 2, 0, 0)');
      expect(await header.boundingBox()).toEqual(before);
      await zoom.press('Control+z');
      await expect(zoom).toHaveValue('100');
    });

    await test.step('Image thumbnails open their full image in a separate tab, including uploaded drafts', async () => {
      await editor.locator('[data-theme-details="artwork"] summary').click();
      for (const key of ['image', 'darkImage', 'avatarFrame']) {
        const row = editor.locator(`[data-theme-field="${key}"]`).locator('..');
        const source = await row.locator('img').getAttribute('src');
        const link = row.getByRole('link', { name: 'Open image in new tab' });
        const opened = context.waitForEvent('page');
        if (key === 'darkImage') await link.press('Enter');
        else await link.click();
        const imageTab = await opened;
        try {
          await imageTab.waitForURL(`chrome-extension://${extensionId}/theme-image.html#*`);
          await expect(imageTab).toHaveTitle('Image preview');
          const image = imageTab.frameLocator('#themeImage').locator('img');
          await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
          expect(await image.getAttribute('src') === source).toBe(true);
          if (key === 'image') {
            await imageTab.reload();
            await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(1);
            expect(await image.getAttribute('src') === source).toBe(true);
          }
        } finally {
          await imageTab.close();
        }
      }
      await editor.locator('[data-theme-details="artwork"] summary').click();
    });

    await test.step('A copy retains the Glass finish while its surface and avatar controls remain editable', async () => {
      const header = preview.locator('yt-live-chat-header-renderer');
      const fill = editor.locator('[data-theme-field="fill"]');
      const finish = editor.locator('[data-theme-field="finish"]');
      const artwork = await header.evaluate(element => getComputedStyle(element).backgroundImage);
      await finish.selectOption('glossy');
      await expect.poll(() => header.evaluate((element, previous) => getComputedStyle(element).backgroundImage === previous, artwork)).toBe(false);
      await expect(header).toHaveCSS('background-image', /^linear-gradient\(rgba\(255, 255, 255/);
      await expect(header).toHaveCSS('background-image', /url\(/);
      await fill.selectOption('theme');
      await expect(header).toHaveCSS('background-image', /^linear-gradient\(rgba\(255, 255, 255/);
      await finish.selectOption('glass');
      await expect(header).toHaveCSS('background-image', /^linear-gradient\(135deg/);
      await expect(header).not.toHaveCSS('background-image', /url\(/);
      await fill.selectOption('solid');
      await editor.locator('[data-theme-field="color"]').fill('#713654');
      await expect(header).toHaveCSS('background-color', 'rgb(113, 54, 84)');
      await expect(header).not.toHaveCSS('background-image', /data:image/);
      await fill.selectOption('gradient');
      await editor.locator('[data-theme-field="gradientColor"]').fill('#241842');
      await expect(header).toHaveCSS('background-image', /rgb\(36, 24, 66\)/);
      await fill.selectOption('image');
      await editor.locator('[data-theme-field="font"]').selectOption('mono');
      await expect(preview.locator('#label-text')).toHaveCSS('font-family', /Consolas/);

      await editor.locator('[data-theme-details="artwork"] summary').click();
      await editor.locator('[data-theme-field="avatarShape"]').selectOption('round');
      await expect(preview.locator('.preview-message #author-photo').first()).toHaveCSS('border-radius', '50%');
      await editor.locator('[data-theme-field="avatarShape"]').selectOption('square');
      await expect(preview.locator('.preview-message #author-photo').first()).toHaveCSS('border-radius', '2px');
      await editor.locator('[data-theme-mode="dark"]').click();

      await editor.locator('[data-theme-area="chat"]').click();
      await fill.selectOption('image');
      await editor.locator('[data-theme-field="image"]').setInputFiles(backgroundFile);
      if (!await editor.locator('[data-theme-details="image"]').getAttribute('open').then(value => value !== null)) await editor.locator('[data-theme-details="image"] summary').click();
      await editor.locator('[data-theme-field="fit"]').selectOption('cover');
      const feed = preview.locator('yt-live-chat-item-list-renderer');
      await editor.locator('[data-theme-field="zoom"]').fill('150');
      expect(await feed.evaluate(element => getComputedStyle(element, '::after').height)).toBe(await feed.evaluate(element => getComputedStyle(element).height));
      expect(await feed.evaluate(element => getComputedStyle(element, '::after').transform)).toBe('matrix(1.5, 0, 0, 1.5, 0, 0)');
      await editor.locator('[data-theme-mode="light"]').click();
      await editor.locator('[data-theme-area="header"]').click();
    });

    await test.step('Preview quick toggles retain their states and hover appearance without changing settings', async () => {
      for (const mode of ['light', 'dark']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        await preview.locator('#previewMenuButton').click();
        const menu = preview.locator('#previewSettingsMenu');
        const native = menu.locator('.preview-native-menu-item .ytcq-paper-item').first();
        await native.hover();
        const background = await native.evaluate(element => getComputedStyle(element).backgroundImage);
        const border = await native.evaluate(element => getComputedStyle(element).borderTopColor);
        for (const setting of ['targetLanguage', 'sound', 'liteModeEnabled']) {
          const toggle = menu.locator(`[data-ytcq-setting="${setting}"]`);
          const checked = await toggle.getAttribute('aria-checked');
          const tile = toggle.locator('.ytcq-paper-item');
          const restingBackground = await tile.evaluate(element => getComputedStyle(element).background);
          await toggle.click();
          await expect(toggle).toHaveAttribute('aria-checked', checked!);
          if (checked === 'true') await expect(tile).toHaveCSS('background', restingBackground);
          else await expect(tile).toHaveCSS('background-image', background);
          await expect(tile).toHaveCSS('border-top-color', border);
          await toggle.press('Enter');
          await toggle.press('Space');
          await expect(toggle).toHaveAttribute('aria-checked', checked!);
          await native.hover();
        }
        await menu.locator('[data-ytcq-setting="sound"]').press('Escape');
      }
      await editor.locator('[data-theme-mode="light"]').click();
    });

    await test.step('Finishes and one shared font render throughout the preview', async () => {
      await preview.locator('#previewInboxIcon').click();

      await editor.locator('[data-theme-details="style"] summary').click();
      const shadow = editor.locator('[data-theme-field="shadow"]');
      await shadow.fill('0');
      const header = preview.locator('yt-live-chat-header-renderer');
      const before = await header.evaluate(element => getComputedStyle(element).boxShadow);
      await shadow.fill('100');
      await expect(shadow.locator('..').locator('output')).toHaveCSS('font-size', '12px');
      expect(await header.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe(before);
      const panel = preview.locator('.preview-inbox-card');
      const finish = editor.locator('[data-theme-field="finish"]');
      const marker = preview.locator('.preview-message #message-container').first();

      const markerEnabled = editor.locator('[data-theme-field="messageMarkEnabled"]');
      await markerEnabled.uncheck();
      await expect.poll(() => marker.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
      await markerEnabled.check();
      await editor.locator('[data-theme-field="messageMark"]').fill('#ff3366');
      await expect.poll(() => marker.evaluate(element => getComputedStyle(element, '::before').backgroundImage)).toContain('rgb(255, 51, 102)');
      await editor.locator('[data-theme-field="messageMark"]').fill('#989898');

      for (const value of ['flat', 'glossy', 'glass']) {
        await finish.selectOption(value);
        await expect.poll(() => marker.evaluate(element => {
          const style = getComputedStyle(element, '::before');
          return style.content !== 'none' && style.backgroundImage.includes('rgb(152, 152, 152)');
        })).toBe(true);
      }
      await finish.selectOption('glossy');
      await expect(panel).toHaveCSS('backdrop-filter', 'none');
      const gloss = await panel.evaluate(element => getComputedStyle(element).backgroundImage);
      await finish.selectOption('glass');
      await editor.locator('[data-theme-field="blur"]').fill('16');
      await expect(panel).toHaveCSS('backdrop-filter', /blur\(16px\)/);
      expect(await panel.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe(gloss);
      await finish.selectOption('glossy');
      await expect(preview.locator('#previewComposerTranslateIcon')).toHaveCSS('background-image', 'none');
      const sampleMessage = preview.locator('.preview-message').nth(1);
      const messageHeight = await sampleMessage.evaluate(element => element.getBoundingClientRect().height);
      for (const [id, family, label] of [
        ['gothic', 'Manufacturing Consent', 'Gothic'], ['playful', 'Dongle', 'Playful'],
        ['pixel', 'Pixelify Sans', 'Pixel'], ['elegant', 'Instrument Serif', 'Elegant']
      ]) {
        await expect(editor.locator(`[data-theme-field="font"] option[value="${id}"]`)).toHaveText(label);
        await editor.locator('[data-theme-field="font"]').selectOption(id);
        await expect(preview.locator('.preview-message').nth(1).locator('#message')).toHaveCSS('font-family', new RegExp(family));
        const metrics = await sampleMessage.evaluate(async (element, family) => {
          const doc = element.ownerDocument;
          const fonts = await doc.fonts.load(`13px "${family}"`);
          await doc.fonts.load('13px Inter');
          const context = doc.createElement('canvas').getContext('2d')!;
          context.font = '1000px Inter';
          const reference = context.measureText('x').actualBoundingBoxAscent;
          context.font = `1000px "${family}"`;
          const glyph = context.measureText('x');
          return {
            loaded: fonts.some(font => font.family === family && font.status === 'loaded'),
            relativeSize: glyph.actualBoundingBoxAscent / reference,
            lineHeight: glyph.fontBoundingBoxAscent + glyph.fontBoundingBoxDescent,
            rowHeight: element.getBoundingClientRect().height
          };
        }, family);
        expect(metrics.loaded).toBe(true);
        expect(metrics.relativeSize).toBeGreaterThan(.9);
        expect(metrics.relativeSize).toBeLessThan(1.15);
        expect(metrics.lineHeight).toBeGreaterThan(1150);
        expect(metrics.lineHeight).toBeLessThan(1250);
        expect(metrics.rowHeight).toBe(messageHeight);
        await test.info().attach(`theme-font-${label.toLowerCase()}`, { body: await preview.locator('#chatPreview').screenshot(), contentType: 'image/png' });
      }

      await editor.locator('[data-theme-area="header"]').click();
      await expect(editor.locator('[data-theme-field="areaFont"]')).toHaveCount(0);
      await expect(preview.locator('#label-text')).toHaveCSS('font-family', /Instrument Serif/);
      await expect(preview.locator('.preview-message').nth(1).locator('#message')).toHaveCSS('font-family', /Instrument Serif/);
      await test.info().attach('theme-editor-presets-and-controls', { body: await editor.screenshot(), contentType: 'image/png' });
    });

    await test.step('Both previews follow the real message-density setting', async () => {
      await editor.locator('#themeReset').click();
      await editor.locator('#themeEditorPicker').selectOption('');
      await worker.evaluate(() => chrome.storage.sync.set({ messageDensity: 'compact', liteModeEnabled: false }));
      await expect(preview.locator('.preview-message').first()).toHaveCSS('padding-top', '2px');
      await expect(preview.locator('.preview-message #author-photo').first()).toHaveCSS('width', '20px');
      await expect(preview.locator('.preview-skeleton-row').first()).toHaveCSS('height', '24px');
      await expect(preview.locator('.preview-message').nth(1)).toHaveCSS('height', '24px');
      expect(await preview.locator('.preview-chat-feed').evaluate(element => {
        const rows = [...element.querySelectorAll('.preview-skeleton-row')];
        const feed = element.getBoundingClientRect();
        const visible = rows.filter(row => row.getBoundingClientRect().top < feed.bottom);
        return visible.length > 17 && visible.at(-1)!.getBoundingClientRect().bottom >= feed.bottom;
      })).toBe(true);
      const onboarding = await context.newPage();
      try {
        await onboarding.goto(`chrome-extension://${extensionId}/onboarding.html`);
        await expect(onboarding.locator('.preview-message').first()).toHaveCSS('padding-top', '2px');
        await worker.evaluate(() => chrome.storage.sync.set({ liteModeEnabled: true }));
        await expect(preview.locator('.preview-message').nth(1)).toHaveCSS('height', '28px');
        await expect(preview.locator('.preview-skeleton-row').first()).toHaveCSS('height', '28px');
        await onboarding.locator('#onboardingLiteModeEnabled').check();
        await expect(onboarding.locator('.preview-message').nth(1)).toHaveCSS('height', '28px');
        await worker.evaluate(() => chrome.storage.sync.set({ messageDensity: 'default' }));
        await expect(preview.locator('.preview-message').first()).toHaveCSS('padding-top', '4px');
        await expect(onboarding.locator('.preview-message').first()).toHaveCSS('padding-top', '4px');
        await expect(preview.locator('.preview-message').nth(1)).toHaveCSS('height', '32px');
      } finally { await onboarding.close(); }
    });
  } finally { await editor.close(); }
};
