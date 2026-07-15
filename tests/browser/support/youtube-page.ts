/**
 * Real YouTube page helpers for browser smoke tests.
 *
 * These helpers keep the live-page navigation, consent prompt handling, and
 * chat iframe access out of individual specs so new real-YouTube tests can
 * stay focused on extension behavior.
 */
import { expect, type FrameLocator, type Page } from '@playwright/test';
import { defaultLiveUrl, defaultReplayUrl, getLiveProfileDir } from './paths';

const CHAT_FRAME_SELECTOR = 'iframe#chatframe';
const COMPOSER_TIMEOUT_MS = 30_000;
const INITIAL_CHAT_FRAME_TIMEOUT_MS = 15_000;
const LIVE_PAGE_TIMEOUT_MS = 60_000;
const CONSENT_REJECT_BUTTON_NAMES = [
  /Reject all/i,
  /Rechazar todo/i,
  /Rejeitar tudo/i,
  /Tout refuser/i,
  /Alle ablehnen/i,
  /Rifiuta tutto/i,
  /모두 거부/,
  /すべて拒否/,
  /拒绝全部/,
  /全部拒絕/,
  /رفض الكل/
];
const CONSENT_ACCEPT_BUTTON_NAMES = [
  /Accept all/i,
  /Aceptar todo/i,
  /Aceitar tudo/i,
  /Tout accepter/i,
  /Alle akzeptieren/i,
  /Accetta tutto/i,
  /모두 수락/,
  /すべて承諾/,
  /全部接受/,
  /全部接受/,
  /قبول الكل/
];

export function getLiveUrl(): string {
  return process.env.YTCQ_LIVE_URL || defaultLiveUrl;
}

export function getReplayUrl(): string {
  return process.env.YTCQ_REPLAY_URL || defaultReplayUrl;
}

export async function openLiveChat(page: Page, liveUrl: string): Promise<FrameLocator> {
  for (const timeout of [INITIAL_CHAT_FRAME_TIMEOUT_MS, LIVE_PAGE_TIMEOUT_MS]) {
    await gotoLiveChatPage(page, liveUrl);
    await dismissYouTubeConsentIfPresent(page);
    if (await ensureLiveChatReady(page, timeout)) {
      await dismissYouTubeConsentIfPresent(page);
      return page.frameLocator(CHAT_FRAME_SELECTOR);
    }
    // YouTube can mount the iframe with its own "Something went wrong" page.
    // One same-URL navigation gives both the watch page and chat a fresh document.
  }

  const chat = page.frameLocator(CHAT_FRAME_SELECTOR);
  await expect(page.locator(CHAT_FRAME_SELECTOR)).toBeVisible({ timeout: 1_000 });
  await expect(chat.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 1_000 });
  return chat;
}

async function ensureLiveChatReady(page: Page, timeout: number): Promise<boolean> {
  if (!(await ensureLiveChatFrameVisible(page, timeout))) return false;
  return page
    .frameLocator(CHAT_FRAME_SELECTOR)
    .locator('yt-live-chat-renderer')
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function ensureLiveChatFrameVisible(page: Page, timeout: number): Promise<boolean> {
  const chatFrame = page.locator(CHAT_FRAME_SELECTOR);
  if (await chatFrame.isVisible({ timeout: 1_500 }).catch(() => false)) return true;

  const openPanelButtons = [
    page.getByRole('button', { name: /^Open panel$/i }).first(),
    page.getByRole('button', { name: /^Live chat$/i }).first(),
    page.locator('button[aria-label*="live chat" i]').first()
  ];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const button of openPanelButtons) {
      if (!(await button.isVisible({ timeout: 500 }).catch(() => false))) continue;
      if (!(await button.isEnabled().catch(() => false))) continue;
      await button.click({ timeout: 3_000 }).catch(() => undefined);
      if (await chatFrame.isVisible({ timeout: 10_000 }).catch(() => false)) return true;
    }
    await page.waitForTimeout(500);
  }

  return chatFrame
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false);
}

async function gotoLiveChatPage(page: Page, liveUrl: string): Promise<void> {
  try {
    await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: LIVE_PAGE_TIMEOUT_MS });
  } catch (error) {
    if (!isSameYouTubeReloadNavigation(error, liveUrl, page.url())) throw error;
    await page
      .waitForLoadState('domcontentloaded', { timeout: LIVE_PAGE_TIMEOUT_MS })
      .catch(() => undefined);
  }
}

function isSameYouTubeReloadNavigation(
  error: unknown,
  requestedUrl: string,
  currentUrl: string
): boolean {
  if (
    !(error instanceof Error) ||
    !error.message.includes('is interrupted by another navigation')
  ) {
    return false;
  }

  const requested = normalizeReloadUrl(requestedUrl);
  const current = normalizeReloadUrl(currentUrl);
  return Boolean(requested && current && requested === current);
}

function normalizeReloadUrl(value: string): string {
  try {
    const url = new URL(value);
    if (!url.hostname.endsWith('youtube.com')) return '';
    url.searchParams.delete('reload');
    url.hash = '';
    url.searchParams.sort();
    return url.toString();
  } catch {
    return '';
  }
}

export async function startVideoPlaybackIfPaused(page: Page): Promise<void> {
  const video = page.locator('video').first();
  await video.waitFor({ state: 'attached', timeout: 15_000 });
  await resumeVideoIfPaused(page, video);
  await waitForYouTubeContentVideo(page);
  await resumeVideoIfPaused(page, video);

  await expect
    .poll(async () => !(await isVideoPaused(video)), {
      message: 'Expected replay video playback to start so chat replay messages can render.',
      timeout: 10_000
    })
    .toBe(true);
}

