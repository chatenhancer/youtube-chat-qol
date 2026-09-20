/** Shared page setup and storage assertions for onboarding scenarios. */
import { expect, type BrowserContext, type Page } from '@playwright/test';
import { getExtensionId } from '../../support/extension';
import {
  getExtensionStorageValues,
  withExtensionStorageValues
} from '../../support/extension-storage';
import { withMockedTranslationEndpoint } from '../../support/translation-endpoint';

const INITIAL_OPTIONS = {
  chatSkin: 'system',
  lastTranslationTarget: 'en',
  liteModeEnabled: false,
  playgroundEnabled: false,
  targetLanguage: '',
  translationDisplay: 'replace'
};

export async function withOnboardingPage(
  context: BrowserContext,
  callback: (onboarding: Page) => Promise<void>
): Promise<void> {
  await withExtensionStorageValues(context, 'sync', INITIAL_OPTIONS, async () => {
    await withMockedTranslationEndpoint(
      context,
      '今はうまく機能しているようです',
      async () => {
        const onboarding = await context.newPage();
        try {
          const extensionId = await getExtensionId(context);
          await onboarding.setViewportSize({ height: 720, width: 1280 });
          await onboarding.emulateMedia({ colorScheme: 'light' });
          await onboarding.goto(`chrome-extension://${extensionId}/onboarding.html`);
          await expect(onboarding).toHaveTitle('Welcome aboard!');
          await callback(onboarding);
        } finally {
          await onboarding.close();
        }
      },
      'zh-CN'
    );
  });
}

export async function expectStoredOnboardingOptions(context: BrowserContext): Promise<void> {
  await expect
    .poll(async () => {
      return getExtensionStorageValues(context, 'sync', [
        'chatSkin',
        'lastTranslationTarget',
        'liteModeEnabled',
        'playgroundEnabled',
        'targetLanguage',
        'translationDisplay'
      ]);
    })
    .toEqual({
      chatSkin: 'custom:aero',
      lastTranslationTarget: 'ja',
      liteModeEnabled: true,
      playgroundEnabled: true,
      targetLanguage: 'ja',
      translationDisplay: 'below'
    });
}
