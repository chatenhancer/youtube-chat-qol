/** Feature, theme, and persistence coverage for the extension onboarding preview. */
import { expect } from '@playwright/test';
import { getExtensionStorageValues } from '../../support/extension-storage';
import type { ExtensionScenario } from '../types';
import { expectStoredOnboardingOptions, withOnboardingPage } from './fixture';

export const onboardingFeaturePreviewScenario: ExtensionScenario = async ({ context }) => {
  await withOnboardingPage(context, async (onboarding) => {
    await onboarding.locator('#onboardingTargetLanguage').selectOption('ja');
    await expect(onboarding.locator('#onboardingTranslationDisplayRow')).toBeVisible();
    await onboarding.locator('#onboardingTranslationDisplay').selectOption('below');
    await onboarding.locator('#onboardingPlaygroundEnabled').check();
    await onboarding.locator('#onboardingLiteModeEnabled').check();
    await expect.poll(() => getExtensionStorageValues(context, 'sync', [
      'liteModeEnabled', 'targetLanguage'
    ])).toEqual({ liteModeEnabled: true, targetLanguage: 'ja' });
    // Reopening onboarding must initialize both surfaces from saved options.
    await onboarding.reload();
    await expect(onboarding.locator('#onboardingLiteModeEnabled')).toBeChecked();
    await expect(onboarding.locator('#onboardingTargetLanguage')).toHaveValue('ja');
    await onboarding.locator('#previewMenuButton').click();
    const menu = onboarding.locator('#previewSettingsMenu');
    await expect(menu.locator('.preview-native-menu-item').first()).toBeFocused();
    await expect(menu.locator('.preview-native-menu-item')).toHaveCount(3);
    const lite = menu.locator('[data-ytcq-setting="liteModeEnabled"]');
    await expect(lite).toHaveAttribute('aria-checked', 'true');
    const translate = menu.locator('[data-ytcq-setting="targetLanguage"]');
    await expect(translate).toHaveAttribute('aria-checked', 'true');
    await translate.click();
    await expect(onboarding.locator('#onboardingTargetLanguage')).toHaveValue('');
    await expect(translate).toHaveAttribute('aria-checked', 'false');
    await translate.click();
    await expect(onboarding.locator('#onboardingTargetLanguage')).toHaveValue('ja');
    await expect(translate).toHaveAttribute('aria-checked', 'true');
    await lite.click();
    await expect(onboarding.locator('#onboardingLiteModeEnabled')).not.toBeChecked();
    await expect(lite).toHaveAttribute('aria-checked', 'false');
    await lite.click();
    await expect(onboarding.locator('#onboardingLiteModeEnabled')).toBeChecked();
    await lite.press('Escape');
    await expect(menu).toBeHidden();
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute('data-chat-skin', 'system');
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute('data-chat-theme', 'light');
    await expect(onboarding.locator('.ytcq-lite-mode-button')).toHaveCount(0);
    await expect(onboarding.locator('#previewGamesIcon')).toHaveCSS('color', 'rgb(15, 15, 15)');
    await onboarding.locator('#previewGamesIcon').hover();
    await expect(onboarding.locator('#previewGamesIcon')).toHaveCSS('color', 'rgb(15, 15, 15)');
    await expect(onboarding.locator('#previewGamesIcon')).toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0.2)'
    );
    await onboarding.locator('#onboardingChatSkin').selectOption('aero');

    await expect(onboarding.locator('#previewGamesIcon')).toBeVisible();
    await expect(onboarding.locator('#previewGamesIcon')).toHaveCSS(
      'animation-name',
      'preview-icon-enter'
    );
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute('role', 'group');
    await expect(onboarding.locator('.preview-chat-feed')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute('data-chat-skin', 'aero');
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute('data-chat-theme', 'light');
    await expect(onboarding.locator('html')).toHaveAttribute('data-ytcq-chat-skin', 'aero');
    await expect(onboarding.locator('html')).toHaveAttribute('data-ytcq-chat-skin-theme', 'light');
    await expect(onboarding.locator('#chatPreview')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)'
    );
    await expect(
      onboarding.locator('.preview-message yt-live-chat-author-chip + #message-container')
    ).toHaveCount(3);
    await expect
      .poll(() =>
        onboarding
          .locator('.preview-message-featured')
          .evaluate((message) => getComputedStyle(message).fontFamily)
      )
      .toContain('Tahoma');
    await expect
      .poll(() =>
        onboarding
          .locator('.preview-chat-header')
          .evaluate((header) => getComputedStyle(header).backgroundImage)
      )
      .toContain('data:image/png;base64');
    await expect(onboarding.locator('.preview-native-header-icon path').first()).toHaveCSS(
      'fill',
      'rgb(255, 255, 255)'
    );

    await onboarding.emulateMedia({ colorScheme: 'dark' });
    await expect(onboarding.locator('html')).toHaveCSS('color-scheme', 'dark');
    await expect(onboarding.locator('body')).toHaveCSS('background-color', 'rgb(40, 40, 40)');
    await expect(onboarding.locator('body')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(onboarding.locator('.settings-list > .setting-row').first()).toHaveCSS(
      'background-color',
      'rgba(255, 255, 255, 0.08)'
    );
    await expect(onboarding.locator('#onboardingChatSkin')).toHaveCSS(
      'background-color',
      'rgb(53, 53, 53)'
    );
    await expect
      .poll(() =>
        onboarding
          .locator('.onboarding-brand img')
          .evaluate((image) => getComputedStyle(image).content)
      )
      .toContain('logo-white.png');
    await expect(onboarding.locator('#chatPreview')).toHaveAttribute('data-chat-theme', 'dark');
    await expect(onboarding.locator('html')).toHaveAttribute('data-ytcq-chat-skin-theme', 'dark');
    await expect(onboarding.locator('#chatPreview')).toHaveCSS(
      'background-color',
      'rgb(8, 28, 45)'
    );
    await expect(onboarding.locator('#chatPreview')).toHaveCSS(
      'border-top-color',
      'rgb(64, 137, 180)'
    );
    await expect(onboarding.locator('.preview-chat-header')).toHaveCSS(
      'border-bottom-color',
      'rgb(6, 43, 73)'
    );
    await expect(onboarding.locator('.preview-chat-header')).not.toHaveCSS('box-shadow', 'none');
    await expect(onboarding.locator('.preview-chat-header')).toHaveCSS('z-index', '4');
    await expect(onboarding.locator('.preview-chat-feed')).toHaveCSS('z-index', '1');
    await expect(onboarding.locator('.preview-composer')).toHaveCSS(
      'border-top-color',
      'rgb(64, 137, 180)'
    );
    await onboarding.locator('.preview-composer-field').hover();
    await expect
      .poll(() =>
        onboarding
          .locator('.preview-composer-field')
          .evaluate((field) => getComputedStyle(field, '::before').borderTopColor)
      )
      .toBe('rgb(35, 72, 97)');
    await expect
      .poll(() =>
        onboarding
          .locator('.preview-skeleton-row')
          .first()
          .evaluate((row) => getComputedStyle(row, '::before').filter)
      )
      .toBe('none');
    await expect(onboarding.locator('.preview-native-header-icon path').first()).toHaveCSS(
      'fill',
      'rgb(255, 255, 255)'
    );
    await expect(onboarding.locator('.preview-send button')).toHaveCSS('background-image', 'none');
    await expect(onboarding.locator('.preview-send button')).toHaveCSS('box-shadow', 'none');
    await expect(onboarding.locator('.preview-send button')).toHaveCSS('border-top-width', '0px');
    await expect(onboarding.locator('.preview-send button')).toHaveCSS(
      'color',
      'rgb(181, 236, 255)'
    );
    await expectStoredOnboardingOptions(context);
  });
};
