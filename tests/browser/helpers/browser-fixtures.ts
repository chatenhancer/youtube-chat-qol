/**
 * Shared Playwright fixtures for extension browser tests.
 *
 * Browser launches are worker-scoped so feature specs can stay split by
 * behavior without reopening Chrome for every test. Test-scoped fixtures reset
 * the mock page or close transient extension surfaces before each assertion.
 */
import { expect, test as base, type BrowserContext, type FrameLocator, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  closeExtensionContext,
  launchExtensionContext,
  launchNormalChromeExtensionContext
} from './chrome';
import { dumpDomOnFailure } from './dom-dump';
import { getInstalledProfileExtensionId } from './extension';
import {
  createLiveChatFixtureHtml,
  fixtureLoggedOutLiveChatUrl,
  fixtureLoggedInLiveChatUrl
} from './live-chat-fixture';
import {
  defaultLiveUrl,
  extensionDir,
  getLiveProfileDir
} from './paths';
import {
  getLiveUrl,
  getUnavailableComposerReason,
  isChatComposerVisible,
  openLiveChat,
  primeYouTubeSession
} from './youtube-page';

const DEFAULT_MOCK_HEADLESS = true;

export interface MockSession {
  context: BrowserContext;
  page: Page;
}

export interface LiveSession {
  context: BrowserContext;
  page: Page;
  chat: FrameLocator;
  unavailableReason?: string;
}

interface MockTestFixtures {
  mockLoggedOutSession: MockSession;
  mockLoggedInSession: MockSession;
}

interface MockWorkerFixtures {
  mockWorkerSession: MockSession;
}

interface LiveTestFixtures {
  liveLoggedOutSession: LiveSession;
  liveLoggedInSession: LiveSession | null;
}

interface LiveWorkerFixtures {
  liveLoggedOutWorkerSession: LiveSession;
  liveLoggedInWorkerSession: LiveSession | null;
}

export { expect };

export const mockTest = base.extend<MockTestFixtures, MockWorkerFixtures>({
  mockWorkerSession: [async ({ browserName }, use, workerInfo) => {
    void browserName;
    const context = await launchExtensionContext({
      headless: shouldRunHeadlessBrowserTest(),
      profileDir: path.join(workerInfo.project.outputDir, 'profiles', `mock-${workerInfo.workerIndex}`)
    });

    await context.route('https://www.youtube.com/live_chat*', (route) => {
      const url = new URL(route.request().url());
      const loggedIn = url.searchParams.get('ytcq-auth') !== 'logged-out';
      route.fulfill({
        body: createLiveChatFixtureHtml({ loggedIn }),
        contentType: 'text/html'
      });
    });

    const page = await context.newPage();

    try {
      await use({ context, page });
    } finally {
      await closeExtensionContext(context);
    }
  }, { scope: 'worker' }],

  mockLoggedOutSession: async ({ mockWorkerSession }, use, testInfo) => {
    await openMockChatPage(mockWorkerSession.page, fixtureLoggedOutLiveChatUrl);
    try {
      await use(mockWorkerSession);
    } finally {
      await dumpDomOnFailure(mockWorkerSession.context, testInfo);
    }
  },

  mockLoggedInSession: async ({ mockWorkerSession }, use, testInfo) => {
    await openMockChatPage(mockWorkerSession.page, fixtureLoggedInLiveChatUrl);
    try {
      await use(mockWorkerSession);
    } finally {
      await dumpDomOnFailure(mockWorkerSession.context, testInfo);
    }
  }
});

