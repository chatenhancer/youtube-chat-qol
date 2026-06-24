import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as readline from 'node:readline/promises';
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

const releasePreview = getReleasePreview(tagName);
printReleasePreview(tagName, releasePreview);

if (args.dryRun) {
  console.log(`Would push ${branch} to ${args.remote}.`);
  console.log(`Would create annotated tag ${tagName}.`);
  console.log(`Would push ${tagName} to ${args.remote}.`);
  process.exit(0);
}

if (!(await confirmRelease(tagName))) {
  console.log(`Aborted ${tagName}.`);
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
    'then pushes the tag. The worktree must be clean.',
    '',
    'Before tagging, prints the commits entering the release and asks for',
    'confirmation. Press Enter or type Y to continue; type N to abort.'
  ].join('\n'));
}

function getReleasePreview(tagName) {
  const previousTag = getPreviousReleaseTag(tagName);
  const logRange = previousTag ? `${previousTag}..HEAD` : 'HEAD';
  const commitOutput = gitOutput(['log', '--pretty=format:%h %s', '--reverse', logRange]);
  const commits = commitOutput ? commitOutput.split('\n') : [];

  return {
    commits,
    logRange,
    previousTag
  };
}

function getPreviousReleaseTag(tagName) {
  const tagOutput = gitOutput(['tag', '--merged', 'HEAD', '--list', 'v[0-9]*', '--sort=-version:refname']);
  const releaseTags = tagOutput
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag) && tag !== tagName);

  return releaseTags[0] || '';
}

function printReleasePreview(tagName, preview) {
  console.log(`Release ${tagName} commit preview:`);
  if (preview.previousTag) {
    console.log(`Previous release tag: ${preview.previousTag}`);
  } else {
    console.log('Previous release tag: none found');
  }
  console.log(`Commit range: ${preview.logRange}`);
  console.log('');

  if (preview.commits.length === 0) {
    console.log('No commits found for this release range.');
    console.log('');
    return;
  }

  for (const commit of preview.commits) {
    console.log(`- ${commit}`);
  }
  console.log('');
}

async function confirmRelease(tagName) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error([
      'Release confirmation requires an interactive terminal.',
      'Run this command from a terminal so you can type Y or N.'
    ].join('\n'));
  }

  const prompt = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    for (;;) {
      const answer = (await prompt.question(`Create and push ${tagName}? [Y/n] `)).trim().toLowerCase();

      if (answer === '' || answer === 'y' || answer === 'yes') {
        return true;
      }
      if (answer === 'n' || answer === 'no') {
        return false;
      }

      console.log('Please type Y or N.');
    }
  } finally {
    prompt.close();
  }
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
