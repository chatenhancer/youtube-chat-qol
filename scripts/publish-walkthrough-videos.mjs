#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getWalkthroughBrowserLocale,
  getWalkthroughLocales
} from './walkthrough-locales.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), '..');
const defaultInputDir = path.join(repoRoot, 'assets', 'demo', 'walkthrough');
const defaultManifestPath = path.join(repoRoot, 'docs', 'src', 'data', 'walkthrough-videos.json');
const defaultSiteBaseUrl = 'https://chatenhancer.com/';
const videoNamePattern = /^chat-enhancer-walkthrough-([a-z]{2}|zh_(?:CN|TW))-([a-f0-9]{8})\.mp4$/;
const videoNameSearchPattern = /chat-enhancer-walkthrough-(?:[a-z]{2}|zh_(?:CN|TW))-[a-f0-9]{8}\.mp4/g;
const cacheControl = 'public, max-age=31536000, immutable';
const retainedVersionCount = 2;
const retentionDeleteWorkerCount = 2;

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await publishWalkthroughVideos(readOptions(process.argv.slice(2)));
}

export async function publishWalkthroughVideos(options = {}) {
  const inputDir = path.resolve(options.inputDir || defaultInputDir);
  const manifestPath = path.resolve(options.manifestPath || defaultManifestPath);
  const supportedLocales = await getWalkthroughLocales();
  const manifest = await readManifest(manifestPath, supportedLocales);
  const requestedLocales = readRequestedLocales(options.locales, supportedLocales);
  const localVideos = await collectLocalVideos(inputDir, supportedLocales);
  const videosToPublish = requestedLocales
    ? requestedLocales.map((locale) => requireLocalVideo(localVideos, locale, inputDir))
    : [...localVideos.values()];

  if (!videosToPublish.length) {
    throw new Error(`No localized walkthrough videos found in ${inputDir}.`);
  }

  const publication = buildWalkthroughPublicationPlan(manifest, videosToPublish);
  validateCompleteManifest(publication.manifest.videos, supportedLocales);

  if (options.dryRun) {
    videosToPublish.forEach((video) => {
      console.log(`[walkthrough:${video.locale}] Would upload ${getObjectPath(manifest, video.fileName)}.`);
    });
    publication.obsoleteVideos.forEach(({ fileName, locale }) => {
      console.log(`[walkthrough:${locale}] Would delete ${getObjectPath(manifest, fileName)} after checking the live site.`);
    });
    console.log(`[walkthrough] Validated ${videosToPublish.length} video${videosToPublish.length === 1 ? '' : 's'}; no changes made.`);
    return { ...publication, videos: videosToPublish };
  }

  if (publication.obsoleteVideos.length) {
    await verifyLiveWalkthroughReferences(
      options.siteBaseUrl || defaultSiteBaseUrl,
      manifest.videos,
      publication.obsoleteVideos.map(({ locale }) => locale)
    );
  }

  const workerCount = Math.min(readWorkerCount(options.workers), videosToPublish.length);
  await runWorkerPool(videosToPublish, workerCount, async (video) => {
    await uploadVideo(manifest, video);
  });

  await runWorkerPool(publication.obsoleteVideos, retentionDeleteWorkerCount, async ({ fileName }) => {
    await deleteVideoWithRetry(manifest, fileName);
  });

  await writeJsonAtomically(manifestPath, publication.manifest);
  console.log(
    `[walkthrough] Published ${videosToPublish.length} localized video${videosToPublish.length === 1 ? '' : 's'} ` +
    `and updated ${path.relative(repoRoot, manifestPath)}.`
  );
  return { ...publication, videos: videosToPublish };
}

export function buildWalkthroughPublicationPlan(manifest, videosToPublish) {
  const nextVideos = { ...manifest.videos };
  const previousVideos = { ...(manifest.retention?.previousVideos || {}) };
  const obsoleteVideos = [];

  videosToPublish.forEach(({ fileName, locale }) => {
    const currentFileName = nextVideos[locale];
    if (fileName === currentFileName) return;

    const previousFileName = previousVideos[locale];
    if (previousFileName && previousFileName !== fileName) {
      obsoleteVideos.push({ fileName: previousFileName, locale });
    }
    if (currentFileName) previousVideos[locale] = currentFileName;
    nextVideos[locale] = fileName;
  });

  return {
    manifest: {
      ...manifest,
      retention: {
        keepVersionsPerLocale: retainedVersionCount,
        previousVideos: sortRecord(previousVideos)
      },
      videos: sortRecord(nextVideos)
    },
    obsoleteVideos: obsoleteVideos.sort((first, second) => first.locale.localeCompare(second.locale))
  };
}

