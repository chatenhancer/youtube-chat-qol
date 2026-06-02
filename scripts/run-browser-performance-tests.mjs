/*
 * Browser performance-test runner.
 *
 * Performance tests use a separate Playwright config so they can generate
 * timing reports without joining the normal browser smoke-test suite.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const shouldBuild = !args.includes('--no-build');
const playwrightArgs = [
  'test',
  '--config=playwright.perf.config.ts',
  ...args.filter((arg) => arg !== '--no-build')
];

if (shouldBuild) {
  run(getNpmCommand(), ['run', 'build:chrome']);
}

run(getPlaywrightCommand(), playwrightArgs, {
  YTCQ_PLAYWRIGHT_JSON_REPORT: process.env.YTCQ_PLAYWRIGHT_JSON_REPORT || 'test-results/performance/playwright-report.json',
  YTCQ_PLAYWRIGHT_REPORT_DIR: process.env.YTCQ_PLAYWRIGHT_REPORT_DIR || 'playwright-report/performance'
});

function run(command, commandArgs, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function getPlaywrightCommand() {
  return process.platform === 'win32' ? 'playwright.cmd' : 'playwright';
}
