/**
 * Playwright browser-test configuration.
 *
 * These tests launch the built Chrome extension in a persistent Chromium
 * profile so content scripts, extension storage, and the popup can be tested
 * together instead of only through isolated unit tests.
 */
import { defineConfig } from '@playwright/test';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { shouldCaptureBrowserFailureArtifacts } from './tests/browser/helpers/artifact-policy';

const DEFAULT_WORKERS = getBrowserSpecFileCount();
const reportOutputFolder = process.env.YTCQ_PLAYWRIGHT_REPORT_DIR ?? 'playwright-report/browser';
const jsonReportPath = process.env.YTCQ_PLAYWRIGHT_JSON_REPORT;
const failureArtifactUse = {
  screenshot: 'only-on-failure' as const,
  trace: 'retain-on-failure' as const,
  video: 'retain-on-failure' as const
};
const disabledArtifactUse = {
  screenshot: 'off' as const,
  trace: 'off' as const,
  video: 'off' as const
};

export default defineConfig({
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  outputDir: 'test-results/browser',
  projects: [
    {
      name: 'youtube-mock',
      testMatch: /specs\/youtube-mock\/.*\.spec\.ts/,
      use: failureArtifactUse
    },
    {
      name: 'youtube-live',
      testMatch: /specs\/youtube-live\/.*\.spec\.ts/,
      use: shouldCaptureBrowserFailureArtifacts('youtube-live') ? failureArtifactUse : disabledArtifactUse
    }
  ],
  reporter: getReporters(),
  testDir: './tests/browser',
  timeout: 90_000,
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000
  },
  workers: getWorkerCount()
});

function getReporters() {
  const reporters: NonNullable<Parameters<typeof defineConfig>[0]['reporter']> = [
    ['list'],
    ['html', { open: 'never', outputFolder: reportOutputFolder }]
  ];
  if (jsonReportPath) {
    reporters.push(['json', { outputFile: jsonReportPath }]);
  }
  return reporters;
}

function getWorkerCount(): number {
  const rawWorkerCount = process.env.YTCQ_TEST_WORKERS;
  if (!rawWorkerCount) return DEFAULT_WORKERS;

  const workerCount = Number.parseInt(rawWorkerCount, 10);
  if (!Number.isFinite(workerCount) || workerCount < 1) return DEFAULT_WORKERS;

  return workerCount;
}

function getBrowserSpecFileCount(): number {
  const specsDir = path.join(process.cwd(), 'tests', 'browser', 'specs');
  try {
    return Math.max(1, countSpecFiles(specsDir));
  } catch {
    return 1;
  }
}

function countSpecFiles(directory: string): number {
  return readdirSync(directory, { withFileTypes: true }).reduce((count, entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return count + countSpecFiles(entryPath);
    return count + (entry.name.endsWith('.spec.ts') ? 1 : 0);
  }, 0);
}
