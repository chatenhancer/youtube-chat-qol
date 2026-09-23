import { expect, test } from '@playwright/test';
import { getExtensionId } from '../support/extension';
import type { ExtensionScenario } from './types';

const imageFile = {
  name: 'image.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64')
};

export const themePaletteScenario: ExtensionScenario = async ({ context }) => {
  const editor = await context.newPage();
  try {
    await editor.setViewportSize({ width: 1280, height: 960 });
    await editor.goto(`chrome-extension://${await getExtensionId(context)}/themes.html`);
    const preview = editor.frameLocator('#themePreview');
    const field = (name: string) => editor.locator(`[data-theme-field="${name}"]`);
    await expect(editor.locator('#themeName')).toBeEnabled();
    await test.step('New themes start neutral, and tint stays independent of the finish', async () => {
      await expect(field('surfaceTint')).toHaveValue('0');
      for (const mode of ['light', 'dark']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        const surfaces = preview.locator('yt-live-chat-header-renderer, yt-live-chat-item-list-renderer, yt-live-chat-message-input-renderer');
        const palette = () => surfaces.evaluateAll(elements => elements.map(element => {
          const style = getComputedStyle(element);
          return { background: style.backgroundColor, text: style.color };
        }));
        await expect.poll(() => surfaces.evaluateAll(elements => elements.some(element =>
          element.getAnimations().some(animation => animation.playState === 'running')
        ))).toBe(false);
        const before = Array.from({ length: 3 }, () => ({
          background: mode === 'dark' ? 'rgb(15, 15, 15)' : 'rgb(255, 255, 255)',
          text: mode === 'dark' ? 'rgb(241, 241, 241)' : 'rgb(15, 15, 15)'
        }));
        await expect.poll(palette).toEqual(before);
        await editor.getByRole('tab', { name: 'Style', exact: true }).click();
        for (const finish of ['glossy', 'glass', 'flat']) {
          await field('finish').selectOption(finish);
          await expect.poll(palette).toEqual(before);
          const radius = finish === 'glass' ? 4 : 12;
          await expect(field('radius')).toHaveValue(String(radius));
          await expect(preview.locator('#input-container')).toHaveCSS('border-radius', `${radius * 1.5}px`);
          await expect(preview.locator('#input-container')).toHaveCSS('background-color', mode === 'dark' ? 'rgb(39, 39, 39)' : 'rgb(242, 242, 242)');
          await expect(preview.locator('#input-container')).toHaveCSS('corner-shape', /^(round|superellipse\(1\))$/);
          await preview.locator('#previewInboxIcon').click();
          await expect(preview.locator('.preview-inbox-card')).toHaveCSS('border-radius', finish === 'glass' ? '18px' : '12px');
          await expect(preview.locator('.preview-inbox-card .ytcq-inbox-keyword-add')).toHaveCSS('border-radius', `${radius}px`);
          await expect(preview.locator('.preview-inbox-card .ytcq-inbox-keyword-input')).toHaveCSS('border-radius', `${radius}px`);
          await preview.locator('.preview-inbox-card .ytcq-profile-card-close').click();
          await preview.locator('#previewMenuButton').click();
          await expect(preview.locator('.preview-settings-menu')).toHaveCSS('border-radius', `${radius}px`);
          await preview.locator('#previewMenuButton').click();
          await expect(preview.locator('yt-live-chat-header-renderer')).toHaveCSS('border-bottom', `1px solid ${mode === 'dark' ? 'rgb(68, 68, 68)' : 'rgb(214, 214, 214)'}`);
          await expect(preview.locator('yt-live-chat-header-renderer')).toHaveCSS('background-image', finish === 'flat' ? /^none(, none)*$/ : /linear-gradient/);
          for (const font of ['default', 'classic', 'mono', 'gothic', 'playful', 'pixel', 'elegant']) {
            await field('font').selectOption(font);
            for (const text of ['', 'Draft']) {
              await preview.locator('#previewDraft').fill(text);
              for (const selector of ['#previewDraft', '#previewComposerTranslateIcon', '.preview-emoji']) {
                await expect.poll(() => preview.locator(selector).evaluate(element => {
                  const input = element.closest('#input-container')!.getBoundingClientRect();
                  const rect = element.getBoundingClientRect();
                  return Math.abs(rect.y + rect.height / 2 - input.y - input.height / 2);
                }), { message: `${finish}/${font}: ${selector} is vertically centered` }).toBeLessThan(1);
              }
            }
          }
          await field('font').selectOption('default');
          await preview.locator('#previewDraft').fill('');
        }
        await editor.getByRole('tab', { name: 'Colors', exact: true }).click();
        await field('surfaceTint').fill('60');
        await expect(preview.locator('yt-live-chat-header-renderer')).not.toHaveCSS('background-color', before[0].background);
        await field('surfaceTint').fill('0');
        await expect.poll(palette).toEqual(before);
      }
    });
    await editor.locator('#themeEditorPicker').selectOption('aero');
    await expect(field('surfaceTint')).toHaveValue('100');
    await editor.locator('#themeName').fill('Palette example');
    await editor.getByRole('tab', { name: 'Style', exact: true }).click();
    await field('font').selectOption('mono');
    await expect(editor.getByRole('heading', { name: 'Shape and depth' })).toBeVisible();
    await expect(editor.locator('[data-theme-section]')).toHaveCount(0);
    await expect(editor.locator('[data-theme-area]')).toHaveCount(3);
    for (const removed of ['button', 'buttonText', 'menu', 'menuText', 'input', 'muted', 'emphasis', 'text', 'areaFont']) {
      await expect(field(removed)).toHaveCount(0);
    }
    await expect(editor.locator('.theme-colors input[type="color"]')).toHaveCount(3);

    for (const mode of ['light', 'dark']) {
      await test.step(`${mode}: one palette drives panels, buttons, menus, and every finish`, async () => {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        await preview.locator('#previewInboxIcon').click();
        const panel = preview.locator('.preview-inbox-card');
        const tag = panel.locator('.ytcq-inbox-keyword-chip');
        await expect(tag).toHaveCSS('font-family', /Consolas/);
        await editor.getByRole('tab', { name: 'Colors', exact: true }).click();
        await field('secondary').fill('#a622dd');
        await field('accent').fill('#bb2255');
        await field('border').fill('#735a84');
        await expect.poll(() => preview.locator('#chatPreview').evaluate(element => element.getAnimations().length)).toBe(0);
        const border = await preview.locator('#chatPreview').evaluate(element => getComputedStyle(element).borderColor);

        for (const finish of ['flat', 'glossy', 'glass']) {
          await editor.getByRole('tab', { name: 'Style', exact: true }).click();
          await field('finish').selectOption(finish);
          await expect(preview.locator('#chatPreview')).toHaveCSS('border-color', border);
          await expect(preview.locator('yt-live-chat-header-renderer')).toHaveCSS('border-bottom', `1px solid ${border}`);
          await expect(panel.locator('.ytcq-inbox-keyword-count')).toHaveCSS('background-color', 'rgb(166, 34, 221)');
          const button = panel.locator('.ytcq-inbox-keyword-add');
          const icon = panel.locator('.ytcq-inbox-card-icon');
          const beforeIcon = await icon.evaluate(element => getComputedStyle(element).background);
          const beforeButton = await button.evaluate(element => getComputedStyle(element).background);
          const beforeButtonText = await button.evaluate(element => getComputedStyle(element).color);
          await expect.poll(() => preview.locator('#chatPreview').evaluate(element => element.getAnimations().length)).toBe(0);
          const beforeBorder = await preview.locator('#chatPreview').evaluate(element => getComputedStyle(element).borderColor);
          await editor.getByRole('tab', { name: 'Colors', exact: true }).click();
          await field('accent').fill('#228855');
          if (finish === 'flat') await expect(button).not.toHaveCSS('color', beforeButtonText);
          else await expect(button).not.toHaveCSS('background', beforeButton);
          await expect(icon).not.toHaveCSS('background', beforeIcon);
          await expect(preview.locator('#chatPreview')).toHaveCSS('border-color', beforeBorder);
          await field('accent').fill('#bb2255');
          await editor.getByRole('tab', { name: 'Style', exact: true }).click();
          await expect(field('shine')).toHaveCount(finish === 'flat' ? 0 : 1);
          await expect(field('blur')).toHaveCount(finish === 'glass' ? 1 : 0);
          if (finish !== 'flat') {
            const reflection = await panel.evaluate(element => getComputedStyle(element).backgroundImage);
            await field('shine').fill('0');
            expect(await panel.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe(reflection);
            await field('shine').fill('100');
          }
          const text = await panel.evaluate(element => getComputedStyle(element).color);
          if (finish === 'glossy') {
            await test.info().attach(`theme-glossy-${mode}-panel`, { body: await panel.screenshot(), contentType: 'image/png' });
          }
          await preview.locator('#previewMenuButton').click();
          await expect(preview.locator('.preview-native-menu-item .ytcq-menu-label').first()).toHaveCSS('color', text);
          if (finish === 'glossy') {
            await test.info().attach(`theme-glossy-${mode}-menu`, { body: await preview.locator('#previewSettingsMenu').screenshot(), contentType: 'image/png' });
          }
          await preview.locator('#previewMenuButton').click();
          await preview.locator('#previewInboxIcon').click();
        }
        await expect(preview.locator('#chatPreview')).toHaveCSS('border-color', border);
        await preview.locator('.preview-inbox-card .ytcq-profile-card-close').click();
      });
    }

    await test.step('Image backgrounds retain each surface’s material in both appearances, including when zoomed', async () => {
      for (const mode of ['light', 'dark']) {
        await editor.locator(`[data-theme-mode="${mode}"]`).click();
        for (const [area, selector] of [
          ['header', 'yt-live-chat-header-renderer'],
          ['chat', 'yt-live-chat-item-list-renderer'],
          ['composer', 'yt-live-chat-message-input-renderer']
        ]) {
          await editor.getByRole('tab', { name: 'Background', exact: true }).click();
          await editor.locator(`[data-theme-area="${area}"]`).click();
          const surface = preview.locator(selector);
          for (const finish of ['flat', 'glossy', 'glass']) {
            await editor.getByRole('tab', { name: 'Style', exact: true }).click();
            await field('finish').selectOption(finish);
            await editor.getByRole('tab', { name: 'Background', exact: true }).click();
            await field('fill').selectOption('theme');
            const reflection = await surface.evaluate(element => getComputedStyle(element).backgroundImage.replace(/(?:, none)+$/, ''));
            await field('fill').selectOption('image');
            const painted = await surface.evaluate(element => getComputedStyle(element).backgroundImage);
            expect(painted.includes('url(')).toBe(true);
            if (reflection !== 'none') expect(painted.startsWith(`${reflection}, `)).toBe(true);
            if (finish === 'flat') continue;
            await expect(editor.getByRole('heading', { name: 'Image placement' })).toBeVisible();
            await field('zoom').fill('150');
            await field('surfaceOpacity').fill('50');
            await expect.poll(() => surface.evaluate((element, expected) =>
              getComputedStyle(element, '::after').backgroundImage === expected, painted
            )).toBe(true);
            await field('zoom').fill('100');
            await field('surfaceOpacity').fill('100');
          }
        }
      }
    });

    await test.step('One uploaded background adapts across modes, with shared placement and transparency', async () => {
      await editor.locator('[data-theme-area="chat"]').click();
      await field('fill').selectOption('image');
      await expect(field('image')).toBeVisible();
      await expect(field('darkImage')).toBeVisible();
      await expect(editor.getByRole('heading', { name: 'Image placement' })).toBeVisible();
      await expect(field('zoom')).toBeVisible();
      await field('image').setInputFiles(imageFile);
      await field('darkImage').locator('..').getByRole('button', { name: 'Remove image' }).click();
      const feed = preview.locator('yt-live-chat-item-list-renderer');
      await field('surfaceOpacity').fill('50');
      await expect.poll(() => feed.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('0.5');
      const darkBackground = await feed.evaluate(element => getComputedStyle(element, '::after').backgroundImage);
      expect(darkBackground).toContain('data:image');
      await editor.locator('[data-theme-mode="light"]').click();
      await expect(preview.locator('html')).toHaveAttribute('data-ytcq-chat-skin-theme', 'light');
      await expect(field('surfaceOpacity')).toHaveValue('50');
      const lightBackground = await feed.evaluate(element => getComputedStyle(element, '::after').backgroundImage);
      expect(lightBackground).not.toBe(darkBackground);
      expect(lightBackground.match(/url\([^)]+\)/)?.[0]).toBe(darkBackground.match(/url\([^)]+\)/)?.[0]);
      await editor.locator('[data-theme-area="header"]').click();
      await field('fill').selectOption('image');
      await field('image').setInputFiles(imageFile);
      await expect(editor.locator('.theme-background-fields input[type="file"]')).toHaveCount(2);
      await field('fit').selectOption('cover');
      await field('positionX').fill('17');
      const header = preview.locator('yt-live-chat-header-renderer');
      await expect(header).toHaveCSS('background-position', /17%/);
      await field('zoom').fill('200');
      await field('surfaceOpacity').fill('45');
      expect(await header.evaluate(element => getComputedStyle(element, '::after').opacity)).toBe('0.45');
      expect(await header.evaluate(element => getComputedStyle(element, '::after').backgroundImage)).toContain('data:image');
      await expect(header).toHaveCSS('opacity', '1');
      await field('fill').selectOption('gradient');
      await expect(field('positionX')).toHaveCount(0);
      await field('surfaceOpacity').fill('100');
      await field('gradientAngle').fill('270');
      await expect(header).toHaveCSS('background-image', /270deg/);
      await editor.getByRole('tab', { name: 'Details', exact: true }).click();
      await expect(editor.getByRole('tabpanel', { name: 'Details' }).locator('input[type="file"]')).toHaveCount(1);
      await expect(field('avatarFrame')).toBeVisible();
      await preview.locator('#previewInboxIcon').click();
      await editor.locator('#themeSave').click();
      await expect(editor.locator('.theme-status')).toContainText('Theme saved.');
      await test.info().attach('theme-shared-palette', { body: await editor.screenshot(), contentType: 'image/png' });
      await editor.reload();
      await editor.locator('#themeEditorPicker').selectOption({ label: 'Palette example' });
      await expect(field('gradientAngle')).toHaveValue('270');
      await expect(field('secondary')).toHaveValue('#a622dd');
      await editor.locator('[data-theme-mode="dark"]').click();
      await expect(field('gradientAngle')).toHaveValue('270');
      await expect(field('secondary')).toHaveValue('#a622dd');
      await expect(editor.locator('#themeSave')).toBeDisabled();
    });
  } finally { await editor.close(); }
};
