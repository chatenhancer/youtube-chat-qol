#!/usr/bin/env node
/**
 * Installs Playwright's Chromium browser for local browser tests after npm
 * dependencies are installed.
 */
import { spawnSync } from 'node:child_process';

const SKIP_VALUES = new Set(['1', 'true', 'yes']);

if (process.env.CI) {
  console.log('Skipping Playwright Chromium install in CI; workflows install it explicitly.');
  process.exit(0);
}

if (SKIP_VALUES.has((process.env.YTCQ_SKIP_PLAYWRIGHT_INSTALL || '').toLowerCase())) {
  console.log('Skipping Playwright Chromium install because YTCQ_SKIP_PLAYWRIGHT_INSTALL is set.');
  process.exit(0);
}

console.log('Installing Playwright Chromium for browser tests...');

const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.status !== 0) {
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  console.error('Playwright Chromium install failed. Run `npm run test:browser:install` to retry.');
  process.exit(exitCode);
}
