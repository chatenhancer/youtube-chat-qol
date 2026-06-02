/**
 * Mock performance coverage for watched keyword matching.
 *
 * The Inbox supports up to 30 watched keywords/phrases. This test loads that
 * maximum list and appends a fast chat burst where every message matches both
 * a single keyword and a phrase.
 */
import { expect, mockTest as test } from '../support/browser-fixtures';
import { withExtensionStorageValues } from '../support/extension-storage';
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
  writePerformanceReport,
  type BrowserPerfProbeSnapshot
} from '../support/mock-perf';

const MESSAGE_COUNT = getPositiveIntegerEnv('YTCQ_PERF_KEYWORD_MESSAGE_COUNT', 220);
const WATCHED_KEYWORDS = [
  ...Array.from({ length: 20 }, (_, index) => `perfword${index}`),
  ...Array.from({ length: 10 }, (_, index) => `perf phrase ${index}`)
];
const EXPECTED_HIGHLIGHT_FLOOR = MESSAGE_COUNT * 2;

const BUDGETS = {
  appendBurstMs: 1_500,
  heapGrowthMb: 80,
  highlightMs: 3_000,
  maxLongTaskMs: 750,
  p95FrameGapMs: 350
};

test('youtube-mock performance: maximum watched keyword list keeps matching responsive', async ({
  mockLoggedInSession
}, testInfo) => {
  const { context, page } = mockLoggedInSession;

  await withExtensionStorageValues(context, 'sync', {
    sound: false,
    targetLanguage: ''
  }, async () => {
    await withExtensionStorageValues(context, 'local', {
      ytcqInboxKeywords: WATCHED_KEYWORDS
    }, async () => {
      await reloadMockChatPageForStoredSettings(page);
      await startBrowserPerfProbe(page);
      const heapBefore = await getHeapSnapshot(page);
      const { durationMs: appendBurstMs } = await appendMockChatBurst(page, createKeywordMessages());
      const highlightMs = await waitForKeywordHighlights(page);
      const visibleKeywordHighlightCount = await page.locator('.ytcq-chat-keyword-highlight').count();
      const heapAfter = await getHeapSnapshot(page);
      const probe = await stopBrowserPerfProbe(page);
      const heapGrowthMb = getHeapGrowthMb(heapBefore, heapAfter);

      const report = createPerformanceReport(
        'youtube-mock maximum watched keyword matching',
        [
          { label: 'Watched keywords', value: WATCHED_KEYWORDS.length },
          { label: 'Messages appended', value: MESSAGE_COUNT },
          { label: 'Append burst', value: formatMs(appendBurstMs), budget: formatMs(BUDGETS.appendBurstMs) },
          { label: 'Highlight wait', value: formatMs(highlightMs), budget: formatMs(BUDGETS.highlightMs) },
          { label: 'Keyword highlights', value: visibleKeywordHighlightCount, budget: `>= ${EXPECTED_HIGHLIGHT_FLOOR}` },
          { label: 'Long tasks', value: probe.longTaskCount },
          { label: 'Max long task', value: formatMs(probe.maxLongTaskMs), budget: formatMs(BUDGETS.maxLongTaskMs) },
          { label: 'p95 frame gap', value: formatMs(probe.p95FrameGapMs), budget: formatMs(BUDGETS.p95FrameGapMs) },
          { label: 'Max frame gap', value: formatMs(probe.maxFrameGapMs) },
          { label: 'Heap growth', value: formatNullableMb(heapGrowthMb), budget: formatMb(BUDGETS.heapGrowthMb) }
        ]
      );

      await writePerformanceReport(testInfo, 'youtube-mock-keyword-matching', report);
      assertPerformanceBudgets({
        appendBurstMs,
        heapGrowthMb,
        highlightMs,
        probe,
        visibleKeywordHighlightCount
      });
    });
  });
});

function createKeywordMessages() {
  return Array.from({ length: MESSAGE_COUNT }, (_, index) => {
    const single = `perfword${index % 20}`;
    const phrase = `perf phrase ${index % 10}`;
    return {
      author: `@KeywordPerf${String(index % 30).padStart(2, '0')}`,
      channel: `keyword-perf-channel-${index % 30}`,
      text: `Checking ${single} while the phrase ${phrase} appears in chat ${index}`
    };
  });
}

async function waitForKeywordHighlights(page: Page): Promise<number> {
  const startedAt = performance.now();
  await expect.poll(async () => page.locator('.ytcq-chat-keyword-highlight').count(), {
    message: 'Maximum keyword list should highlight matching chat messages.',
    timeout: BUDGETS.highlightMs
  }).toBeGreaterThanOrEqual(EXPECTED_HIGHLIGHT_FLOOR);
  return performance.now() - startedAt;
}

function assertPerformanceBudgets({
  appendBurstMs,
  heapGrowthMb,
  highlightMs,
  probe,
  visibleKeywordHighlightCount
}: {
  appendBurstMs: number;
  heapGrowthMb: number | null;
  highlightMs: number;
  probe: BrowserPerfProbeSnapshot;
  visibleKeywordHighlightCount: number;
}): void {
  expect.soft(appendBurstMs, 'Appending messages with maximum keywords should not block too long.')
    .toBeLessThanOrEqual(BUDGETS.appendBurstMs);
  expect.soft(highlightMs, 'Keyword highlights should appear within budget.')
    .toBeLessThanOrEqual(BUDGETS.highlightMs);
  expect.soft(visibleKeywordHighlightCount, 'Every appended message should receive keyword highlights.')
    .toBeGreaterThanOrEqual(EXPECTED_HIGHLIGHT_FLOOR);
  expect.soft(probe.maxLongTaskMs, 'Keyword matching should not create a catastrophic long task.')
    .toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
  expect.soft(probe.p95FrameGapMs, 'Keyword matching should keep the page painting.')
    .toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);

  if (heapGrowthMb !== null) {
    expect.soft(heapGrowthMb, 'Keyword matching heap growth should stay bounded.')
      .toBeLessThanOrEqual(BUDGETS.heapGrowthMb);
  }
}
