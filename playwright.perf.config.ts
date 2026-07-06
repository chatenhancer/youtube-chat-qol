/**
 * Playwright performance-test configuration.
 *
 * Performance checks are intentionally separate from the normal browser smoke
 * suite. They run against the deterministic mock YouTube chat surface and
 * report timing/heap/long-task metrics without making ordinary correctness
 * verification slower or more environment-sensitive.
 */
import { defineConfig } from '@playwright/test';

const reportOutputFolder = process.env.YTCQ_PLAYWRIGHT_REPORT_DIR ?? 'playwright-report/performance';
const jsonReportPath = process.env.YTCQ_PLAYWRIGHT_JSON_REPORT ?? 'test-results/performance/playwright-report.json';
const includeLivePerformanceTests = process.env.YTCQ_PERF_INCLUDE_LIVE === '1';

export default defineConfig({
  expect: {
    timeout: 20_000
  },
  fullyParallel: false,
  outputDir: 'test-results/performance/browser',
  projects: [
    createPerformanceProject('youtube-mock-perf', /specs\/yt-mock-perf-.*\.spec\.ts/),
    ...(includeLivePerformanceTests
      ? [createPerformanceProject('youtube-live-perf', /specs\/yt-live-perf-.*\.spec\.ts/)]
      : [])
  ],
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: reportOutputFolder }],
    ['json', { outputFile: jsonReportPath }]
  ],
  testDir: './tests/browser',
  timeout: 120_000,
  use: {
    actionTimeout: 20_000,
    navigationTimeout: 30_000
  },
  workers: 1
});

function createPerformanceProject(name: string, testMatch: RegExp) {
  return {
    name,
    testMatch,
    use: {
      screenshot: 'only-on-failure' as const,
      trace: 'retain-on-failure' as const,
      video: 'off' as const
    }
  };
}
