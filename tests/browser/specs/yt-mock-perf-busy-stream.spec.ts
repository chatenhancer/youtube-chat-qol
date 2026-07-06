/**
 * Mock performance coverage for sustained high-volume chat.
 *
 * Unlike the single-burst fast-chat spec, this test keeps appending message
 * waves while translation, Inbox matching, and observer work are still active.
 * It models a very busy live stream without depending on real YouTube traffic.
 */
import type { Page } from '@playwright/test';
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
  type BrowserPerfProbeSnapshot,
  type MockChatMessage
} from '../support/mock-perf';

const MESSAGE_WAVES = getPositiveIntegerEnv('YTCQ_PERF_BUSY_STREAM_WAVES', 12);
const MESSAGES_PER_WAVE = getPositiveIntegerEnv('YTCQ_PERF_BUSY_STREAM_WAVE_SIZE', 60);
const WAVE_INTERVAL_MS = getPositiveIntegerEnv('YTCQ_PERF_BUSY_STREAM_WAVE_INTERVAL_MS', 120);
const TOTAL_MESSAGE_COUNT = MESSAGE_WAVES * MESSAGES_PER_WAVE;
const TARGET_LANGUAGE = 'cy';
const TRANSLATION_RESPONSE_DELAY_MS = 12;
const WATCHED_KEYWORDS = [
  ...Array.from({ length: 20 }, (_, index) => `stormword${index}`),
  ...Array.from({ length: 10 }, (_, index) => `busy phrase ${index}`)
];
const EXPECTED_TRANSLATION_FLOOR = TOTAL_MESSAGE_COUNT;
const EXPECTED_HIGHLIGHT_FLOOR = TOTAL_MESSAGE_COUNT * 2;
const EXPECTED_INBOX_BADGE = TOTAL_MESSAGE_COUNT >= 100 ? '99+' : String(TOTAL_MESSAGE_COUNT);

const BUDGETS = {
  heapGrowthMb: 140,
  inboxBadgeMs: 8_000,
  keywordDrainMs: 5_000,
  maxLongTaskMs: 1_200,
  maxWaveAppendMs: 1_200,
  p95FrameGapMs: 450,
  totalIngressMs: Math.max(10_000, MESSAGE_WAVES * (WAVE_INTERVAL_MS + 650)),
  translationDrainMs: 20_000
};

interface BusyStreamIngressStats {
  appendedIds: string[];
  durationMs: number;
  maxWaveAppendMs: number;
  messagesPerSecond: number;
  p95WaveAppendMs: number;
  waveDurationsMs: number[];
}

