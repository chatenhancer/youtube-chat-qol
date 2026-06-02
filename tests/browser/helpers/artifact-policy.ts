/**
 * Browser artifact privacy policy.
 *
 * Mock tests use synthetic chat content, so they can keep rich diagnostics in
 * CI. Live YouTube tests may contain real chat messages; keep their screenshots,
 * traces, videos, and DOM dumps local by default unless CI explicitly opts in.
 */
import type { TestInfo } from '@playwright/test';

const ENABLED_VALUES = new Set(['1', 'true', 'yes']);

export function shouldCaptureBrowserFailureArtifacts(projectName: string): boolean {
  if (projectName !== 'youtube-live') return true;
  if (process.env.GITHUB_ACTIONS !== 'true') return true;
  return ENABLED_VALUES.has((process.env.YTCQ_CAPTURE_LIVE_BROWSER_ARTIFACTS || '').toLowerCase());
}

export function shouldCaptureDomDump(testInfo: TestInfo): boolean {
  return shouldCaptureBrowserFailureArtifacts(testInfo.project.name);
}
