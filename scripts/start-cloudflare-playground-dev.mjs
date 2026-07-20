#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DOCKER_SHIM_ENV = 'YTCQ_PLAYGROUND_DOCKER_SHIM';
const SELF_PATH = fileURLToPath(import.meta.url);

if (process.env[DOCKER_SHIM_ENV] === '1') {
  runDockerShim(process.argv.slice(2));
}

const proxyImage = getWranglerContainerEgressImage();
const { digestRef, tagRef } = getImageRefs(proxyImage);

ensureDockerAvailable();
if (process.env.YTCQ_SKIP_CONTAINER_EGRESS_IMAGE_CHECK !== '1') {
  ensureDockerImage();
}

const wranglerBin = getWranglerBinPath();
const wranglerArgs = process.argv.slice(2);
const wrangler = spawnSync(process.execPath, [
  wranglerBin,
  'dev',
  '--config',
  'cloudflare/playground/wrangler.toml',
  ...getLocalDevArgs(wranglerArgs),
  ...wranglerArgs
], {
  env: {
    ...process.env,
    [DOCKER_SHIM_ENV]: '1',
    MINIFLARE_CONTAINER_EGRESS_IMAGE: tagRef,
    WRANGLER_DOCKER_BIN: process.env.WRANGLER_DOCKER_BIN || SELF_PATH,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || '.wrangler/logs'
  },
  stdio: 'inherit'
});

if (wrangler.error) {
  console.error(`[playground] Could not start Wrangler: ${wrangler.error.message}`);
  process.exit(1);
}
process.exit(wrangler.status ?? 1);

function getLocalDevArgs(args) {
  if (args.some((arg) => arg === '--remote' || arg === '-r' || arg === '--remote=true')) return [];

  // Keep Wrangler from rewriting local Origin headers to the production custom domain.
  return ['--local-upstream', '127.0.0.1:8787'];
}

function ensureDockerAvailable() {
  if (runDocker(['info']).ok) return;
  if (startColima() && runDocker(['info']).ok) return;

  exitWithDockerHelp('Docker is unavailable.');
}

function startColima() {
  if (process.platform !== 'darwin') return false;

  const version = spawnSync('colima', ['version'], { stdio: 'ignore' });
  if (version.error || version.status !== 0) return false;

  console.log('[playground] Docker is unavailable; starting Colima...');
  const colima = spawnSync('colima', ['start'], { stdio: 'inherit' });
  return !colima.error && colima.status === 0;
}

function ensureDockerImage() {
  if (hasDockerImage(tagRef)) return;

  if (!digestRef) {
    pullDockerImage(proxyImage);
    return;
  }

  if (!hasDockerImage(digestRef)) {
    pullDockerImage(proxyImage);
  }

  tagDockerImage(digestRef, tagRef);
}

function tagDockerImage(sourceRef, targetRef) {
  const tag = runDocker(['tag', sourceRef, targetRef], {
    stdio: 'inherit'
  });
  if (!tag.ok) {
    exitWithDockerHelp('Could not tag the Cloudflare container egress sidecar image.');
  }

  console.log(`[playground] Tagged ${sourceRef} as ${targetRef}`);
}

function pullDockerImage(image) {
  console.log(`[playground] Pulling Cloudflare container egress sidecar ${image}`);
  const pull = runDocker(['pull', image], {
    stdio: 'inherit'
  });
  if (!pull.ok) {
    exitWithDockerHelp('Could not pull the Cloudflare container egress sidecar image.');
  }
}

function getWranglerContainerEgressImage() {
  if (process.env.MINIFLARE_CONTAINER_EGRESS_IMAGE) {
    return process.env.MINIFLARE_CONTAINER_EGRESS_IMAGE;
  }

  const wranglerPackagePath = require.resolve('wrangler/package.json');
  const wranglerCliPath = path.join(path.dirname(wranglerPackagePath), 'wrangler-dist', 'cli.js');
  const wranglerCli = readFileSync(wranglerCliPath, 'utf8');
  const match = /DEFAULT_CONTAINER_EGRESS_INTERCEPTOR_IMAGE\s*=\s*"([^"]+)"/.exec(wranglerCli);
  if (!match) {
    console.error('[playground] Could not find Wrangler container egress sidecar image.');
    process.exit(1);
  }
  return match[1];
}

function getWranglerBinPath() {
  const wranglerPackagePath = require.resolve('wrangler/package.json');
  return path.join(path.dirname(wranglerPackagePath), 'bin', 'wrangler.js');
}

function getImageRefs(image) {
  const [nameAndTag, digest] = image.split('@');
  if (!digest) {
    return {
      digestRef: null,
      tagRef: image
    };
  }

  const slashIndex = nameAndTag.lastIndexOf('/');
  const tagIndex = nameAndTag.lastIndexOf(':');
  const repository = tagIndex > slashIndex ? nameAndTag.slice(0, tagIndex) : nameAndTag;
  return {
    digestRef: `${repository}@${digest}`,
    tagRef: nameAndTag
  };
}

function hasDockerImage(imageRef) {
  return runDocker(['image', 'inspect', imageRef]).ok;
}

function runDockerShim(args) {
  const realDocker = process.env.YTCQ_REAL_DOCKER_BIN || 'docker';
  const dockerEnv = { ...process.env };
  delete dockerEnv[DOCKER_SHIM_ENV];
  const docker = spawnSync(realDocker, normalizeDockerArgs(args), {
    env: dockerEnv,
    stdio: 'inherit'
  });

  if (docker.error) {
    console.error(`[playground] Could not run Docker: ${docker.error.message}`);
    process.exit(1);
  }
  process.exit(docker.status ?? 1);
}

function normalizeDockerArgs(args) {
  if (!isCloudflareProxyPull(args)) return args;

  const normalizedArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--platform') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--platform=')) continue;
    normalizedArgs.push(arg);
  }
  return normalizedArgs;
}

function isCloudflareProxyPull(args) {
  return args[0] === 'pull' && args.some((arg) => arg.includes('cloudflare/proxy-everything'));
}

function runDocker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  });
  return {
    ok: !result.error && result.status === 0,
    error: result.error,
    status: result.status,
    stderr: result.stderr,
    stdout: result.stdout
  };
}

function exitWithDockerHelp(message) {
  console.error(`[playground] ${message}`);
  console.error('[playground] Make sure Docker/Colima is running, then retry npm run cloudflare:playground:dev.');
  process.exit(1);
}
