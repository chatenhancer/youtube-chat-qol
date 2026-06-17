import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const bumpTypes = new Set(['major', 'minor', 'patch']);
const bumpType = process.argv[2] || 'patch';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(root, 'package.json');
const packageLockPath = path.join(root, 'package-lock.json');
const manifestPath = path.join(root, 'manifest.json');
const versionGitPaths = ['package.json', 'package-lock.json', 'manifest.json'];

if (!bumpTypes.has(bumpType)) {
  console.error('Usage: npm run version:bump [-- <major|minor|patch>]');
  console.error('Defaults to patch when no bump type is provided.');
  process.exit(1);
}

const packageJson = await readJson(packageJsonPath);
const packageLock = await readJson(packageLockPath);
const currentVersion = parseVersion(packageJson.version);
const nextVersion = formatVersion(bumpVersion(currentVersion, bumpType));

packageJson.version = nextVersion;
packageLock.version = nextVersion;
if (packageLock.packages?.['']) {
  packageLock.packages[''].version = nextVersion;
}

await writeJson(packageJsonPath, packageJson);
await writeJson(packageLockPath, packageLock);
await updateManifestVersion(manifestPath, nextVersion);
await commitVersionBump(nextVersion);

console.log(`Bumped version ${formatVersion(currentVersion)} -> ${nextVersion}.`);
console.log('Updated package.json, package-lock.json, and manifest.json.');
console.log(`Committed "${versionCommitMessage(nextVersion)}".`);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function updateManifestVersion(filePath, version) {
  const manifest = await readFile(filePath, 'utf8');
  const updated = manifest.replace(
    /^(\s*"version"\s*:\s*")\d+\.\d+\.\d+(")/m,
    `$1${version}$2`
  );
  if (updated === manifest) {
    throw new Error('Could not find manifest.json version field.');
  }
  await writeFile(filePath, updated);
}

async function commitVersionBump(version) {
  await runGit([
    'commit',
    '--only',
    '--message',
    versionCommitMessage(version),
    '--',
    ...versionGitPaths
  ]);
}

async function runGit(args) {
  try {
    await execFileAsync('git', args, { cwd: root });
  } catch (error) {
    throw new Error(formatGitError(args, error));
  }
}

function formatGitError(args, error) {
  const stdout = error && typeof error === 'object' && 'stdout' in error ? error.stdout : '';
  const stderr = error && typeof error === 'object' && 'stderr' in error ? error.stderr : '';
  const output = [stdout, stderr].map(String).filter(Boolean).join('\n').trim();
  const command = `git ${args.join(' ')}`;

  return output ? `${command} failed:\n${output}` : `${command} failed.`;
}

function versionCommitMessage(version) {
  return `chore: bump version to ${version}`;
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value || ''));
  if (!match) {
    throw new Error(`Expected package.json version to be exact semver X.Y.Z, got "${value}".`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

function bumpVersion(version, type) {
  if (type === 'major') {
    return {
      major: version.major + 1,
      minor: 0,
      patch: 0
    };
  }

  if (type === 'minor') {
    return {
      major: version.major,
      minor: version.minor + 1,
      patch: 0
    };
  }

  return {
    major: version.major,
    minor: version.minor,
    patch: version.patch + 1
  };
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}
