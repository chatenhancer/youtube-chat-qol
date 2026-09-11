/** Initial rendering and layout coverage for the extension onboarding page. */
import { expect } from '@playwright/test';
import type { ExtensionScenario } from '../types';
import { withOnboardingPage } from './fixture';

export const onboardingRenderingScenario: ExtensionScenario = async ({ context }) => {
  await withOnboardingPage(context, async (onboarding) => {
    await expect(onboarding.locator('link[href="content.css"]')).toHaveCount(1);
    await expect(onboarding.locator('.onboarding-brand')).toHaveAttribute(
      'href',
      'https://www.chatenhancer.com/'
    );
    await expect(onboarding.locator('.onboarding-brand')).toHaveAttribute('target', '_blank');
    await expect(onboarding.locator('.onboarding-brand')).toHaveAttribute(
      'aria-label',
      'Chat Enhancer for YouTube'
    );
    await expect(onboarding.locator('.onboarding-brand img')).toHaveAttribute('src', 'logo.png');
    await expect(onboarding.locator('.onboarding-brand img')).toHaveAttribute('alt', '');
    await expect
      .poll(() =>
        onboarding.locator('[data-i18n]').evaluateAll((elements) =>
          elements.every((element) => {
            const key = (element as HTMLElement).dataset.i18n;
            return Boolean(element.textContent?.trim()) && element.textContent !== key;
          })
        )
      )
      .toBe(true);
    await expect(onboarding.locator('.settings-intro h1')).toBeVisible();
    await expect
      .poll(async () => {
        const [column, panel, note] = await Promise.all([
          onboarding.locator('.settings-column').boundingBox(),
          onboarding.locator('.settings-panel').boundingBox(),
          onboarding.locator('.settings-close-note').boundingBox()
        ]);
        if (!column || !panel || !note) return false;
        return note.y >= panel.y + panel.height && note.y + note.height <= column.y + column.height;
      })
      .toBe(true);
    await expect(onboarding.locator('.preview-feature-breakdown a')).toHaveAttribute(
      'href',
      'https://www.chatenhancer.com/'
    );
    await expect(onboarding.locator('.preview-feature-breakdown a')).toHaveAttribute(
      'target',
      '_blank'
    );
    await expect(onboarding.locator('.preview-feature-breakdown a')).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    await expect
      .poll(async () => {
        const [title, hint, preview] = await Promise.all([
          onboarding.locator('.preview-title').boundingBox(),
          onboarding.locator('.preview-hover-hint').boundingBox(),
          onboarding.locator('#chatPreview').boundingBox()
        ]);
        if (!title || !hint || !preview) return false;
        return hint.y >= title.y + title.height && hint.y + hint.height <= preview.y;
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const [preview, breakdown] = await Promise.all([
          onboarding.locator('#chatPreview').boundingBox(),
          onboarding.locator('.preview-feature-breakdown').boundingBox()
        ]);
        if (!preview || !breakdown) return false;
        return breakdown.y >= preview.y + preview.height;
      })
      .toBe(true);
    await expect(onboarding.locator('#onboardingTargetLanguage')).toHaveValue('');
    await expect(onboarding.locator('#onboardingTranslationDisplayRow')).toBeHidden();
    await expect(onboarding.locator('#previewGamesIcon')).toBeHidden();
    await expect(onboarding.locator('#previewChatMenuTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewInboxTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewDraftTranslatorTooltip')).toBeHidden();
    await expect(onboarding.locator('#previewEmojiPickerTooltip')).toBeHidden();
    await expect(onboarding.locator('.ytcq-lite-mode-button')).toHaveCount(0);
    for (const theme of ['light', 'dark'] as const) {
      await onboarding.emulateMedia({ colorScheme: theme });
      const preview = onboarding.locator('#chatPreview');
      await expect(preview).toHaveAttribute('data-chat-theme', theme);
      await expect(preview).toBeInViewport();
      await expect(onboarding.locator('.preview-top-chat')).toHaveCSS(
        'color',
        theme === 'light' ? 'rgb(15, 15, 15)' : 'rgb(255, 255, 255)'
      );
      await expect.poll(() => preview.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll<HTMLElement>(
          '.preview-chat-header, .preview-message, .preview-composer'
        )).every((child) => {
          const rect = child.getBoundingClientRect();
          return rect.left >= bounds.left && rect.right <= bounds.right &&
            rect.top >= bounds.top && rect.bottom <= bounds.bottom;
        }) && element.scrollWidth <= element.clientWidth;
      })).toBe(true);
      await expect(onboarding.locator('#previewComposerTranslateIcon')).toBeVisible();
      await expect(onboarding.locator('#previewInboxIcon')).toBeVisible();
    }
  });
};
