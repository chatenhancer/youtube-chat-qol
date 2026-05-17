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
const releaseDir = path.join(root, 'dist', 'release');
const targetOutputDirs = {
  chrome: path.join(root, 'dist', 'extension'),
  edge: path.join(root, 'dist', 'extension-edge'),
  firefox: path.join(root, 'dist', 'extension-firefox')
};
const targets = getRequestedTargets();

await mkdir(releaseDir, { recursive: true });

for (const target of targets) {
  const extensionDir = getTargetOutputDir(target);
  const zipPath = path.join(releaseDir, getZipName(target));
  const result = spawnSync('zip', ['-r', zipPath, '.'], {
    cwd: extensionDir,
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    throw new Error(`zip exited with ${result.status ?? 'unknown status'}`);
  }
}

function getRequestedTargets() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--all')) return ['chrome', 'edge', 'firefox'];
  const targetArg = [...args].find((arg) => arg.startsWith('--target='));
  const target = targetArg ? targetArg.slice('--target='.length) : 'chrome-default';

  if (target === 'chrome-default') return ['chrome-default'];
  if (!Object.hasOwn(targetOutputDirs, target)) {
    throw new Error(`Unsupported zip target: ${target}`);
  }
  return [target];
}

function getZipName(target) {
  if (target === 'chrome-default') return `youtube-chat-qol-${packageJson.version}.zip`;
  return `youtube-chat-qol-${packageJson.version}-${target}.zip`;
}

function getTargetOutputDir(target) {
  return target === 'chrome-default' ? targetOutputDirs.chrome : targetOutputDirs[target];
}