test('youtube-mock performance: sustained busy stream stays responsive', async ({
  mockLoggedInSession
}, testInfo) => {
  const { context, page } = mockLoggedInSession;

  await withMockedPerformanceTranslationEndpoint(context, {
    delayMs: TRANSLATION_RESPONSE_DELAY_MS,
    translatedText: 'YTCQ busy stream translation'
  }, async (translationStats) => {
    await withExtensionStorageValues(context, 'sync', {
      lastTranslationTarget: TARGET_LANGUAGE,
      sound: false,
      targetLanguage: TARGET_LANGUAGE,
      translationDisplay: 'below'
    }, async () => {
      await withExtensionStorageValues(context, 'local', {
        ytcqInboxKeywords: WATCHED_KEYWORDS
      }, async () => {
        await reloadMockChatPageForStoredSettings(page);
        await startBrowserPerfProbe(page);
        const heapBefore = await getHeapSnapshot(page);
        const ingress = await appendBusyStream(page);
        const translationDrainMs = await waitForTranslationsToDrain(page);
        const keywordDrainMs = await waitForKeywordHighlights(page);
        const inboxBadgeMs = await waitForInboxBadge(page);
        const visibleTranslationCount = await page.locator(`.ytcq-translation[lang="${TARGET_LANGUAGE}"]`).count();
        const visibleKeywordHighlightCount = await page.locator('.ytcq-chat-keyword-highlight').count();
        const inboxBadgeText = await page.locator('.ytcq-inbox-badge').innerText();
        const heapAfter = await getHeapSnapshot(page);
        const probe = await stopBrowserPerfProbe(page);
        const heapGrowthMb = getHeapGrowthMb(heapBefore, heapAfter);

        const report = createPerformanceReport(
          'youtube-mock sustained busy stream with translation, mentions, and watched keywords',
          [
            { label: 'Message waves', value: MESSAGE_WAVES },
            { label: 'Messages per wave', value: MESSAGES_PER_WAVE },
            { label: 'Messages appended', value: ingress.appendedIds.length, budget: String(TOTAL_MESSAGE_COUNT) },
            { label: 'Wave interval', value: formatMs(WAVE_INTERVAL_MS) },
            { label: 'Ingress duration', value: formatMs(ingress.durationMs), budget: formatMs(BUDGETS.totalIngressMs) },
            { label: 'Ingress rate', value: formatRate(ingress.messagesPerSecond) },
            { label: 'p95 wave append', value: formatMs(ingress.p95WaveAppendMs) },
            { label: 'Max wave append', value: formatMs(ingress.maxWaveAppendMs), budget: formatMs(BUDGETS.maxWaveAppendMs) },
            { label: 'Translation drain', value: formatMs(translationDrainMs), budget: formatMs(BUDGETS.translationDrainMs) },
            { label: 'Keyword drain', value: formatMs(keywordDrainMs), budget: formatMs(BUDGETS.keywordDrainMs) },
            { label: 'Inbox badge wait', value: formatMs(inboxBadgeMs), budget: formatMs(BUDGETS.inboxBadgeMs) },
            { label: 'Translation requests', value: translationStats.requestCount },
            { label: 'Translation items', value: translationStats.translatedItemCount, budget: `>= ${EXPECTED_TRANSLATION_FLOOR}` },
            { label: 'Rendered translations', value: visibleTranslationCount, budget: `>= ${EXPECTED_TRANSLATION_FLOOR}` },
            { label: 'Keyword highlights', value: visibleKeywordHighlightCount, budget: `>= ${EXPECTED_HIGHLIGHT_FLOOR}` },
            { label: 'Inbox badge', value: inboxBadgeText, budget: EXPECTED_INBOX_BADGE },
            { label: 'Long tasks', value: probe.longTaskCount },
            { label: 'Max long task', value: formatMs(probe.maxLongTaskMs), budget: formatMs(BUDGETS.maxLongTaskMs) },
            { label: 'p95 frame gap', value: formatMs(probe.p95FrameGapMs), budget: formatMs(BUDGETS.p95FrameGapMs) },
            { label: 'Max frame gap', value: formatMs(probe.maxFrameGapMs) },
            { label: 'Heap growth', value: formatNullableMb(heapGrowthMb), budget: formatMb(BUDGETS.heapGrowthMb) }
          ]
        );

        await writePerformanceReport(testInfo, 'youtube-mock-busy-stream', report);
        assertPerformanceBudgets({
          heapGrowthMb,
          inboxBadgeMs,
          inboxBadgeText,
          ingress,
          keywordDrainMs,
          probe,
          translatedItemCount: translationStats.translatedItemCount,
          translationDrainMs,
          visibleKeywordHighlightCount,
          visibleTranslationCount
        });
      });
    });
  });
});

async function appendBusyStream(page: Page): Promise<BusyStreamIngressStats> {
  const startedAt = performance.now();
  const appendedIds: string[] = [];
  const waveDurationsMs: number[] = [];

  for (let waveIndex = 0; waveIndex < MESSAGE_WAVES; waveIndex += 1) {
    const wave = createBusyStreamWaveMessages(waveIndex);
    const result = await appendMockChatBurst(page, wave);
    appendedIds.push(...result.appendedIds);
    waveDurationsMs.push(result.durationMs);
    if (waveIndex < MESSAGE_WAVES - 1) await delay(WAVE_INTERVAL_MS);
  }

  const durationMs = performance.now() - startedAt;
  return {
    appendedIds,
    durationMs,
    maxWaveAppendMs: Math.max(...waveDurationsMs),
    messagesPerSecond: appendedIds.length / Math.max(durationMs / 1_000, 0.001),
    p95WaveAppendMs: getPercentile(waveDurationsMs, 95),
    waveDurationsMs
  };
}

function createBusyStreamWaveMessages(waveIndex: number): MockChatMessage[] {
  return Array.from({ length: MESSAGES_PER_WAVE }, (_, waveOffset) => {
    const index = waveIndex * MESSAGES_PER_WAVE + waveOffset;
    const singleKeyword = `stormword${index % 20}`;
    const phraseKeyword = `busy phrase ${index % 10}`;
    const mention = index % 4 === 0 ? ' @CurrentViewer' : '';
    return {
      author: `@BusyViewer${String(index % 80).padStart(2, '0')}`,
      channel: `busy-stream-channel-${index % 80}`,
      text: [
        `Mensaje rapido ${index} gracias por seguir el directo`,
        singleKeyword,
        `mientras aparece ${phraseKeyword}`,
        `${mention} con suficiente texto para traducir`
      ].join(' ')
    };
  });
}

