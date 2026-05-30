/**
 * Shared filesystem and URL paths for browser smoke tests.
 *
 * Keeping these values in one place makes the fixture tests, real YouTube
 * tests, and login helper agree on the built extension location and the
 * persistent signed-in Chrome profile.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const supportDir = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(supportDir, '..', '..', '..');
export const extensionDir = path.join(repoRoot, 'dist', 'extension-chrome');
export const defaultLiveUrl = 'https://www.youtube.com/watch?v=EWrX250Zhko';

export function getLiveProfileDir(): string {
  return path.resolve(process.env.YTCQ_CHROME_PROFILE || path.join(repoRoot, '.chrome-test-profile'));
}
