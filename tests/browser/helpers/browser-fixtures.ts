/**
 * Shared Playwright fixtures for extension browser tests.
 *
 * Browser launches are worker-scoped so feature specs can stay split by
 * behavior without reopening Chrome for every test. Test-scoped fixtures reset
 * the mock page or close transient extension surfaces before each assertion.
 */
import { expect, test as base, type BrowserContext, type FrameLocator, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import {
  cp,
  lstat,
  mkdir,
  rm
} from 'node:fs/promises';
import path from 'node:path';
import {
  closeExtensionContext,
  launchExtensionContext,
  launchNormalChromeExtensionContext
} from './chrome';
import { clearChatComposerIfVisible } from './composer';
import { dumpDomOnFailure } from './dom-dump';
import { getInstalledProfileExtensionId } from './extension';
import {
  createLiveChatFixtureHtml,
  fixtureLoggedOutLiveChatUrl,
  fixtureLoggedInLiveChatUrl,
  fixtureLoggedInReplayChatUrl
} from './live-chat-fixture';
import {
  defaultLiveUrl,
  extensionDir,
  getLiveProfileDir,
  getLiveWorkingProfilesDir
} from './paths';
import {
  getLiveUrl,
  getReplayUrl,
  getUnavailableSignedInReason,
  getUnavailableComposerReason,
  isChatComposerVisible,
  openLiveChat,
  startVideoPlaybackIfPaused
} from './youtube-page';

const DEFAULT_MOCK_HEADLESS = true;
const DEFAULT_LIVE_HEADLESS = true;
const LIVE_HEADLESS_USER_AGENT = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'AppleWebKit/537.36 (KHTML, like Gecko)',
  'Chrome/148.0.0.0 Safari/537.36'
].join(' ');
const TOP_LEVEL_TRANSIENT_SURFACE_SELECTOR = [
  'ytd-popup-container ytd-multi-page-menu-renderer',
  'ytd-popup-container ytd-menu-popup-renderer',
  'ytd-popup-container tp-yt-paper-dialog',
  'ytd-popup-container tp-yt-paper-toast',
  'tp-yt-iron-dropdown'
].join(',');
const ACTIVE_CHROME_PROFILE_FILE_NAMES = new Set([
  'SingletonCookie',
  'SingletonLock',
  'SingletonSocket'
]);
const RUNTIME_CHROME_PROFILE_FILE_NAMES = new Set([
  ...ACTIVE_CHROME_PROFILE_FILE_NAMES,
  '.ytcq-playwright-profile.lock',
  'DevToolsActivePort'
]);

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
  mockLoggedInReplaySession: MockSession;
}

interface MockWorkerFixtures {
  mockWorkerSession: MockSession;
}

interface LiveTestFixtures {
  liveLoggedOutSession: LiveSession;
  liveLoggedInSession: LiveSession | null;
  liveLoggedInReplaySession: LiveSession | null;
}

interface LiveWorkerFixtures {
  liveLoggedOutWorkerSession: LiveSession;
  liveLoggedInWorkerSession: LiveSession | null;
  liveLoggedInReplayWorkerSession: LiveSession | null;
}

export { expect };

