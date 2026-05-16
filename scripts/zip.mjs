/*
 * Release archive script.
 *
 * Packages dist/extension into a versioned zip after the normal build has
 * produced a Web Store-ready extension directory.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'dist', 'extension');
const releaseDir = path.join(root, 'dist', 'release');
const zipPath = path.join(releaseDir, `youtube-chat-qol-${packageJson.version}.zip`);

await mkdir(releaseDir, { recursive: true });

const result = spawnSync('zip', ['-r', zipPath, '.'], {
  cwd: extensionDir,
  stdio: 'inherit'
});

if (result.status !== 0) {
  throw new Error(`zip exited with ${result.status ?? 'unknown status'}`);
}