export async function collectLocalVideos(inputDir, supportedLocales) {
  const supportedLocaleSet = new Set(supportedLocales);
  const entries = await readdir(inputDir, { withFileTypes: true }).catch((error) => {
    if (error?.code === 'ENOENT') return [];
    throw error;
  });
  const videos = new Map();

  for (const entry of entries.sort((first, second) => first.name.localeCompare(second.name))) {
    if (!entry.isFile()) continue;
    const match = videoNamePattern.exec(entry.name);
    if (!match) continue;

    const [, locale, expectedHash] = match;
    if (!supportedLocaleSet.has(locale)) {
      throw new Error(`Unsupported walkthrough locale in ${entry.name}: ${locale}.`);
    }
    if (videos.has(locale)) {
      throw new Error(`Multiple walkthrough videos found for ${locale} in ${inputDir}.`);
    }

    const filePath = path.join(inputDir, entry.name);
    const actualHash = (await hashFile(filePath)).slice(0, 8);
    if (actualHash !== expectedHash) {
      throw new Error(`${entry.name} has content hash ${actualHash}; expected ${expectedHash}.`);
    }

    const fileStat = await stat(filePath);
    videos.set(locale, {
      bytes: fileStat.size,
      fileName: entry.name,
      filePath,
      locale
    });
  }

  return videos;
}

async function readManifest(manifestPath, supportedLocales) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!isNonEmptyString(manifest.bucket)) throw new Error(`${manifestPath} must define bucket.`);
  if (!isNonEmptyString(manifest.keyPrefix)) throw new Error(`${manifestPath} must define keyPrefix.`);
  if (!isNonEmptyString(manifest.publicBaseUrl)) throw new Error(`${manifestPath} must define publicBaseUrl.`);
  if (!manifest.videos || typeof manifest.videos !== 'object' || Array.isArray(manifest.videos)) {
    throw new Error(`${manifestPath} must define a videos object.`);
  }
  if (manifest.retention !== undefined) {
    if (
      !manifest.retention ||
      typeof manifest.retention !== 'object' ||
      Array.isArray(manifest.retention) ||
      manifest.retention.keepVersionsPerLocale !== retainedVersionCount ||
      !manifest.retention.previousVideos ||
      typeof manifest.retention.previousVideos !== 'object' ||
      Array.isArray(manifest.retention.previousVideos)
    ) {
      throw new Error(
        `${manifestPath} retention must keep ${retainedVersionCount} versions per locale and define previousVideos.`
      );
    }
    validateManifestEntries(manifest.retention.previousVideos, supportedLocales);
  }

  const publicUrl = new URL(manifest.publicBaseUrl);
  if (publicUrl.protocol !== 'https:') throw new Error(`${manifestPath} publicBaseUrl must use HTTPS.`);
  if (!publicUrl.pathname.endsWith('/')) throw new Error(`${manifestPath} publicBaseUrl must end with a slash.`);
  validateManifestEntries(manifest.videos, supportedLocales);
  return manifest;
}

function validateManifestEntries(videos, supportedLocales) {
  const supportedLocaleSet = new Set(supportedLocales);
  for (const [locale, fileName] of Object.entries(videos)) {
    if (!supportedLocaleSet.has(locale)) throw new Error(`Unsupported locale in walkthrough manifest: ${locale}.`);
    const match = videoNamePattern.exec(fileName);
    if (!match || match[1] !== locale) {
      throw new Error(`Invalid walkthrough manifest file for ${locale}: ${fileName}.`);
    }
  }
}

function validateCompleteManifest(videos, supportedLocales) {
  validateManifestEntries(videos, supportedLocales);
  const missingLocales = supportedLocales.filter((locale) => !videos[locale]);
  if (missingLocales.length) {
    throw new Error(`Walkthrough manifest is missing locales: ${missingLocales.join(', ')}.`);
  }
}

function readRequestedLocales(value, supportedLocales) {
  if (!value) return null;
  const requestedLocales = [...new Set(value.split(',').map((locale) => locale.trim()).filter(Boolean))];
  if (!requestedLocales.length) throw new Error('At least one walkthrough locale is required.');
  const supportedLocaleSet = new Set(supportedLocales);
  const unsupportedLocales = requestedLocales.filter((locale) => !supportedLocaleSet.has(locale));
  if (unsupportedLocales.length) {
    throw new Error(`Unsupported walkthrough locales: ${unsupportedLocales.join(', ')}.`);
  }
  return requestedLocales;
}

