/*
 * Publishes the newest deferred Chrome Web Store release.
 *
 * Scheduled GitHub Actions runs execute from the default branch, so this script
 * downloads the Chrome zip from the GitHub Release asset recorded in the
 * deferred issue instead of rebuilding from the current checkout.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  closeDeferredChromeIssue,
  downloadGitHubReleaseAsset,
  findDeferredChromeIssue,
  findGitHubReleaseAsset,
  getGitHubConfig,
  parseDeferredChromeRelease
} from './lib/deferred-chrome-release.mjs';
import { maskGithubActionsValues } from './lib/github-actions-log.mjs';
import { loadLocalEnv } from './lib/local-env.mjs';

await loadLocalEnv();
maskGithubActionsValues([
  process.env.CHROME_WEBSTORE_EXTENSION_ID,
  process.env.CHROME_WEBSTORE_PUBLISHER_ID
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'dist', 'release');

const githubConfig = getGitHubConfig();
const issue = await findDeferredChromeIssue(githubConfig);

if (!issue) {
  console.log('No deferred Chrome Web Store release issue is open.');
  process.exit(0);
}

const release = parseDeferredChromeRelease(issue.body);
assertDeferredRelease(release, issue.number);

const missingEnv = getMissingChromeWebStoreEnv();
if (missingEnv.length) {
  console.log(`Skipping deferred Chrome Web Store submission. Missing: ${missingEnv.join(', ')}`);
  process.exit(0);
}

const chromeConfig = getChromeWebStoreConfig();
maskGithubActionsValues([
  chromeConfig.extensionId,
  chromeConfig.publisherId,
  chromeConfig.serviceAccount?.client_email
]);
const token = await getAccessToken(chromeConfig.serviceAccount);
const status = await fetchChromeWebStoreStatus(token, chromeConfig.publisherId, chromeConfig.extensionId);

if (isChromeWebStoreSubmissionBlocked(status)) {
  console.log(
    `Chrome Web Store is still blocked by submitted revision ${describeChromeWebStoreStatus(status)}; keeping issue #${issue.number} open.`
  );
  process.exit(0);
}

await exitIfDeferredReleaseWasReplaced(issue.number, release);
await mkdir(releaseDir, { recursive: true });

const zipPath = path.join(releaseDir, release.chrome_asset_name);
const asset = await findGitHubReleaseAsset(githubConfig, release.tag, release.chrome_asset_name);
if (!asset) {
  throw new Error(`Could not find ${release.chrome_asset_name} on GitHub Release ${release.tag}.`);
}

await downloadGitHubReleaseAsset(githubConfig, asset, zipPath);
await submitChromeWebStorePackage({
  token,
  publisherId: chromeConfig.publisherId,
  extensionId: chromeConfig.extensionId,
  zipPath,
  publishType: chromeConfig.publishType
});
await closeDeferredChromeIssue({
  config: githubConfig,
  issueNumber: issue.number,
  release
});

console.log(`Submitted deferred Chrome Web Store release ${release.tag} and closed issue #${issue.number}.`);

function assertDeferredRelease(release, issueNumber) {
  if (!release || typeof release !== 'object') {
    throw new Error(`Deferred Chrome Web Store issue #${issueNumber} does not contain release JSON.`);
  }

  const requiredFields = ['tag', 'version', 'chrome_asset_name'];
  const missingFields = requiredFields.filter((field) => !release[field]);
  if (missingFields.length) {
    throw new Error(`Deferred Chrome Web Store issue #${issueNumber} is missing: ${missingFields.join(', ')}.`);
  }
}

async function exitIfDeferredReleaseWasReplaced(issueNumber, release) {
  const currentIssue = await findDeferredChromeIssue(githubConfig);
  const currentRelease = currentIssue ? parseDeferredChromeRelease(currentIssue.body) : null;

  if (currentIssue?.number === issueNumber && currentRelease?.tag === release.tag) return;

  const currentTag = currentRelease?.tag || 'none';
  console.log(`Deferred Chrome Web Store release changed from ${release.tag} to ${currentTag}; exiting without submitting.`);
  process.exit(0);
}
