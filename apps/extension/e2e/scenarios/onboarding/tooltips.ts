/** Interactive tooltip coverage for the extension onboarding preview. */
import { expect } from '@playwright/test';
import type { ExtensionScenario } from '../types';
import { withOnboardingPage } from './fixture';

export const onboardingTooltipScenario: ExtensionScenario = async ({ context }) => {
  await withOnboardingPage(context, async (onboarding) => {
    await onboarding.locator('#previewMenuButton').hover();
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute(
      'data-lite-mode-enabled',
      'false'
    );
    await expect(onboarding.locator('#previewChatMenuTooltip')).toBeVisible();
    await expect(onboarding.locator('#previewChatMenuTooltip')).not.toBeEmpty();
    await expect
      .poll(async () => {
        const [preview, header, tooltip] = await Promise.all([
          onboarding.locator('#chatPreview').boundingBox(),
          onboarding.locator('.preview-chat-header').boundingBox(),
          onboarding.locator('#previewChatMenuTooltip').boundingBox()
        ]);
        if (!preview || !header || !tooltip) return false;
        return (
          tooltip.y >= header.y + header.height &&
          tooltip.x >= preview.x &&
          tooltip.x + tooltip.width <= preview.x + preview.width
        );
      })
      .toBe(true);

    await onboarding.locator('#onboardingPlaygroundEnabled').check();
    await expect(onboarding.locator('#previewGamesIcon')).toBeVisible();
    await onboarding.locator('#previewGamesIcon').hover();
    await expect(onboarding.locator('#previewChatMenuTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewGamesTooltip')).toBeVisible();
    await expect(onboarding.locator('#previewGamesTooltip')).not.toBeEmpty();
    await expect(onboarding.locator('#previewGamesTooltip')).toHaveCSS('pointer-events', 'none');
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute(
      'data-playground-enabled',
      'true'
    );

    await onboarding.locator('#previewInboxIcon').hover();
    await expect(onboarding.locator('#previewGamesTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewChatMenuTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewInboxTooltip')).toBeVisible();
    await expect(onboarding.locator('#previewInboxTooltip')).not.toBeEmpty();
    await expect(onboarding.locator('#previewInboxTooltip')).toHaveCSS('pointer-events', 'none');
    await expect
      .poll(async () => {
        const [preview, header, tooltip] = await Promise.all([
          onboarding.locator('#chatPreview').boundingBox(),
          onboarding.locator('.preview-chat-header').boundingBox(),
          onboarding.locator('#previewInboxTooltip').boundingBox()
        ]);
        if (!preview || !header || !tooltip) return false;
        return (
          tooltip.y >= header.y + header.height &&
          tooltip.x >= preview.x &&
          tooltip.x + tooltip.width <= preview.x + preview.width
        );
      })
      .toBe(true);

    await onboarding.locator('#previewComposerTranslateIcon').hover();
    await expect(onboarding.locator('#previewInboxTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewDraftTranslatorTooltip')).toBeVisible();
    await expect(onboarding.locator('#previewDraftTranslatorTooltip')).not.toBeEmpty();
    await expect
      .poll(async () => {
        const [preview, composer, tooltip] = await Promise.all([
          onboarding.locator('#chatPreview').boundingBox(),
          onboarding.locator('.preview-composer').boundingBox(),
          onboarding.locator('#previewDraftTranslatorTooltip').boundingBox()
        ]);
        if (!preview || !composer || !tooltip) return false;
        return (
          tooltip.y + tooltip.height <= composer.y &&
          tooltip.x >= preview.x &&
          tooltip.x + tooltip.width <= preview.x + preview.width
        );
      })
      .toBe(true);

    await onboarding.locator('#emoji-picker-button').hover();
    await expect(onboarding.locator('#previewDraftTranslatorTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewEmojiPickerTooltip')).toBeVisible();
    await expect(onboarding.locator('#previewEmojiPickerTooltip')).not.toBeEmpty();
    await expect
      .poll(async () => {
        const [preview, composer, tooltip] = await Promise.all([
          onboarding.locator('#chatPreview').boundingBox(),
          onboarding.locator('.preview-composer').boundingBox(),
          onboarding.locator('#previewEmojiPickerTooltip').boundingBox()
        ]);
        if (!preview || !composer || !tooltip) return false;
        return (
          tooltip.y + tooltip.height <= composer.y &&
          tooltip.x >= preview.x &&
          tooltip.x + tooltip.width <= preview.x + preview.width
        );
      })
      .toBe(true);
    await onboarding.locator('.preview-title').hover();
    await expect(onboarding.locator('#previewEmojiPickerTooltip')).toBeHidden();

    await onboarding.locator('#previewMenuButton').click();
    const menu = onboarding.locator('#previewSettingsMenu');
    await menu.locator('[data-ytcq-action="chat-enhancer"]').click();
    const pip = menu.locator('[data-ytcq-action="picture-in-picture"]');
    const tooltip = onboarding.locator('#previewPipTooltip');
    const learnMore = tooltip.getByRole('link', { name: 'Learn more', exact: true });
    for (const theme of ['light', 'dark'] as const) {
      await onboarding.emulateMedia({ colorScheme: theme });
      await pip.hover();
      await expect(tooltip).toHaveCSS('opacity', '1');
      await expect.poll(() => tooltip.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const menu = document.querySelector('#previewSettingsMenu')!.getBoundingClientRect();
        const item = document.querySelector('[data-ytcq-action="picture-in-picture"]')!.getBoundingClientRect();
        const arrow = getComputedStyle(element, '::before');
        const arrowCenter = card.left + element.clientLeft + parseFloat(arrow.left) + parseFloat(arrow.width) / 2;
        return card.top >= menu.bottom + 8 && parseFloat(arrow.top) < 0 &&
          Math.abs(arrowCenter - (item.left + item.width / 2)) <= 2;
      })).toBe(true);
      const menuBounds = (await menu.boundingBox())!;
      await onboarding.mouse.move(menuBounds.x + menuBounds.width / 2, menuBounds.y + menuBounds.height + 6);
      await expect(tooltip).toHaveCSS('opacity', '1');
      await learnMore.hover();
      await expect(tooltip).toHaveCSS('opacity', '1');
    }
    await onboarding.locator('.preview-title').hover();
    await expect(tooltip).toBeHidden();
    await pip.locator('.ytcq-paper-item').focus();
    await onboarding.keyboard.press('Tab');
    await expect(learnMore).toBeFocused();
    await expect(tooltip).toHaveCSS('opacity', '1');
    await learnMore.press('Escape');
    await expect(menu).toBeHidden();
    await expect(tooltip).toBeHidden();
    await expect(onboarding.locator('#previewMenuButton')).toBeFocused();

    await onboarding.locator('#previewMenuButton').click();
    await menu.locator('[data-ytcq-action="chat-enhancer"]').click();
    await pip.hover();
    const blogUrl = 'https://chatenhancer.com/blog/video-and-chat-picture-in-picture/';
    await expect(learnMore).toHaveAttribute('href', blogUrl);
    // Exercise the real link without depending on an unreleased public page.
    await context.route(blogUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Video + chat PiP</title>' }));
    try {
      const popupPromise = onboarding.waitForEvent('popup');
      await learnMore.click();
      const blog = await popupPromise;
      try {
        await expect(blog).toHaveURL(blogUrl);
        await expect(onboarding).toHaveTitle('Welcome aboard!');
      } finally {
        await blog.close();
      }
    } finally {
      await context.unroute(blogUrl);
    }
  });
};
