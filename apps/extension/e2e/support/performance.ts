/**
 * Shared instrumentation for end-to-end performance tests.
 *
 * These helpers keep performance specs focused on the stressed behavior while
 * producing comparable JSON/Markdown reports for every run.
 */
import { expect, type BrowserContext, type Page, type Route, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatSurface } from './chat-surface';
import { repoRoot } from './paths';
import { fulfillTranslationRequest, getTranslationRequestTexts, TRANSLATE_ENDPOINT_PATTERN } from './translation-endpoint';

const REPORT_DIR = path.join(repoRoot, 'test-results', 'performance');

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

export interface MockTranslationStats {
  completedItemCount: number;
  failureCount: number;
  requestCount: number;
  successCount: number;
  translatedItemCount: number;
}

export async function reloadMockChatPageForStoredSettings(page: Page): Promise<void> {
  await page.reload({ timeout: 15_000, waitUntil: 'commit' });
  await expect(page.locator('yt-live-chat-renderer')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.ytcq-inbox-button')).toBeVisible({ timeout: 15_000 });
}

export async function startBrowserPerfProbe(surface: ChatSurface): Promise<void> {
  await surface.locator('body').evaluate(() => {
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

export async function stopBrowserPerfProbe(
  surface: ChatSurface
): Promise<BrowserPerfProbeSnapshot> {
  return surface.locator('body').evaluate(() => {
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
    countText,
    delayMs = 0,
    failEvery = 0,
    sourceLanguage = 'es',
    translatedText
  }: {
    countText?: (_text: string) => boolean;
    delayMs?: number;
    failEvery?: number;
    sourceLanguage?: string;
    translatedText: string | ((_requestNumber: number) => string);
  },
  callback: (stats: MockTranslationStats) => Promise<T>
): Promise<T> {
  const completedTexts = new Set<string>();
  const stats = {
    completedItemCount: 0,
    failureCount: 0,
    requestCount: 0,
    successCount: 0,
    translatedItemCount: 0
  };

  const handler = async (route: Route) => {
    const requestTexts = getTranslationRequestTexts(route.request());
    const countedTexts = countText ? requestTexts.filter(countText) : requestTexts;
    const requestNumber = ++stats.requestCount;
    if (delayMs) await delay(delayMs);

    const failed = failEvery > 0 && requestNumber % failEvery === 0;
    if (failed) {
      await route.fulfill({
        body: JSON.stringify({ error: 'Mock performance translation failure' }),
        contentType: 'application/json',
        status: 503
      });
      stats.failureCount += 1;
    } else {
      const text = typeof translatedText === 'function'
        ? translatedText(requestNumber)
        : translatedText;
      await fulfillTranslationRequest(route, text, sourceLanguage);
      stats.successCount += 1;
      stats.translatedItemCount += countedTexts.length;
    }
    countedTexts.forEach((text) => completedTexts.add(text));
    stats.completedItemCount = completedTexts.size;
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
