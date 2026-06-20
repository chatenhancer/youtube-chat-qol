/**
 * Normalized Playwright fixtures for browser scenarios.
 *
 * Each plan-case spec imports one of these test objects, so reusable scenarios
 * can be passed directly to Playwright as `test(title, scenario)`.
 */
import type { BrowserContext, Page } from '@playwright/test';
import {
  liveTest,
  mockTest,
  skipIfLoggedInYouTubeUnavailable
} from './browser-fixtures';
import type { ChatSurface } from './chat-surface';

interface BrowserScenarioFixtures {
  chat: ChatSurface;
  context: BrowserContext;
  page: Page;
}

export const loggedInMockTest = mockTest.extend<BrowserScenarioFixtures>({
  chat: async ({ mockLoggedInSession }, use) => {
    await use(mockLoggedInSession.page);
  },

  context: async ({ mockLoggedInSession }, use) => {
    await use(mockLoggedInSession.context);
  },

  page: async ({ mockLoggedInSession }, use) => {
    await use(mockLoggedInSession.page);
  }
});

export const loggedInMockReplayTest = mockTest.extend<BrowserScenarioFixtures>({
  chat: async ({ mockLoggedInReplaySession }, use) => {
    await use(mockLoggedInReplaySession.page);
  },

  context: async ({ mockLoggedInReplaySession }, use) => {
    await use(mockLoggedInReplaySession.context);
  },

  page: async ({ mockLoggedInReplaySession }, use) => {
    await use(mockLoggedInReplaySession.page);
  }
});

export const loggedOutMockTest = mockTest.extend<BrowserScenarioFixtures>({
  chat: async ({ mockLoggedOutSession }, use) => {
    await use(mockLoggedOutSession.page);
  },

  context: async ({ mockLoggedOutSession }, use) => {
    await use(mockLoggedOutSession.context);
  },

  page: async ({ mockLoggedOutSession }, use) => {
    await use(mockLoggedOutSession.page);
  }
});

export const loggedInLiveTest = liveTest.extend<BrowserScenarioFixtures>({
  chat: async ({ liveLoggedInSession }, use) => {
    skipIfLoggedInYouTubeUnavailable(liveTest, liveLoggedInSession);
    await use(liveLoggedInSession.chat);
  },

  context: async ({ liveLoggedInSession }, use) => {
    skipIfLoggedInYouTubeUnavailable(liveTest, liveLoggedInSession);
    await use(liveLoggedInSession.context);
  },

  page: async ({ liveLoggedInSession }, use) => {
    skipIfLoggedInYouTubeUnavailable(liveTest, liveLoggedInSession);
    await use(liveLoggedInSession.page);
  }
});

export const loggedInLiveReplayTest = liveTest.extend<BrowserScenarioFixtures>({
  chat: async ({ liveLoggedInReplaySession }, use) => {
    skipIfLoggedInYouTubeUnavailable(liveTest, liveLoggedInReplaySession);
    await use(liveLoggedInReplaySession.chat);
  },

  context: async ({ liveLoggedInReplaySession }, use) => {
    skipIfLoggedInYouTubeUnavailable(liveTest, liveLoggedInReplaySession);
    await use(liveLoggedInReplaySession.context);
  },

  page: async ({ liveLoggedInReplaySession }, use) => {
    skipIfLoggedInYouTubeUnavailable(liveTest, liveLoggedInReplaySession);
    await use(liveLoggedInReplaySession.page);
  }
});

export const loggedOutLiveTest = liveTest.extend<BrowserScenarioFixtures>({
  chat: async ({ liveLoggedOutSession }, use) => {
    await use(liveLoggedOutSession.chat);
  },

  context: async ({ liveLoggedOutSession }, use) => {
    await use(liveLoggedOutSession.context);
  },

  page: async ({ liveLoggedOutSession }, use) => {
    await use(liveLoggedOutSession.page);
  }
});