async function waitForTranslationsToDrain(page: Page): Promise<number> {
  const startedAt = performance.now();
  await expect.poll(async () => page.locator(`.ytcq-translation[lang="${TARGET_LANGUAGE}"]`).count(), {
    message: 'Sustained busy stream should render translations for appended messages.',
    timeout: BUDGETS.translationDrainMs
  }).toBeGreaterThanOrEqual(EXPECTED_TRANSLATION_FLOOR);
  return performance.now() - startedAt;
}

async function waitForKeywordHighlights(page: Page): Promise<number> {
  const startedAt = performance.now();
  await expect.poll(async () => page.locator('.ytcq-chat-keyword-highlight').count(), {
    message: 'Sustained busy stream should keep watched keyword highlights current.',
    timeout: BUDGETS.keywordDrainMs
  }).toBeGreaterThanOrEqual(EXPECTED_HIGHLIGHT_FLOOR);
  return performance.now() - startedAt;
}

async function waitForInboxBadge(page: Page): Promise<number> {
  const startedAt = performance.now();
  await expect(page.locator('.ytcq-inbox-badge')).toHaveText(EXPECTED_INBOX_BADGE, {
    timeout: BUDGETS.inboxBadgeMs
  });
  return performance.now() - startedAt;
}

function assertPerformanceBudgets({
  heapGrowthMb,
  inboxBadgeMs,
  inboxBadgeText,
  ingress,
  keywordDrainMs,
  probe,
  translatedItemCount,
  translationDrainMs,
  visibleKeywordHighlightCount,
  visibleTranslationCount
}: {
  heapGrowthMb: number | null;
  inboxBadgeMs: number;
  inboxBadgeText: string;
  ingress: BusyStreamIngressStats;
  keywordDrainMs: number;
  probe: BrowserPerfProbeSnapshot;
  translatedItemCount: number;
  translationDrainMs: number;
  visibleKeywordHighlightCount: number;
  visibleTranslationCount: number;
}): void {
  expect.soft(ingress.appendedIds, 'All busy-stream fixture messages should be appended.')
    .toHaveLength(TOTAL_MESSAGE_COUNT);
  expect.soft(ingress.durationMs, 'Sustained message ingress should finish within the broad stream budget.')
    .toBeLessThanOrEqual(BUDGETS.totalIngressMs);
  expect.soft(ingress.maxWaveAppendMs, 'No single busy-stream wave append should block too long.')
    .toBeLessThanOrEqual(BUDGETS.maxWaveAppendMs);
  expect.soft(translationDrainMs, 'Translations should drain after sustained busy-stream pressure.')
    .toBeLessThanOrEqual(BUDGETS.translationDrainMs);
  expect.soft(keywordDrainMs, 'Keyword highlights should settle after sustained busy-stream pressure.')
    .toBeLessThanOrEqual(BUDGETS.keywordDrainMs);
  expect.soft(inboxBadgeMs, 'Inbox unread state should settle after sustained busy-stream pressure.')
    .toBeLessThanOrEqual(BUDGETS.inboxBadgeMs);
  expect.soft(translatedItemCount, 'The mocked translation endpoint should receive the busy stream.')
    .toBeGreaterThanOrEqual(EXPECTED_TRANSLATION_FLOOR);
  expect.soft(visibleTranslationCount, 'The busy stream should render expected translations.')
    .toBeGreaterThanOrEqual(EXPECTED_TRANSLATION_FLOOR);
  expect.soft(visibleKeywordHighlightCount, 'Every busy-stream message should receive watched keyword highlights.')
    .toBeGreaterThanOrEqual(EXPECTED_HIGHLIGHT_FLOOR);
  expect.soft(inboxBadgeText, 'Inbox unread count should reflect the very busy stream.')
    .toBe(EXPECTED_INBOX_BADGE);
  expect.soft(probe.maxLongTaskMs, 'Sustained busy-stream work should not create a catastrophic long task.')
    .toBeLessThanOrEqual(BUDGETS.maxLongTaskMs);
  expect.soft(probe.p95FrameGapMs, 'The page should keep painting during sustained busy-stream work.')
    .toBeLessThanOrEqual(BUDGETS.p95FrameGapMs);

  if (heapGrowthMb !== null) {
    expect.soft(heapGrowthMb, 'Busy-stream heap growth should stay bounded.')
      .toBeLessThanOrEqual(BUDGETS.heapGrowthMb);
  }
}

function getPercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const index = Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[index] || 0;
}

function formatRate(value: number): string {
  return `${value.toFixed(1)} msg/s`;
}
