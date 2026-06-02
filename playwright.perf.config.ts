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

export default defineConfig({
  expect: {
    timeout: 20_000
  },
  fullyParallel: false,
  outputDir: 'test-results/performance/browser',
  projects: [
    {
      name: 'youtube-mock-perf',
      testMatch: /specs\/yt-mock-perf-.*\.spec\.ts/,
      use: {
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        video: 'off'
      }
    }
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
