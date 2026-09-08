/** Extension-only browser context for popup, onboarding, and provider contracts. */
import { test as base, type BrowserContext } from '@playwright/test';
import { closeExtensionContext, launchExtensionContext } from '../chrome';
import { dumpDomOnFailure } from '../dom-dump';
import { installDefaultTranslationMock } from '../translation-endpoint';
import {
  getDisposableWorkerProfileDir,
  isolateBrowserPage,
  resetExtensionStorage,
  shouldRunHeadlessBrowserTest,
  type ExtensionSession
} from './browser-session';

interface ExtensionTestFixtures {
  extensionContext: BrowserContext;
}

interface ExtensionWorkerFixtures {
  extensionWorkerSession: ExtensionSession;
}

export const extensionTest = base.extend<ExtensionTestFixtures, ExtensionWorkerFixtures>({
  extensionWorkerSession: [
    async ({ browserName }, use, workerInfo) => {
      void browserName;
      const context = await launchExtensionContext({
        headless: shouldRunHeadlessBrowserTest(),
        profileDir: getDisposableWorkerProfileDir('extension', workerInfo)
      });
      if (workerInfo.project.name !== 'integrations') await installDefaultTranslationMock(context);
      const page = await context.newPage();

      try {
        await use({ context, page });
      } finally {
        await closeExtensionContext(context);
      }
    },
    { scope: 'worker' }
  ],

  extensionContext: async ({ extensionWorkerSession }, use, testInfo) => {
    await isolateBrowserPage(extensionWorkerSession.page);
    await resetExtensionStorage(extensionWorkerSession.context);
    try {
      await use(extensionWorkerSession.context);
    } finally {
      await dumpDomOnFailure(extensionWorkerSession.context, testInfo);
    }
  }
});
