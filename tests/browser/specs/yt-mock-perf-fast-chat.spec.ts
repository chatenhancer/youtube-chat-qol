/**
 * Mock YouTube performance coverage for high-volume chat.
 *
 * This test keeps the provider mocked and drives the fixture through the same
 * DOM mutation path as normal chat messages. It catches catastrophic queue,
 * observer, and rendering regressions without depending on real YouTube or the
 * real Google Translate endpoint.
 */
import { expect, mockTest as test } from '../support/browser-fixtures';
import { withExtensionStorageValues } from '../support/extension-storage';
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
  type BrowserPerfProbeSnapshot,
  type HeapSnapshot
} from '../support/mock-perf';

const MESSAGE_COUNT = getPositiveIntegerEnv('YTCQ_PERF_MESSAGE_COUNT', 180);
const TARGET_LANGUAGE = 'cy';
const PERF_KEYWORDS = ['launch', 'priority', 'stream'];
const TRANSLATION_RESPONSE_DELAY_MS = 8;

const BUDGETS = {
  appendBurstMs: 1_000,
  heapGrowthMb: 80,
  maxLongTaskMs: 750,
  p95FrameGapMs: 300,
  translationDrainMs: 10_000
};

test('youtube-mock performance: fast chat stays responsive with translation and inbox matching', async ({
  mockLoggedInSession
}, testInfo) => {
  const { context, page } = mockLoggedInSession;

  await withMockedPerformanceTranslationEndpoint(context, {
    delayMs: TRANSLATION_RESPONSE_DELAY_MS,
    translatedText: 'YTCQ performance translation'
  }, async (translationStats) => {
    await withExtensionStorageValues(context, 'sync', {
      lastTranslationTarget: TARGET_LANGUAGE,
      sound: false,
      targetLanguage: TARGET_LANGUAGE,
      translationDisplay: 'below'
    }, async () => {
      await withExtensionStorageValues(context, 'local', {
        ytcqInboxKeywords: PERF_KEYWORDS
      }, async () => {
        await reloadMockChatPageForStoredSettings(page);
        await startBrowserPerfProbe(page);
        const heapBefore = await getHeapSnapshot(page);
        const { durationMs: appendBurstMs } = await appendMockChatBurst(page, createFastChatMessages());
        const translationDrainMs = await waitForTranslationsToDrain(page);
        const visibleTranslationCount = await page.locator(`.ytcq-translation[lang="${TARGET_LANGUAGE}"]`).count();
        const visibleKeywordHighlightCount = await page.locator('.ytcq-chat-keyword-highlight').count();
        const heapAfter = await getHeapSnapshot(page);
        const probe = await stopBrowserPerfProbe(page);
        const heapGrowthMb = getHeapGrowthMb(heapBefore, heapAfter);

        const report = createPerformanceReport(
          'youtube-mock fast chat with translation and inbox keyword matching',
          [
            { label: 'Messages appended', value: MESSAGE_COUNT },
            { label: 'Append burst', value: formatMs(appendBurstMs), budget: formatMs(BUDGETS.appendBurstMs) },
            { label: 'Translation drain', value: formatMs(translationDrainMs), budget: formatMs(BUDGETS.translationDrainMs) },
            { label: 'Translation requests', value: translationStats.requestCount },
            { label: 'Rendered translations', value: visibleTranslationCount, budget: `>= ${MESSAGE_COUNT}` },
            { label: 'Keyword highlights', value: visibleKeywordHighlightCount, budget: `>= ${MESSAGE_COUNT}` },
            { label: 'Long tasks', value: probe.longTaskCount },
            { label: 'Max long task', value: formatMs(probe.maxLongTaskMs), budget: formatMs(BUDGETS.maxLongTaskMs) },
            { label: 'p95 frame gap', value: formatMs(probe.p95FrameGapMs), budget: formatMs(BUDGETS.p95FrameGapMs) },
            { label: 'Max frame gap', value: formatMs(probe.maxFrameGapMs) },
            { label: 'Heap growth', value: formatNullableMb(heapGrowthMb), budget: formatMb(BUDGETS.heapGrowthMb) }
          ]
        );

        await writePerformanceReport(testInfo, 'youtube-mock-fast-chat', report);
        assertPerformanceBudgets({
          appendBurstMs,
          heapAfter,
          heapBefore,
          heapGrowthMb,
          probe,
          translationDrainMs,
          translationRequestCount: translationStats.requestCount,
          visibleKeywordHighlightCount,
          visibleTranslationCount
        });
      });
    });
  });
});

function createFastChatMessages() {
  return Array.from({ length: MESSAGE_COUNT }, (_, index) => ({
    author: `@PerfViewer${String(index % 18).padStart(2, '0')}`,
    channel: `perf-channel-${index % 18}`,
    text: `Mensaje de prueba launch priority stream ${index} gracias por el directo`
  }));
}

async function waitForTranslationsToDrain(page: Parameters<typeof appendMockChatBurst>[0]): Promise<number> {
  const startedAt = performance.now();
  await expect.poll(async () => page.locator(`.ytcq-translation[lang="${TARGET_LANGUAGE}"]`).count(), {
    message: `Expected at least ${MESSAGE_COUNT} translated messages after the fast chat burst.`,
    timeout: BUDGETS.translationDrainMs
  }).toBeGreaterThanOrEqual(MESSAGE_COUNT);
  return performance.now() - startedAt;
}

function assertPerformanceBudgets({
  appendBurstMs,
  heapGrowthMb,
  probe,
  translationDrainMs,
  translationRequestCount,
  visibleKeywordHighlightCount,
  visibleTranslationCount
}: {
  appendBurstMs: number;
  heapAfter: HeapSnapshot | null;
  heapBefore: HeapSnapshot | null;
  heapGrowthMb: number | null;
  probe: BrowserPerfProbeSnapshot;
  translationDrainMs: number;
  translationRequestCount: number;
  visibleKeywordHighlightCount: number;
  visibleTranslationCount: number;
}): void {
  expect.soft(appendBurstMs, 'Appending the fast chat burst should not block for too long.')
    .toBeLessThanOrEqual(BUDGETS.appendBurstMs);
  expect.soft(translationDrainMs, 'Translations should drain before the broad performance budget.')
    .toBeLessThanOrEqual(BUDGETS.translationDrainMs);
  expect.soft(visibleTranslationCount, 'Every appended translatable message should render a translation.')
    .toBeGreaterThanOrEqual(MESSAGE_COUNT);
  expect.soft(visibleKeywordHighlightCount, 'Keyword matching should keep up with the appended chat burst.')
    .toBeGreaterThanOrEqual(MESSAGE_COUNT);
  expect.soft(translationRequestCount, 'The mocked translation endpoint should receive the burst.')
    .toBeGreaterThanOrEqual(MESSAGE_COUNT);
  expect.soft(probe.maxLongTaskMs, 'No single observed long task should be catastrophic.')
    .toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
  expect.soft(probe.p95FrameGapMs, 'The page should keep painting under a broad p95 frame-gap budget.')
    .toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);

  if (heapGrowthMb !== null) {
    expect.soft(heapGrowthMb, 'Heap growth should stay within the broad mock-chat budget.')
      .toBeLessThanOrEqual(BUDGETS.heapGrowthMb);
  }
}
