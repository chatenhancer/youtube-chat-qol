/**
 * Real YouTube page helpers for browser smoke tests.
 *
 * These helpers keep the live-page navigation, consent prompt handling, and
 * chat iframe access out of individual specs so new real-YouTube tests can
 * stay focused on extension behavior.
 */
import { expect, type FrameLocator, type Page } from '@playwright/test';
import { defaultLiveUrl, getLiveProfileDir } from './paths';

const CHAT_FRAME_SELECTOR = 'iframe#chatframe';
const COMPOSER_TIMEOUT_MS = 30_000;
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

export async function openLiveChat(page: Page, liveUrl: string): Promise<FrameLocator> {
  await page.goto(liveUrl, { waitUntil: 'domcontentloaded', timeout: LIVE_PAGE_TIMEOUT_MS });
  await dismissYouTubeConsentIfPresent(page);
  await expect(page.locator(CHAT_FRAME_SELECTOR)).toBeVisible({ timeout: LIVE_PAGE_TIMEOUT_MS });
  await dismissYouTubeConsentIfPresent(page);
  return page.frameLocator(CHAT_FRAME_SELECTOR);
}

export async function isChatComposerVisible(chat: FrameLocator): Promise<boolean> {
  return chat.locator('yt-live-chat-message-input-renderer')
    .first()
    .waitFor({ state: 'visible', timeout: COMPOSER_TIMEOUT_MS })
    .then(() => true, () => false);
}

export async function getUnavailableComposerReason(page: Page, chat: FrameLocator): Promise<string> {
  if (await page.getByRole('button', { name: /sign in/i }).first().isVisible({ timeout: 500 }).catch(() => false)) {
    return [
      'Skipping logged-in live smoke because YouTube still shows Sign in.',
      'Run `npm run test:youtube-login` in a normal Chrome window first.',
      `Profile directory: ${getLiveProfileDir()}`
    ].join(' ');
  }

  if (await page.getByText(/Verify it.?s you/i).first().isVisible({ timeout: 500 }).catch(() => false)) {
    return [
      'Skipping logged-in live smoke because Google requires account verification.',
      'Complete Chrome account verification through `npm run test:youtube-login` or use a real Chrome tab manual smoke instead.',
      `Profile directory: ${getLiveProfileDir()}`
    ].join(' ');
  }

  const chatText = await chat.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
  const compactChatText = chatText.replace(/\s+/g, ' ').trim();
  if (compactChatText) {
    return `Skipping logged-in live smoke because YouTube did not expose the chat composer. Chat text: ${compactChatText.slice(0, 240)}`;
  }

  return 'Skipping logged-in live smoke because YouTube did not expose the chat composer.';
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

        await page.locator('ytd-consent-bump-v2-lightbox .loading-overlay')
          .waitFor({ state: 'hidden', timeout: 5_000 })
          .catch(() => undefined);

        const clicked = await button.click({ timeout: 2_000 })
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
  if (await page.locator('ytd-consent-bump-v2-lightbox').first().isVisible({ timeout: 750 }).catch(() => false)) {
    return true;
  }

  if (await page.getByText(/Before you continue to YouTube/i).first().isVisible({ timeout: 250 }).catch(() => false)) {
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