export const mockTest = base.extend<MockTestFixtures, MockWorkerFixtures>({
  mockWorkerSession: [async ({ browserName }, use, workerInfo) => {
    void browserName;
    const context = await launchExtensionContext({
      headless: shouldRunHeadlessBrowserTest(),
      profileDir: path.join(workerInfo.project.outputDir, 'profiles', `mock-${workerInfo.workerIndex}`)
    });

    await context.route(/^https:\/\/www\.youtube\.com\/live_chat(?:_replay)?(?:\?|$)/, (route) => {
      const url = new URL(route.request().url());
      const loggedIn = url.searchParams.get('ytcq-auth') !== 'logged-out';
      const replay = url.pathname.includes('live_chat_replay');
      route.fulfill({
        body: createLiveChatFixtureHtml({ loggedIn, replay }),
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
  },

  mockLoggedInReplaySession: async ({ mockWorkerSession }, use, testInfo) => {
    await openMockChatPage(mockWorkerSession.page, fixtureLoggedInReplayChatUrl);
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
    const headless = shouldRunLiveHeadlessBrowserTest();
    const context = await launchExtensionContext({
      headless,
      profileDir: path.join(workerInfo.project.outputDir, 'profiles', `live-logged-out-${workerInfo.workerIndex}`),
      userAgent: getLiveBrowserUserAgent(headless)
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

  liveLoggedInReplayWorkerSession: [async ({ browserName }, use) => {
    void browserName;
    const session = await createLoggedInReplaySession();

    try {
      await use(session?.session || null);
    } finally {
      await session?.close();
    }
  }, { scope: 'worker' }],

  liveLoggedOutSession: async ({ liveLoggedOutWorkerSession }, use, testInfo) => {
    await resetLiveScenarioState(liveLoggedOutWorkerSession);
    try {
      await use(liveLoggedOutWorkerSession);
    } finally {
      await dumpDomOnFailure(liveLoggedOutWorkerSession.context, testInfo);
    }
  },

  liveLoggedInSession: async ({ liveLoggedInWorkerSession }, use, testInfo) => {
    if (liveLoggedInWorkerSession) {
      await resetLiveScenarioState(liveLoggedInWorkerSession);
    }
    try {
      await use(liveLoggedInWorkerSession);
    } finally {
      if (liveLoggedInWorkerSession) {
        await dumpDomOnFailure(liveLoggedInWorkerSession.context, testInfo);
      }
    }
  },

  liveLoggedInReplaySession: async ({ liveLoggedInReplayWorkerSession }, use, testInfo) => {
    if (liveLoggedInReplayWorkerSession) {
      await resetLiveScenarioState(liveLoggedInReplayWorkerSession);
    }
    try {
      await use(liveLoggedInReplayWorkerSession);
    } finally {
      if (liveLoggedInReplayWorkerSession) {
        await dumpDomOnFailure(liveLoggedInReplayWorkerSession.context, testInfo);
      }
    }
  }
});

export function skipIfLoggedInYouTubeUnavailable(
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
  return createLoggedInYouTubeSession({
    label: 'live stream',
    profileName: 'youtube-live-logged-in',
    requireComposer: true,
    url: getLiveUrl()
  });
}

async function createLoggedInReplaySession(): Promise<{
  close: () => Promise<void>;
  session: LiveSession;
} | null> {
  return createLoggedInYouTubeSession({
    label: 'live replay',
    profileName: 'youtube-live-replay',
    requireComposer: false,
    url: getReplayUrl()
  });
}

async function createLoggedInYouTubeSession({
  label,
  profileName,
  requireComposer,
  url
}: {
  label: string;
  profileName: string;
  requireComposer: boolean;
  url: string;
}): Promise<{
  close: () => Promise<void>;
  session: LiveSession;
} | null> {
  const sourceProfileDir = getLiveProfileDir();
  console.log(`Using logged-in Chrome source profile: ${sourceProfileDir}`);
  console.log(`Opening ${label}: ${url}`);

  if (!existsSync(path.join(sourceProfileDir, 'Default', 'Cookies'))) {
    return null;
  }

  const extensionId = await getInstalledProfileExtensionId(sourceProfileDir);
  if (!extensionId) {
    return null;
  }

  const profileDir = await prepareLoggedInWorkingProfile(sourceProfileDir, profileName);
  console.log(`Using logged-in Chrome working profile: ${profileDir}`);

  const chrome = await launchNormalChromeExtensionContext({
    headless: shouldRunLiveHeadlessBrowserTest(),
    initialUrl: url,
    profileDir,
    userAgent: getLiveBrowserUserAgent(shouldRunLiveHeadlessBrowserTest())
  });
  const { context } = chrome;
  const page = context.pages()[0] || await context.newPage();
  const chat = await openLiveChat(page, url);
  if (!requireComposer) {
    await startVideoPlaybackIfPaused(page);
  }
  const unavailableReason = requireComposer
    ? await getComposerUnavailableReason(page, chat)
    : await getUnavailableSignedInReason(page);

  return {
    close: async () => {
      await chrome.close();
    },
    session: {
      context,
      page,
      chat,
      unavailableReason
    }
  };
}

async function getComposerUnavailableReason(page: Page, chat: FrameLocator): Promise<string> {
  return await isChatComposerVisible(chat)
    ? ''
    : await getUnavailableComposerReason(page, chat);
}

async function resetLiveScenarioState(session: LiveSession): Promise<void> {
  await closeTopLevelYouTubeOverlays(session.page);
  await session.page.evaluate(() => {
    window.scrollTo(0, 0);
  }).catch(() => undefined);
  await closeChatNativeMenus(session.chat);
  await closeTransientSurfaces(session.chat);
  await clearComposerIfVisible(session.chat);
  await closeChatNativeMenus(session.chat);
}

async function closeTopLevelYouTubeOverlays(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('Escape').catch(() => undefined);
  }

  await page.locator(TOP_LEVEL_TRANSIENT_SURFACE_SELECTOR)
    .first()
    .waitFor({ state: 'hidden', timeout: 500 })
    .catch(() => undefined);
}

async function closeChatNativeMenus(chat: FrameLocator): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await chat.locator('body').press('Escape').catch(() => undefined);
  }
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

  await chat.locator('.ytcq-composer-translate-panel')
    .evaluateAll((panels) => {
      for (const panel of panels) {
        if (panel instanceof HTMLElement) panel.hidden = true;
      }
    })
    .catch(() => undefined);
}

async function clearComposerIfVisible(chat: FrameLocator): Promise<void> {
  await clearChatComposerIfVisible(chat).catch(() => undefined);
}

function getMissingLoggedInProfileReason(): string {
  return [
    'Skipping logged-in YouTube smoke because the prepared Chrome profile or installed extension was not found.',
    'Run `npm run test:youtube-login`, sign in to YouTube web, and make sure Chat Enhancer is loaded from:',
    extensionDir,
    `Pristine profile: ${getLiveProfileDir()}`,
    `Default livestream: ${defaultLiveUrl}`
  ].join(' ');
}

function shouldRunHeadlessBrowserTest(): boolean {
  const override = process.env.YTCQ_TEST_HEADLESS;
  if (override === '0') return false;
  if (override === '1') return true;
  return DEFAULT_MOCK_HEADLESS;
}

function shouldRunLiveHeadlessBrowserTest(): boolean {
  const override = process.env.YTCQ_TEST_LIVE_HEADLESS;
  if (override === '0') return false;
  if (override === '1') return true;
  return DEFAULT_LIVE_HEADLESS;
}

function getLiveBrowserUserAgent(headless: boolean): string | undefined {
  return headless ? (process.env.YTCQ_TEST_LIVE_USER_AGENT || LIVE_HEADLESS_USER_AGENT) : undefined;
}

async function prepareLoggedInWorkingProfile(sourceProfileDir: string, profileName: string): Promise<string> {
  const workingProfilesDir = getLiveWorkingProfilesDir();
  const profileDir = path.join(workingProfilesDir, profileName);

  if (isSameOrNestedPath(sourceProfileDir, profileDir) || isSameOrNestedPath(profileDir, sourceProfileDir)) {
    throw new Error([
      `Logged-in source profile and working profile overlap: ${sourceProfileDir} -> ${profileDir}`,
      'Use a separate YTCQ_CHROME_PROFILE or YTCQ_CHROME_WORKING_PROFILES value.'
    ].join('\n'));
  }

  await assertSourceProfileClosed(sourceProfileDir);
  await mkdir(workingProfilesDir, { recursive: true });
  await rm(profileDir, { recursive: true, force: true });
  await cp(sourceProfileDir, profileDir, {
    recursive: true,
    filter: (source) => !isRootChromeRuntimePath(source, sourceProfileDir)
  });
  await removeChromeRuntimeFiles(profileDir);

  return profileDir;
}

async function assertSourceProfileClosed(profileDir: string): Promise<void> {
  const activeFiles = await getExistingRootProfileFiles(profileDir, ACTIVE_CHROME_PROFILE_FILE_NAMES);
  if (activeFiles.length === 0) return;

  throw new Error([
    `The logged-in source Chrome profile appears to be open: ${profileDir}`,
    'Close the Chrome window opened by `npm run test:youtube-login`, then rerun the browser tests.',
    `Open-profile marker files: ${activeFiles.join(', ')}`
  ].join('\n'));
}

async function removeChromeRuntimeFiles(profileDir: string): Promise<void> {
  const runtimeFiles = await getExistingRootProfileFiles(profileDir, RUNTIME_CHROME_PROFILE_FILE_NAMES);
  await Promise.all(runtimeFiles.map((fileName) => {
    return rm(path.join(profileDir, fileName), {
      force: true,
      recursive: true
    });
  }));
}

async function getExistingRootProfileFiles(profileDir: string, fileNames: Set<string>): Promise<string[]> {
  const existingFiles: string[] = [];
  for (const fileName of fileNames) {
    const filePath = path.join(profileDir, fileName);
    const exists = await lstat(filePath).then(() => true, () => false);
    if (exists) existingFiles.push(fileName);
  }
  return existingFiles;
}

function isRootChromeRuntimePath(filePath: string, profileDir: string): boolean {
  const relativePath = path.relative(profileDir, filePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return false;
  if (relativePath.includes(path.sep)) return false;
  return RUNTIME_CHROME_PROFILE_FILE_NAMES.has(relativePath);
}

function isSameOrNestedPath(parentPath: string, childPath: string): boolean {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return !relativePath || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}
