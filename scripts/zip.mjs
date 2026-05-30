/*
 * Release archive script.
 *
 * Packages built dist/extension-* folders into versioned browser-store zips
 * and adds the tracked source archive required by Firefox AMO.
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'dist', 'release');
const targetOutputDirs = {
  chrome: path.join(root, 'dist', 'extension-chrome'),
  edge: path.join(root, 'dist', 'extension-edge'),
  firefox: path.join(root, 'dist', 'extension-firefox')
};
const targets = getRequestedTargets();

await mkdir(releaseDir, { recursive: true });

for (const target of targets) {
  const extensionDir = getTargetOutputDir(target);
  const zipPath = path.join(releaseDir, getZipName(target));
  await rm(zipPath, { force: true });
  run('zip', ['-r', zipPath, '.'], {
    cwd: extensionDir,
    stdio: 'inherit'
  });
}

await createSourceArchive();

async function createSourceArchive() {
  const sourceZipPath = path.join(releaseDir, `youtube-chat-qol-${packageJson.version}-source.zip`);
  await rm(sourceZipPath, { force: true });
  const files = run('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 20 * 1024 * 1024
  }).stdout;

  run('zip', ['-q', '-@', sourceZipPath], {
    cwd: root,
    input: Buffer.from(files).toString('utf8').replaceAll('\0', '\n')
  });
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, options);

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }

  return result;
}
