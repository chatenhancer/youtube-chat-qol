/*
 * Chrome Web Store release submission.
 *
 * Uploads the Chrome release zip and submits it for review using the Chrome Web
 * Store API v2. The script intentionally exits successfully when credentials
 * are not configured so tagged releases can still produce GitHub artifacts.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };
import {
  describeChromeWebStoreStatus,
  fetchChromeWebStoreStatus,
  getAccessToken,
  getChromeWebStoreConfig,
  getMissingChromeWebStoreEnv,
  isChromeWebStoreSubmissionBlocked,
  submitChromeWebStorePackage
} from './lib/chrome-webstore.mjs';
import {
  createDeferredChromeRelease,
  getGitHubConfig,
  queueDeferredChromeRelease
} from './lib/deferred-chrome-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'dist', 'release');
const releaseVersion = normalizeVersion(process.env.CHROME_WEBSTORE_RELEASE_VERSION || packageJson.version);
const zipPath = path.join(releaseDir, `youtube-chat-qol-${releaseVersion}-chrome.zip`);

const missingEnv = getMissingChromeWebStoreEnv();
if (missingEnv.length) {
  console.log(`Skipping Chrome Web Store submission. Missing: ${missingEnv.join(', ')}`);
  process.exit(0);
}

const chromeConfig = getChromeWebStoreConfig();
const token = await getAccessToken(chromeConfig.serviceAccount);

if (shouldDeferBlockedSubmission()) {
  const status = await fetchChromeWebStoreStatus(token, chromeConfig.publisherId, chromeConfig.extensionId);
  if (isChromeWebStoreSubmissionBlocked(status)) {
    await queueBlockedRelease(status);
    console.log(
      `Deferred Chrome Web Store release ${releaseVersion}; current submitted revision is ${describeChromeWebStoreStatus(status)}.`
    );
    process.exit(0);
  }
}

await submitChromeWebStorePackage({
  token,
  publisherId: chromeConfig.publisherId,
  extensionId: chromeConfig.extensionId,
  zipPath,
  publishType: chromeConfig.publishType
});

console.log(`Submitted Chrome Web Store release ${releaseVersion}.`);

async function queueBlockedRelease(status) {
  const release = createDeferredChromeRelease({
    version: releaseVersion,
    statusDescription: describeChromeWebStoreStatus(status)
  });
  await queueDeferredChromeRelease({
    config: getGitHubConfig(),
    release
  });
}

function shouldDeferBlockedSubmission() {
  return process.env.CHROME_WEBSTORE_DEFER_ON_BLOCKED === '1' ||
    process.env.CHROME_WEBSTORE_DEFER_ON_BLOCKED === 'true';
}

function normalizeVersion(version) {
  return String(version).replace(/^v/, '');
}
