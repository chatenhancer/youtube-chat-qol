import { describe, expect, it } from 'vitest';
import { createBrowserTestPlan } from './run-browser-tests-plan.mjs';

describe('browser smoke-test command planner', () => {
  it('builds before running Playwright by default', () => {
    expect(createBrowserTestPlan(['--project=youtube-mock'])).toEqual({
      playwrightArgs: [
        'test',
        '--config=playwright.config.ts',
        '--project=youtube-mock'
      ],
      reportOutputFolder: 'playwright-report/youtube-mock',
      shouldBuild: true
    });
  });

  it('uses existing build output when --no-build is present', () => {
    expect(createBrowserTestPlan(['--project=youtube-mock', '--no-build'])).toEqual({
      playwrightArgs: [
        'test',
        '--config=playwright.config.ts',
        '--project=youtube-mock'
      ],
      reportOutputFolder: 'playwright-report/youtube-mock',
      shouldBuild: false
    });
  });

  it('preserves extra Playwright arguments after the npm command separator', () => {
    expect(createBrowserTestPlan(['--project=youtube-live', '-g', 'logged-in'])).toEqual({
      playwrightArgs: [
        'test',
        '--config=playwright.config.ts',
        '--project=youtube-live',
        '-g',
        'logged-in'
      ],
      reportOutputFolder: 'playwright-report/youtube-live',
      shouldBuild: true
    });
  });

  it('uses the combined report folder when all browser projects run together', () => {
    expect(createBrowserTestPlan([])).toEqual({
      playwrightArgs: [
        'test',
        '--config=playwright.config.ts'
      ],
      reportOutputFolder: 'playwright-report/browser',
      shouldBuild: true
    });
  });

  it('supports the spaced --project argument form', () => {
    expect(createBrowserTestPlan(['--project', 'youtube-live'])).toEqual({
      playwrightArgs: [
        'test',
        '--config=playwright.config.ts',
        '--project',
        'youtube-live'
      ],
      reportOutputFolder: 'playwright-report/youtube-live',
      shouldBuild: true
    });
  });
});
