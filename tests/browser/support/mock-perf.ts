/**
 * Shared instrumentation for mock browser performance tests.
 *
 * These helpers keep performance specs focused on the stressed behavior while
 * producing comparable JSON/Markdown reports for every run.
 */
import { expect, type BrowserContext, type Page, type Route, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const REPORT_DIR = path.join(process.cwd(), 'test-results', 'performance');
const TRANSLATE_ENDPOINT_PATTERN = 'https://translate.googleapis.com/translate_a/single*';

export interface BrowserPerfProbeSnapshot {
  durationMs: number;
  longTaskCount: number;
  maxFrameGapMs: number;
  maxLongTaskMs: number;
  p95FrameGapMs: number;
}

export interface HeapSnapshot {
  totalMb: number;
  usedMb: number;
}

export interface PerformanceMetric {
  budget?: string;
  label: string;
  value: number | string;
}

export interface PerformanceReport {
  generatedAt: string;
  metrics: PerformanceMetric[];
  scenario: string;
}

export interface MockChatMessage {
  author: string;
  channel: string;
  text: string;
}

export interface MockTranslationStats {
  failureCount: number;
  requestCount: number;
  successCount: number;
}

export async function reloadMockChatPageForStoredSettings(page: Page): Promise<void> {
  await page.reload({ timeout: 15_000, waitUntil: 'commit' });
  await expect(page.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 15_000 });
}

export async function appendMockChatBurst(page: Page, messages: MockChatMessage[]): Promise<{
  appendedIds: string[];
  durationMs: number;
}> {
  const startedAt = performance.now();
  const appendedIds = await page.evaluate((nextMessages) => {
    const appendMessage = (window as typeof window & {
      ytcqAppendFixtureMessage?: (_message: {
        author: string;
        channel: string;
        text: string;
      }) => string | null;
    }).ytcqAppendFixtureMessage;

    if (!appendMessage) {
      throw new Error('The mock chat fixture did not expose ytcqAppendFixtureMessage.');
    }

    return nextMessages
      .map((message) => appendMessage(message))
      .filter((id): id is string => Boolean(id));
  }, messages);

  expect(appendedIds).toHaveLength(messages.length);
  return {
    appendedIds,
    durationMs: performance.now() - startedAt
  };
}

export async function startBrowserPerfProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = {
      frameGaps: [] as number[],
      longTasks: [] as number[],
      observer: null as PerformanceObserver | null,
      running: true,
      startedAt: performance.now()
    };
    (window as typeof window & {
      __ytcqPerfProbe?: typeof state;
    }).__ytcqPerfProbe = state;

    let lastFrameAt = performance.now();
    const tick = (now: number) => {
      if (!state.running) return;
      state.frameGaps.push(now - lastFrameAt);
      lastFrameAt = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    try {
      state.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          state.longTasks.push(entry.duration);
        }
      });
      state.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      state.observer = null;
    }
  });
}

export async function stopBrowserPerfProbe(page: Page): Promise<BrowserPerfProbeSnapshot> {
  return page.evaluate(() => {
    const state = (window as typeof window & {
      __ytcqPerfProbe?: {
        frameGaps: number[];
        longTasks: number[];
        observer: PerformanceObserver | null;
        running: boolean;
        startedAt: number;
      };
    }).__ytcqPerfProbe;

    if (!state) {
      throw new Error('Browser performance probe was not started.');
    }

    state.running = false;
    state.observer?.disconnect();
    const frameGaps = [...state.frameGaps].sort((first, second) => first - second);
    const longTasks = state.longTasks;

    return {
      durationMs: performance.now() - state.startedAt,
      longTaskCount: longTasks.length,
      maxFrameGapMs: getMax(frameGaps),
      maxLongTaskMs: getMax(longTasks),
      p95FrameGapMs: getPercentile(frameGaps, 95)
    };

    function getMax(values: number[]): number {
      return values.length ? Math.max(...values) : 0;
    }

    function getPercentile(values: number[], percentile: number): number {
      if (!values.length) return 0;
      const index = Math.min(values.length - 1, Math.ceil((percentile / 100) * values.length) - 1);
      return values[index] || 0;
    }
  });
}

