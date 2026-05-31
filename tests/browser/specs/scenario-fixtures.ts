/**
 * Normalized Playwright fixtures for browser scenarios.
 *
 * Each plan-case spec imports one of these test objects, so reusable scenarios
 * can be passed directly to Playwright as `test(title, scenario)`.
 */
import type { BrowserContext } from '@playwright/test';
import {
  liveTest,
  mockTest,
  skipIfLoggedInLiveUnavailable
} from '../helpers/browser-fixtures';
import type { ChatSurface } from '../helpers/chat-surface';

interface BrowserScenarioFixtures {
  chat: ChatSurface;
  extensionContext: BrowserContext;
}

export const loggedInMockTest = mockTest.extend<BrowserScenarioFixtures>({
  chat: async ({ mockLoggedInSession }, use) => {
    await use(mockLoggedInSession.page);
  },

  extensionContext: async ({ mockLoggedInSession }, use) => {
    await use(mockLoggedInSession.context);
  }
});

export const loggedOutMockTest = mockTest.extend<BrowserScenarioFixtures>({
  chat: async ({ mockLoggedOutSession }, use) => {
    await use(mockLoggedOutSession.page);
  },

  extensionContext: async ({ mockLoggedOutSession }, use) => {
    await use(mockLoggedOutSession.context);
  }
});

export const loggedInLiveTest = liveTest.extend<BrowserScenarioFixtures>({
  chat: async ({ liveLoggedInSession }, use) => {
    skipIfLoggedInLiveUnavailable(liveTest, liveLoggedInSession);
    await use(liveLoggedInSession.chat);
  },

  extensionContext: async ({ liveLoggedInSession }, use) => {
    skipIfLoggedInLiveUnavailable(liveTest, liveLoggedInSession);
    await use(liveLoggedInSession.context);
  }
});

export const loggedOutLiveTest = liveTest.extend<BrowserScenarioFixtures>({
  chat: async ({ liveLoggedOutSession }, use) => {
    await use(liveLoggedOutSession.chat);
  },

  extensionContext: async ({ liveLoggedOutSession }, use) => {
    await use(liveLoggedOutSession.context);
  }
});
