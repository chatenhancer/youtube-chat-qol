/** Deterministic YouTube chat browser fixtures. */
import { expect, test as base } from '@playwright/test';
import { closeExtensionContext, launchExtensionContext } from '../chrome';
import { dumpDomOnFailure } from '../dom-dump';
import { installDefaultTranslationMock } from '../translation-endpoint';
import {
  createLiveChatFixtureHtml,
  fixtureLoggedOutLiveChatUrl,
  fixtureLoggedInLiveChatUrl,
  fixtureLoggedInReplayChatUrl,
  fixtureStudioLoggedInLiveChatUrl
} from '../live-chat-fixture';
import {
  getDisposableWorkerProfileDir,
  isolateBrowserPage,
  resetExtensionStorage,
  shouldRunHeadlessBrowserTest,
  type MockYouTubeSession
} from './browser-session';

interface YouTubeMockTestFixtures {
  mockLoggedOutSession: MockYouTubeSession;
  mockLoggedInSession: MockYouTubeSession;
  mockLoggedInReplaySession: MockYouTubeSession;
  mockStudioLoggedInSession: MockYouTubeSession;
}

interface YouTubeMockWorkerFixtures {
  mockWorkerSession: MockYouTubeSession;
}

export const youtubeMockTest = base.extend<YouTubeMockTestFixtures, YouTubeMockWorkerFixtures>({
  mockWorkerSession: [
    async ({ browserName }, use, workerInfo) => {
      void browserName;
      const context = await launchExtensionContext({
        headless: shouldRunHeadlessBrowserTest(),
        profileDir: getDisposableWorkerProfileDir('mock', workerInfo)
      });

      if (workerInfo.project.name !== 'integrations') await installDefaultTranslationMock(context);

      await context.route(
        /^https:\/\/(?:studio|www)\.youtube\.com\/live_chat(?:_replay)?(?:\?|$)/,
        (route) => {
          const url = new URL(route.request().url());
          const loggedIn = url.searchParams.get('ytcq-auth') !== 'logged-out';
          const replay = url.pathname.includes('live_chat_replay');
          route.fulfill({
            body: createLiveChatFixtureHtml({ loggedIn, replay }),
            contentType: 'text/html'
          });
        }
      );
      await context.route(
        /^https:\/\/(?:studio|www)\.youtube\.com\/youtubei\/v1\/live_chat\/get_live_chat(?:_replay)?\?ytcq-fixture=1$/,
        (route) => {
          route.fulfill({
            body: route.request().postData() || '{}',
            contentType: 'application/json'
          });
        }
      );

      const page = await context.newPage();

      try {
        await use({ context, page });
      } finally {
        await closeExtensionContext(context);
      }
    },
    { scope: 'worker' }
  ],

  mockLoggedOutSession: async ({ mockWorkerSession }, use, testInfo) => {
    await openMockChatPage(mockWorkerSession, fixtureLoggedOutLiveChatUrl);
    try {
      await use(mockWorkerSession);
    } finally {
      await dumpDomOnFailure(mockWorkerSession.context, testInfo);
    }
  },

  mockLoggedInSession: async ({ mockWorkerSession }, use, testInfo) => {
    await openMockChatPage(mockWorkerSession, fixtureLoggedInLiveChatUrl);
    try {
      await use(mockWorkerSession);
    } finally {
      await dumpDomOnFailure(mockWorkerSession.context, testInfo);
    }
  },

  mockLoggedInReplaySession: async ({ mockWorkerSession }, use, testInfo) => {
    await openMockChatPage(mockWorkerSession, fixtureLoggedInReplayChatUrl);
    try {
      await use(mockWorkerSession);
    } finally {
      await dumpDomOnFailure(mockWorkerSession.context, testInfo);
    }
  },

  mockStudioLoggedInSession: async ({ mockWorkerSession }, use, testInfo) => {
    await openMockChatPage(mockWorkerSession, fixtureStudioLoggedInLiveChatUrl);
    try {
      await use(mockWorkerSession);
    } finally {
      await dumpDomOnFailure(mockWorkerSession.context, testInfo);
    }
  }
});

async function openMockChatPage(session: MockYouTubeSession, url: string): Promise<void> {
  await isolateBrowserPage(session.page);
  await resetExtensionStorage(session.context);
  await session.page.goto(url, { timeout: 15_000, waitUntil: 'commit' });
  await expect(session.page.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 15_000 });
  await expect(session.page.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 15_000 });
}