function requireLocalVideo(localVideos, locale, inputDir) {
  const video = localVideos.get(locale);
  if (!video) throw new Error(`No local walkthrough video found for ${locale} in ${inputDir}.`);
  return video;
}

async function uploadVideo(manifest, video) {
  const objectPath = getObjectPath(manifest, video.fileName);
  console.log(
    `[walkthrough:${video.locale}] Uploading ${formatBytes(video.bytes)} to ${objectPath}.`
  );
  await runProcess(getWranglerPath(), [
    'r2',
    'object',
    'put',
    objectPath,
    '--remote',
    '--file',
    video.filePath,
    '--content-type',
    'video/mp4',
    '--content-language',
    getWalkthroughBrowserLocale(video.locale),
    '--cache-control',
    cacheControl
  ]);
}

async function deleteVideoWithRetry(manifest, fileName) {
  const objectPath = getObjectPath(manifest, fileName);
  const retryDelaysMs = [0, 1_000, 2_500];
  let lastError;

  for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
    if (retryDelaysMs[attempt]) await delay(retryDelaysMs[attempt]);
    try {
      console.log(
        `[walkthrough] Deleting ${objectPath}${attempt ? ` (attempt ${attempt + 1})` : ''}.`
      );
      await runProcess(getWranglerPath(), [
        'r2',
        'object',
        'delete',
        objectPath,
        '--remote',
        '--force'
      ]);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Could not delete ${objectPath} after ${retryDelaysMs.length} attempts.`, {
    cause: lastError
  });
}

export async function verifyLiveWalkthroughReferences(siteBaseUrl, currentVideos, locales) {
  const cacheBust = Date.now().toString(36);
  await Promise.all([...new Set(locales)].map(async (locale) => {
    const localePath = locale === 'en'
      ? ''
      : `${locale.replace('_', '-')}/`;
    const pageUrl = new URL(localePath, ensureTrailingSlash(siteBaseUrl));
    pageUrl.searchParams.set('walkthrough-retention', cacheBust);
    const response = await fetch(pageUrl, {
      headers: { 'cache-control': 'no-cache' }
    });
    if (!response.ok) {
      throw new Error(`${pageUrl.href} returned HTTP ${response.status}.`);
    }

    const html = await response.text();
    const matches = [...new Set(html.match(videoNameSearchPattern) || [])]
      .filter((fileName) => videoNamePattern.exec(fileName)?.[1] === locale);
    if (matches.length !== 1 || matches[0] !== currentVideos[locale]) {
      throw new Error(
        `${pageUrl.href} does not reference the current ${locale} walkthrough; wait for Pages to deploy before publishing again.`
      );
    }
  }));

  console.log(`[walkthrough] Verified ${locales.length} live locale reference${locales.length === 1 ? '' : 's'} before pruning.`);
}

async function runWorkerPool(items, workerCount, runItem) {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(workerCount, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await runItem(item);
    }
  }));
}

function getObjectPath(manifest, fileName) {
  const keyPrefix = manifest.keyPrefix.replace(/^\/+|\/+$/g, '');
  return `${manifest.bucket}/${keyPrefix}/${fileName}`;
}

function ensureTrailingSlash(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function getWranglerPath() {
  const executable = process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler';
  return path.join(repoRoot, 'node_modules', '.bin', executable);
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: path.join(repoRoot, '.wrangler', 'logs')
      },
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} failed with ${signal || `exit code ${code}`}.`));
    });
  });
}

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, filePath);
}

function sortRecord(value) {
  return Object.fromEntries(Object.entries(value).sort(([first], [second]) => first.localeCompare(second)));
}

function readOptions(args) {
  const options = {};
  for (const argument of args) {
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const [name, ...valueParts] = argument.split('=');
    const value = valueParts.join('=');
    if (name === '--input-dir' && value) options.inputDir = value;
    else if (name === '--manifest' && value) options.manifestPath = value;
    else if (name === '--locales' && value) options.locales = value;
    else if (name === '--site-base-url' && value) options.siteBaseUrl = value;
    else if (name === '--workers' && value) options.workers = value;
    else throw new Error(`Unknown walkthrough publish argument: ${argument}.`);
  }
  return options;
}

function readWorkerCount(value) {
  const workerCount = Number.parseInt(value || process.env.YTCQ_DEMO_UPLOAD_WORKERS || '4', 10);
  if (!Number.isFinite(workerCount) || workerCount < 1) {
    throw new Error(`Walkthrough upload workers must be a positive integer, received: ${value}.`);
  }
  return workerCount;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