export async function getHeapSnapshot(page: Page): Promise<HeapSnapshot | null> {
  return page.evaluate(() => {
    const memory = (performance as Performance & {
      memory?: {
        totalJSHeapSize: number;
        usedJSHeapSize: number;
      };
    }).memory;

    if (!memory) return null;

    return {
      totalMb: bytesToMb(memory.totalJSHeapSize),
      usedMb: bytesToMb(memory.usedJSHeapSize)
    };

    function bytesToMb(value: number): number {
      return value / (1024 * 1024);
    }
  });
}

export async function writePerformanceReport(
  testInfo: TestInfo,
  slug: string,
  report: PerformanceReport
): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, `${slug}.json`);
  const markdownPath = path.join(REPORT_DIR, `${slug}.md`);
  const title = path.basename(testInfo.file);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, formatMarkdownReport(report, title));
  await testInfo.attach('performance-json', {
    contentType: 'application/json',
    path: jsonPath
  });
  await testInfo.attach('performance-summary', {
    contentType: 'text/markdown',
    path: markdownPath
  });
}

export async function withMockedPerformanceTranslationEndpoint<T>(
  context: BrowserContext,
  {
    delayMs = 0,
    failEvery = 0,
    sourceLanguage = 'es',
    translatedText
  }: {
    delayMs?: number;
    failEvery?: number;
    sourceLanguage?: string;
    translatedText: string | ((_requestNumber: number) => string);
  },
  callback: (stats: MockTranslationStats) => Promise<T>
): Promise<T> {
  const stats = {
    failureCount: 0,
    requestCount: 0,
    successCount: 0
  };

  const handler = async (route: Route) => {
    stats.requestCount += 1;
    if (delayMs) await delay(delayMs);

    if (failEvery > 0 && stats.requestCount % failEvery === 0) {
      stats.failureCount += 1;
      await route.fulfill({
        body: JSON.stringify({ error: 'Mock performance translation failure' }),
        contentType: 'application/json',
        status: 503
      });
      return;
    }

    stats.successCount += 1;
    const text = typeof translatedText === 'function'
      ? translatedText(stats.requestCount)
      : translatedText;
    await route.fulfill({
      body: JSON.stringify({
        sentences: [{ trans: text }],
        src: sourceLanguage
      }),
      contentType: 'application/json'
    });
  };

  await context.route(TRANSLATE_ENDPOINT_PATTERN, handler);
  try {
    return await callback(stats);
  } finally {
    await context.unroute(TRANSLATE_ENDPOINT_PATTERN, handler);
  }
}

export function createPerformanceReport(scenario: string, metrics: PerformanceMetric[]): PerformanceReport {
  return {
    generatedAt: new Date().toISOString(),
    metrics,
    scenario
  };
}

export function getPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getHeapGrowthMb(before: HeapSnapshot | null, after: HeapSnapshot | null): number | null {
  return before && after ? after.usedMb - before.usedMb : null;
}

export function formatMs(value: number): string {
  return `${Math.round(value)} ms`;
}

export function formatMb(value: number): string {
  return `${value.toFixed(1)} MB`;
}

export function formatNullableMb(value: number | null): string {
  return value === null ? 'unavailable' : formatMb(value);
}

export function delay(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function formatMarkdownReport(report: PerformanceReport, title: string): string {
  const rows = [
    ['Metric', 'Value', 'Budget'],
    ...report.metrics.map((metric) => [
      metric.label,
      String(metric.value),
      metric.budget || ''
    ])
  ];

  return [
    `# ${title}`,
    '',
    `Scenario: ${report.scenario}`,
    `Generated: ${report.generatedAt}`,
    '',
    rows
      .map((row, index) => index === 1
        ? `| ${['---', '---:', '---:'].join(' | ')} |\n| ${row.join(' | ')} |`
        : `| ${row.join(' | ')} |`)
      .join('\n'),
    ''
  ].join('\n');
}
