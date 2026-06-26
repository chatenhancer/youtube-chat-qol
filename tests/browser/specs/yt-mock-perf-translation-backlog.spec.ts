/**
 * Mock performance coverage for slow and failing translation responses.
 *
 * This stresses the translation queue under pressure from a chat burst larger
 * than the pending-entry cap. The important behavior is that the page stays
 * responsive, the queue keeps progressing, and stale backlog does not explode.
 */
import { expect, mockTest as test } from '../support/browser-fixtures';
import { withExtensionStorageValues } from '../support/extension-storage';
import {
  appendMockChatBurst,
  createPerformanceReport,
  delay,
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

const MESSAGE_COUNT = getPositiveIntegerEnv('YTCQ_PERF_BACKLOG_MESSAGE_COUNT', 360);
const TARGET_LANGUAGE = 'cy';
const TRANSLATION_RESPONSE_DELAY_MS = 35;
const TRANSLATION_FAILURE_EVERY = 5;
const REQUEST_FLOOR = Math.min(260, MESSAGE_COUNT);

const BUDGETS = {
  appendBurstMs: 1_500,
  heapGrowthMb: 100,
  maxLongTaskMs: 1_000,
  p95FrameGapMs: 400,
  queueQuietMs: 15_000
};

test('youtube-mock performance: slow failing translation backlog remains bounded', async ({
  mockLoggedInSession
}, testInfo) => {
  const { context, page } = mockLoggedInSession;

  await withMockedPerformanceTranslationEndpoint(context, {
    delayMs: TRANSLATION_RESPONSE_DELAY_MS,
    failEvery: TRANSLATION_FAILURE_EVERY,
    translatedText: (requestNumber) => `YTCQ backlog translation ${requestNumber}`
  }, async (translationStats) => {
    await withExtensionStorageValues(context, 'sync', {
      lastTranslationTarget: TARGET_LANGUAGE,
      sound: false,
      targetLanguage: TARGET_LANGUAGE,
      translationDisplay: 'below'
    }, async () => {
      await reloadMockChatPageForStoredSettings(page);
      await startBrowserPerfProbe(page);
      const heapBefore = await getHeapSnapshot(page);
      const { durationMs: appendBurstMs } = await appendMockChatBurst(page, createBacklogMessages());
      const queueQuietMs = await waitForTranslationQueueToQuiet(translationStats);
      const visibleTranslationCount = await page.locator(`.ytcq-translation[lang="${TARGET_LANGUAGE}"]`).count();
      const queuedMessageCount = await page.locator('[data-ytcq-translation-key]').count();
      const heapAfter = await getHeapSnapshot(page);
      const probe = await stopBrowserPerfProbe(page);
      const heapGrowthMb = getHeapGrowthMb(heapBefore, heapAfter);

      const report = createPerformanceReport(
        'youtube-mock slow/failing translation backlog',
        [
          { label: 'Messages appended', value: MESSAGE_COUNT },
          { label: 'Append burst', value: formatMs(appendBurstMs), budget: formatMs(BUDGETS.appendBurstMs) },
          { label: 'Queue quiet', value: formatMs(queueQuietMs), budget: formatMs(BUDGETS.queueQuietMs) },
          { label: 'Translation requests', value: translationStats.requestCount },
          { label: 'Translation items', value: translationStats.translatedItemCount, budget: `>= ${REQUEST_FLOOR}` },
          { label: 'Translation request successes', value: translationStats.successCount },
          { label: 'Translation request failures', value: translationStats.failureCount },
          { label: 'Rendered translations', value: visibleTranslationCount },
          { label: 'Messages with translation keys', value: queuedMessageCount },
          { label: 'Long tasks', value: probe.longTaskCount },
          { label: 'Max long task', value: formatMs(probe.maxLongTaskMs), budget: formatMs(BUDGETS.maxLongTaskMs) },
          { label: 'p95 frame gap', value: formatMs(probe.p95FrameGapMs), budget: formatMs(BUDGETS.p95FrameGapMs) },
          { label: 'Max frame gap', value: formatMs(probe.maxFrameGapMs) },
          { label: 'Heap growth', value: formatNullableMb(heapGrowthMb), budget: formatMb(BUDGETS.heapGrowthMb) }
        ]
      );

      await writePerformanceReport(testInfo, 'youtube-mock-slow-translation-backlog', report);
      assertPerformanceBudgets({
        appendBurstMs,
        heapGrowthMb,
        probe,
        queueQuietMs,
        translatedItemCount: translationStats.translatedItemCount
      });
    });
  });
});

function createBacklogMessages() {
  return Array.from({ length: MESSAGE_COUNT }, (_, index) => ({
    author: `@BacklogViewer${String(index % 24).padStart(2, '0')}`,
    channel: `backlog-channel-${index % 24}`,
    text: `Mensaje lento de rendimiento ${index} con suficiente texto para traducir`
  }));
}

async function waitForTranslationQueueToQuiet(stats: { requestCount: number; translatedItemCount: number }): Promise<number> {
  const startedAt = performance.now();
  await expect.poll(() => stats.translatedItemCount, {
    message: 'Slow translation backlog should keep making request progress.',
    timeout: BUDGETS.queueQuietMs
  }).toBeGreaterThanOrEqual(REQUEST_FLOOR);

  let lastCount = stats.requestCount;
  let lastChangedAt = performance.now();
  while (performance.now() - startedAt < BUDGETS.queueQuietMs) {
    await delay(150);
    if (stats.requestCount !== lastCount) {
      lastCount = stats.requestCount;
      lastChangedAt = performance.now();
    }
    if (performance.now() - lastChangedAt >= 700) break;
  }

  return performance.now() - startedAt;
}

function assertPerformanceBudgets({
  appendBurstMs,
  heapGrowthMb,
  probe,
  queueQuietMs,
  translatedItemCount
}: {
  appendBurstMs: number;
  heapGrowthMb: number | null;
  probe: BrowserPerfProbeSnapshot;
  queueQuietMs: number;
  translatedItemCount: number;
}): void {
  expect.soft(appendBurstMs, 'Appending messages during a slow endpoint should not block too long.')
    .toBeLessThanOrEqual(BUDGETS.appendBurstMs);
  expect.soft(queueQuietMs, 'The slow/failing translation queue should settle within the broad budget.')
    .toBeLessThanOrEqual(BUDGETS.queueQuietMs);
  expect.soft(translatedItemCount, 'The queue should keep processing even when some translations fail.')
    .toBeGreaterThanOrEqual(REQUEST_FLOOR);
  expect.soft(probe.maxLongTaskMs, 'Slow translation responses should not create a catastrophic long task.')
    .toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
  expect.soft(probe.p95FrameGapMs, 'The page should keep painting under slow translation pressure.')
    .toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);

  if (heapGrowthMb !== null) {
    expect.soft(heapGrowthMb, 'Slow translation backlog heap growth should stay bounded.')
      .toBeLessThanOrEqual(BUDGETS.heapGrowthMb);
  }
}
