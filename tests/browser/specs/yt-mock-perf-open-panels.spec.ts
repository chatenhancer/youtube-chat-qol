/**
 * Mock performance coverage for live-updating extension panels.
 *
 * Focus mode, recent-message cards, and the Inbox all listen for new messages.
 * This test keeps those surfaces open during a burst so panel updates,
 * translation rendering, and keyword records are stressed together.
 */
import { expect, mockTest as test } from '../support/browser-fixtures';
import { withExtensionStorageValues } from '../support/extension-storage';
import { cleanVisibleText } from '../support/text';
import type { Page } from '@playwright/test';
import {
  appendMockChatBurst,
  createPerformanceReport,
  formatMb,
  formatMs,
  formatNullableMb,
  getHeapGrowthMb,
  getHeapSnapshot,
  getPositiveIntegerEnv,
  reloadMockChatPageForStoredSettings,
  startBrowserPerfProbe,
  stopBrowserPerfProbe,
  withMockedPerformanceTranslationEndpoint,
  writePerformanceReport,
  type BrowserPerfProbeSnapshot
} from '../support/mock-perf';

const FOCUS_INBOX_MESSAGE_COUNT = getPositiveIntegerEnv('YTCQ_PERF_PANEL_MESSAGE_COUNT', 60);
const PROFILE_MESSAGE_COUNT = getPositiveIntegerEnv('YTCQ_PERF_PROFILE_PANEL_MESSAGE_COUNT', 30);
const TOTAL_MESSAGE_COUNT = FOCUS_INBOX_MESSAGE_COUNT + PROFILE_MESSAGE_COUNT;
const TARGET_LANGUAGE = 'cy';
const PANEL_KEYWORD = 'panelwatch';

const BUDGETS = {
  appendBurstMs: 2_000,
  heapGrowthMb: 80,
  maxLongTaskMs: 1_200,
  panelUpdateMs: 5_000,
  p95FrameGapMs: 350
};

interface SourceAuthor {
  author: string;
}

test('youtube-mock performance: open panels keep up with incoming messages', async ({
  mockLoggedInSession
}, testInfo) => {
  const { context, page } = mockLoggedInSession;

  await withMockedPerformanceTranslationEndpoint(context, {
    delayMs: 8,
    translatedText: 'YTCQ panel translation'
  }, async (translationStats) => {
    await withExtensionStorageValues(context, 'sync', {
      lastTranslationTarget: TARGET_LANGUAGE,
      sound: false,
      targetLanguage: TARGET_LANGUAGE,
      translationDisplay: 'below'
    }, async () => {
      await withExtensionStorageValues(context, 'local', {
        ytcqInboxKeywords: [PANEL_KEYWORD]
      }, async () => {
        await reloadMockChatPageForStoredSettings(page);
        const source = await getSourceAuthor(page);
        await openProfileCard(page);

        await startBrowserPerfProbe(page);
        const heapBefore = await getHeapSnapshot(page);
        const profileMessages = createPanelMessages(source, PROFILE_MESSAGE_COUNT, 'profile');
        const profileLastText = profileMessages.at(-1)?.text || '';
        const profileAppend = await appendMockChatBurst(page, profileMessages);
        const profileUpdateMs = await waitForProfilePanelToReceiveMessage(page, profileLastText);
        await closeProfileCard(page);

        await openFocusPanel(page);
        await openInboxPanel(page);
        const focusInboxMessages = createPanelMessages(source, FOCUS_INBOX_MESSAGE_COUNT, 'focus-inbox');
        const focusInboxLastText = focusInboxMessages.at(-1)?.text || '';
        const focusInboxAppend = await appendMockChatBurst(page, focusInboxMessages);
        const focusInboxUpdateMs = await waitForFocusAndInboxToReceiveMessage(page, focusInboxLastText);
        const appendBurstMs = profileAppend.durationMs + focusInboxAppend.durationMs;
        const panelUpdateMs = profileUpdateMs + focusInboxUpdateMs;
        const panelTranslationCount = await page.locator([
          '.ytcq-focus-card-expanded .ytcq-translation',
          '.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-translation',
          '.ytcq-inbox-card .ytcq-translation'
        ].join(',')).count();
        const heapAfter = await getHeapSnapshot(page);
        const probe = await stopBrowserPerfProbe(page);
        const heapGrowthMb = getHeapGrowthMb(heapBefore, heapAfter);

        const report = createPerformanceReport(
          'youtube-mock open Focus/Profile/Inbox panels during fast chat',
          [
            { label: 'Messages appended', value: TOTAL_MESSAGE_COUNT },
            { label: 'Append burst', value: formatMs(appendBurstMs), budget: formatMs(BUDGETS.appendBurstMs) },
            { label: 'Profile update', value: formatMs(profileUpdateMs), budget: formatMs(BUDGETS.panelUpdateMs) },
            { label: 'Focus/Inbox update', value: formatMs(focusInboxUpdateMs), budget: formatMs(BUDGETS.panelUpdateMs) },
            { label: 'Combined panel update', value: formatMs(panelUpdateMs) },
            { label: 'Translation requests', value: translationStats.requestCount },
            { label: 'Panel translations', value: panelTranslationCount },
            { label: 'Long tasks', value: probe.longTaskCount },
            { label: 'Max long task', value: formatMs(probe.maxLongTaskMs), budget: formatMs(BUDGETS.maxLongTaskMs) },
            { label: 'p95 frame gap', value: formatMs(probe.p95FrameGapMs), budget: formatMs(BUDGETS.p95FrameGapMs) },
            { label: 'Max frame gap', value: formatMs(probe.maxFrameGapMs) },
            { label: 'Heap growth', value: formatNullableMb(heapGrowthMb), budget: formatMb(BUDGETS.heapGrowthMb) }
          ]
        );

        await writePerformanceReport(testInfo, 'youtube-mock-open-panels', report);
        assertPerformanceBudgets({
          appendBurstMs,
          heapGrowthMb,
          panelUpdateMs,
          panelTranslationCount,
          probe
        });
      });
    });
  });
});

