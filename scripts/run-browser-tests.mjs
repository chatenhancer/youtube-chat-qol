/*
 * Browser smoke-test runner.
 *
 * Public npm browser-test commands should build the Chrome extension first.
 * The repo verification command already builds every extension target, so it
 * calls this runner with --no-build to avoid rebuilding before Playwright.
 */
import { spawnSync } from 'node:child_process';
import { createBrowserTestPlan } from './run-browser-tests-plan.mjs';

const args = process.argv.slice(2);
const { playwrightArgs, reportOutputFolder, shouldBuild } = createBrowserTestPlan(args);

if (shouldBuild) {
  run(getNpmCommand(), ['run', 'build:chrome']);
}

run(getPlaywrightCommand(), playwrightArgs, {
  YTCQ_PLAYWRIGHT_REPORT_DIR: reportOutputFolder
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
