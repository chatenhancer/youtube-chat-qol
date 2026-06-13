import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(root, 'package.json');
const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printUsage();
  process.exit(0);
}

const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const version = String(packageJson.version || '');
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Expected package.json version to be exact semver X.Y.Z, got "${packageJson.version}".`);
}

const tagName = `v${version}`;
const branch = gitOutput(['branch', '--show-current']);
if (!branch) {
  throw new Error('Cannot create a release tag while Git is detached from a branch.');
}

const dirtyFiles = gitOutput(['status', '--porcelain']);
if (dirtyFiles) {
  throw new Error([
    'Refusing to create a release tag with uncommitted changes.',
    'Commit the version bump first, then run this command again.'
  ].join('\n'));
}

const existingLocalTag = spawnGit(['rev-parse', '--verify', '--quiet', `refs/tags/${tagName}`]);
if (existingLocalTag.status === 0) {
  throw new Error(`Tag ${tagName} already exists locally.`);
}
if (existingLocalTag.status !== 1) {
  throw new Error(`Could not check whether ${tagName} exists locally.`);
}

const existingRemoteTag = spawnGit(['ls-remote', '--exit-code', '--tags', args.remote, `refs/tags/${tagName}`]);
if (existingRemoteTag.status === 0) {
  throw new Error(`Tag ${tagName} already exists on ${args.remote}.`);
}
if (existingRemoteTag.status !== 2) {
  throw new Error(`Could not check whether ${tagName} exists on ${args.remote}.`);
}

if (args.dryRun) {
  console.log(`Would push ${branch} to ${args.remote}.`);
  console.log(`Would create annotated tag ${tagName}.`);
  console.log(`Would push ${tagName} to ${args.remote}.`);
  process.exit(0);
}

git(['push', args.remote, `HEAD:${branch}`]);
git(['tag', '-a', tagName, '-m', `Release ${tagName}`]);
git(['push', args.remote, tagName]);

console.log(`Created and pushed ${tagName}.`);

function parseArgs(argv) {
  const parsed = {
    dryRun: false,
    help: false,
    remote: 'origin'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      parsed.dryRun = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--remote') {
      const remote = argv[index + 1];
      if (!remote) {
        throw new Error('Expected a remote name after --remote.');
      }
      parsed.remote = remote;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printUsage() {
  console.log([
    'Usage: npm run release:tag -- [--remote <name>] [--dry-run]',
    '',
    'Pushes the current branch, creates an annotated vX.Y.Z tag from package.json,',
    'then pushes the tag. The worktree must be clean.'
  ].join('\n'));
}

function git(args) {
  const result = spawnGit(args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed.`);
  }
  return result;
}

function gitOutput(args) {
  return git(args).stdout.trim();
}

function spawnGit(args) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.stderr) {
    process.stderr.write(result.stderr);
  }
  return result;
}