async function getSourceAuthor(page: Page): Promise<SourceAuthor> {
  const sourceMessage = page.locator('yt-live-chat-text-message-renderer').first();
  await expect(sourceMessage).toBeVisible({ timeout: 15_000 });
  const author = cleanVisibleText(await sourceMessage.locator('#author-name').innerText());
  if (!author) throw new Error('Mock source message did not expose an author.');
  return { author };
}

async function openProfileCard(page: Page): Promise<void> {
  const sourceMessage = page.locator('yt-live-chat-text-message-renderer').first();
  await sourceMessage.locator('#author-photo').click();
  await expect(page.locator('.ytcq-profile-card:not(.ytcq-inbox-card)')).toBeVisible({ timeout: 10_000 });
}

async function openFocusPanel(page: Page): Promise<void> {
  const sourceMessage = page.locator('yt-live-chat-text-message-renderer').first();
  await sourceMessage.locator('#author-name').click();
  await page.locator('.ytcq-focus-card-collapsed').click();
  await expect(page.locator('.ytcq-focus-card-expanded')).toBeVisible({ timeout: 10_000 });
}

async function openInboxPanel(page: Page): Promise<void> {
  await page.locator('.ytcq-inbox-button').click();
  await expect(page.locator('.ytcq-inbox-card')).toBeVisible({ timeout: 10_000 });
}

async function closeProfileCard(page: Page): Promise<void> {
  await page.locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-close').click();
  await expect(page.locator('.ytcq-profile-card:not(.ytcq-inbox-card)')).toHaveCount(0);
}

function createPanelMessages(source: SourceAuthor, count: number, label: string) {
  return Array.from({ length: count }, (_, index) => ({
    author: source.author,
    text: `Panel performance ${PANEL_KEYWORD} ${label} message ${index} gracias por mirar`
  }));
}

async function waitForProfilePanelToReceiveMessage(page: Page, lastText: string): Promise<number> {
  const startedAt = performance.now();
  await expect(page.locator('.ytcq-profile-card:not(.ytcq-inbox-card) .ytcq-profile-card-message').filter({ hasText: lastText }).first())
    .toBeVisible({ timeout: BUDGETS.panelUpdateMs });
  return performance.now() - startedAt;
}

async function waitForFocusAndInboxToReceiveMessage(page: Page, lastText: string): Promise<number> {
  const startedAt = performance.now();
  await expect(page.locator('.ytcq-focus-card-expanded .ytcq-focus-bubble').filter({ hasText: lastText }).first())
    .toBeVisible({ timeout: BUDGETS.panelUpdateMs });
  await expect(page.locator('.ytcq-inbox-card .ytcq-inbox-message').filter({ hasText: lastText }).first())
    .toBeVisible({ timeout: BUDGETS.panelUpdateMs });
  return performance.now() - startedAt;
}

function assertPerformanceBudgets({
  appendBurstMs,
  heapGrowthMb,
  panelTranslationCount,
  panelUpdateMs,
  probe
}: {
  appendBurstMs: number;
  heapGrowthMb: number | null;
  panelTranslationCount: number;
  panelUpdateMs: number;
  probe: BrowserPerfProbeSnapshot;
}): void {
  expect.soft(appendBurstMs, 'Appending while panels are open should not block too long.')
    .toBeLessThanOrEqual(BUDGETS.appendBurstMs);
  expect.soft(panelUpdateMs, 'Open panels should receive the latest message within budget.')
    .toBeLessThanOrEqual(BUDGETS.panelUpdateMs);
  expect.soft(panelTranslationCount, 'Open panels should receive prioritized translations.')
    .toBeGreaterThan(0);
  expect.soft(probe.maxLongTaskMs, 'Panel updates should not create a catastrophic long task.')
    .toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
  expect.soft(probe.p95FrameGapMs, 'The page should keep painting with panels open.')
    .toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);

  if (heapGrowthMb !== null) {
    expect.soft(heapGrowthMb, 'Open panel heap growth should stay bounded.')
      .toBeLessThanOrEqual(BUDGETS.heapGrowthMb);
  }
}
