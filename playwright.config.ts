/**
 * Playwright browser-test configuration.
 *
 * These tests launch the built Chrome extension in a persistent Chromium
 * profile so content scripts, extension storage, and the popup can be tested
 * together instead of only through isolated unit tests.
 */
import { defineConfig } from '@playwright/test';

const DEFAULT_WORKERS = 4;
const reportOutputFolder = process.env.YTCQ_PLAYWRIGHT_REPORT_DIR ?? 'playwright-report/browser';

export default defineConfig({
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  outputDir: 'test-results/browser',
  projects: [
    {
      name: 'youtube-mock',
      testMatch: /specs\/youtube-mock\/.*\.spec\.ts/
    },
    {
      name: 'youtube-live',
      testMatch: /specs\/youtube-live\/.*\.spec\.ts/
    }
  ],
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: reportOutputFolder }]
  ],
  testDir: './tests/browser',
  timeout: 90_000,
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  workers: getWorkerCount()
});

function getWorkerCount(): number {
  const rawWorkerCount = process.env.YTCQ_TEST_WORKERS;
  if (!rawWorkerCount) return DEFAULT_WORKERS;

  const workerCount = Number.parseInt(rawWorkerCount, 10);
  if (!Number.isFinite(workerCount) || workerCount < 1) return DEFAULT_WORKERS;

  return workerCount;
}