export async function waitForYouTubeContentVideo(page: Page): Promise<void> {
  const player = page.locator('#movie_player').first();
  const skipAd = player.locator('.ytp-skip-ad-button, .ytp-ad-skip-button-modern').first();
  await player.waitFor({ state: 'attached', timeout: 20_000 });
  await expect
    .poll(
      async () => {
        const adShowing = await player.evaluate((element) =>
          element.classList.contains('ad-showing')
        );
        if (adShowing && (await skipAd.isVisible().catch(() => false))) {
          await skipAd.click({ timeout: 1_000 }).catch(() => undefined);
        }
        return adShowing;
      },
      {
        intervals: [250, 500, 1_000],
        message: 'Expected YouTube to finish any pre-roll or seek-triggered ad.',
        timeout: 60_000
      }
    )
    .toBe(false);
}

async function resumeVideoIfPaused(page: Page, video: ReturnType<Page['locator']>): Promise<void> {
  if (!(await isVideoPaused(video))) return;

  for (const playButton of [
    page.locator('.ytp-large-play-button').first(),
    page.locator('.ytp-play-button').first(),
    page.getByRole('button', { name: /^Play\b/i }).first()
  ]) {
    if (!(await playButton.isVisible({ timeout: 500 }).catch(() => false))) continue;
    await playButton.click({ timeout: 2_000 }).catch(() => undefined);
    if (!(await isVideoPaused(video))) return;
  }

  await video
    .evaluate((element) => {
      if (!(element instanceof HTMLVideoElement)) return;
      void element.play().catch(() => undefined);
    })
    .catch(() => undefined);
}

export async function isChatComposerVisible(chat: FrameLocator): Promise<boolean> {
  return chat
    .locator('yt-live-chat-message-input-renderer')
    .first()
    .waitFor({ state: 'visible', timeout: COMPOSER_TIMEOUT_MS })
    .then(
      () => true,
      () => false
    );
}

export async function getUnavailableComposerReason(
  page: Page,
  chat: FrameLocator
): Promise<string> {
  const unavailableSignedInReason = await getUnavailableSignedInReason(page);
  if (unavailableSignedInReason) return unavailableSignedInReason;

  const chatText = await chat
    .locator('body')
    .innerText({ timeout: 1_000 })
    .catch(() => '');
  const compactChatText = chatText.replace(/\s+/g, ' ').trim();
  if (compactChatText) {
    return `Skipping logged-in live smoke because YouTube did not expose the chat composer. Chat text: ${compactChatText.slice(0, 240)}`;
  }

  return 'Skipping logged-in live smoke because YouTube did not expose the chat composer.';
}

export async function getUnavailableSignedInReason(page: Page): Promise<string> {
  if (
    await page
      .getByRole('button', { name: /sign in/i })
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false)
  ) {
    return [
      'Skipping logged-in YouTube smoke because YouTube still shows Sign in.',
      'Run `npm run test:youtube-login` in a normal Chrome window first.',
      `Profile directory: ${getLiveProfileDir()}`
    ].join(' ');
  }

  if (
    await page
      .getByText(/Verify it.?s you/i)
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false)
  ) {
    return [
      'Skipping logged-in YouTube smoke because Google requires account verification.',
      'Complete Chrome account verification through `npm run test:youtube-login` or use a real Chrome tab manual smoke instead.',
      `Profile directory: ${getLiveProfileDir()}`
    ].join(' ');
  }

  return '';
}

async function dismissYouTubeConsentIfPresent(page: Page): Promise<void> {
  if (!(await hasYouTubeConsentPrompt(page))) return;

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    for (const name of [...CONSENT_REJECT_BUTTON_NAMES, ...CONSENT_ACCEPT_BUTTON_NAMES]) {
      const roleButton = page.getByRole('button', { name }).first();
      const textButton = page.locator('button').filter({ hasText: name }).first();

      for (const button of [roleButton, textButton]) {
        if (!(await button.isVisible({ timeout: 250 }).catch(() => false))) continue;

        await page
          .locator('ytd-consent-bump-v2-lightbox .loading-overlay')
          .waitFor({ state: 'hidden', timeout: 5_000 })
          .catch(() => undefined);

        const clicked = await button
          .click({ timeout: 2_000 })
          .then(() => true)
          .catch(() => false);
        if (!clicked) continue;

        await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        return;
      }
    }

    await page.waitForTimeout(500);
  }
}

async function hasYouTubeConsentPrompt(page: Page): Promise<boolean> {
  if (
    await page
      .locator('ytd-consent-bump-v2-lightbox')
      .first()
      .isVisible({ timeout: 750 })
      .catch(() => false)
  ) {
    return true;
  }

  if (
    await page
      .getByText(/Before you continue to YouTube/i)
      .first()
      .isVisible({ timeout: 250 })
      .catch(() => false)
  ) {
    return true;
  }

  for (const name of [...CONSENT_REJECT_BUTTON_NAMES, ...CONSENT_ACCEPT_BUTTON_NAMES]) {
    const roleButton = page.getByRole('button', { name }).first();
    const textButton = page.locator('button').filter({ hasText: name }).first();
    if (await roleButton.isVisible({ timeout: 50 }).catch(() => false)) return true;
    if (await textButton.isVisible({ timeout: 50 }).catch(() => false)) return true;
  }

  return false;
}

async function isVideoPaused(video: ReturnType<Page['locator']>): Promise<boolean> {
  return video
    .evaluate((element) => {
      return element instanceof HTMLVideoElement ? element.paused : true;
    })
    .catch(() => true);
}