export const liveTest = base.extend<LiveTestFixtures, LiveWorkerFixtures>({
  liveLoggedOutWorkerSession: [async ({ browserName }, use, workerInfo) => {
    void browserName;
    const context = await launchExtensionContext({
      headless: false,
      profileDir: path.join(workerInfo.project.outputDir, 'profiles', `live-logged-out-${workerInfo.workerIndex}`)
    });

    const page = await context.newPage();
    const chat = await openLiveChat(page, getLiveUrl());

    try {
      await use({ context, page, chat });
    } finally {
      await closeExtensionContext(context);
    }
  }, { scope: 'worker' }],

  liveLoggedInWorkerSession: [async ({ browserName }, use) => {
    void browserName;
    const session = await createLoggedInLiveSession();

    try {
      await use(session?.session || null);
    } finally {
      await session?.close();
    }
  }, { scope: 'worker' }],

  liveLoggedOutSession: async ({ liveLoggedOutWorkerSession }, use, testInfo) => {
    await closeTransientSurfaces(liveLoggedOutWorkerSession.chat);
    try {
      await use(liveLoggedOutWorkerSession);
    } finally {
      await dumpDomOnFailure(liveLoggedOutWorkerSession.context, testInfo);
      await closeTransientSurfaces(liveLoggedOutWorkerSession.chat);
    }
  },

  liveLoggedInSession: async ({ liveLoggedInWorkerSession }, use, testInfo) => {
    if (liveLoggedInWorkerSession) {
      await closeTransientSurfaces(liveLoggedInWorkerSession.chat);
    }
    try {
      await use(liveLoggedInWorkerSession);
    } finally {
      if (liveLoggedInWorkerSession) {
        await dumpDomOnFailure(liveLoggedInWorkerSession.context, testInfo);
        await closeTransientSurfaces(liveLoggedInWorkerSession.chat);
      }
    }
  }
});

export function skipIfLoggedInLiveUnavailable(
  test: typeof liveTest,
  session: LiveSession | null
): asserts session is LiveSession {
  test.skip(!session, getMissingLoggedInProfileReason());
  test.skip(Boolean(session?.unavailableReason), session?.unavailableReason || '');
}

async function openMockChatPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { timeout: 15_000, waitUntil: 'commit' });
  await expect(page.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 15_000 });
}

async function createLoggedInLiveSession(): Promise<{
  close: () => Promise<void>;
  session: LiveSession;
} | null> {
  const profileDir = getLiveProfileDir();
  const liveUrl = getLiveUrl();
  console.log(`Using logged-in Chrome profile: ${profileDir}`);
  console.log(`Opening live stream: ${liveUrl}`);

  if (!existsSync(path.join(profileDir, 'Default', 'Cookies'))) {
    return null;
  }

  const extensionId = await getInstalledProfileExtensionId(profileDir);
  if (!extensionId) {
    return null;
  }

  const chrome = await launchNormalChromeExtensionContext({
    initialUrl: liveUrl,
    profileDir
  });
  const { context } = chrome;
  const page = context.pages()[0] || await context.newPage();
  await primeYouTubeSession(page);
  const chat = await openLiveChat(page, liveUrl);
  const unavailableReason = await isChatComposerVisible(chat)
    ? ''
    : await getUnavailableComposerReason(page, chat);

  return {
    close: chrome.close,
    session: {
      context,
      page,
      chat,
      unavailableReason
    }
  };
}

async function closeTransientSurfaces(chat: FrameLocator): Promise<void> {
  await chat.locator([
    '.ytcq-focus-card',
    '.ytcq-inbox-card',
    '.ytcq-profile-card:not(.ytcq-inbox-card)'
  ].join(',')).evaluateAll((elements) => {
    for (const element of elements) {
      element.remove();
    }
  }).catch(() => undefined);

  const composerTranslatePanel = chat.locator('.ytcq-composer-translate-panel').first();
  if (!await composerTranslatePanel.isVisible({ timeout: 500 }).catch(() => false)) return;

  await composerTranslatePanel
    .evaluate((panel) => {
      if (panel instanceof HTMLElement) panel.hidden = true;
    })
    .catch(() => undefined);
}

function getMissingLoggedInProfileReason(): string {
  return [
    'Skipping logged-in live smoke because the prepared Chrome profile or installed extension was not found.',
    'Run `npm run test:youtube-login`, sign in to YouTube web, and make sure Chat Enhancer is loaded from:',
    extensionDir,
    `Default livestream: ${defaultLiveUrl}`
  ].join(' ');
}

function shouldRunHeadlessBrowserTest(): boolean {
  const override = process.env.YTCQ_TEST_HEADLESS;
  if (override === '0') return false;
  if (override === '1') return true;
  return DEFAULT_MOCK_HEADLESS;
}
