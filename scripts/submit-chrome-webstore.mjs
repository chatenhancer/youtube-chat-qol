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
  getAccessToken,
  getChromeWebStoreConfig,
  getMissingChromeWebStoreEnv,
  submitChromeWebStorePackage
} from './lib/chrome-webstore.mjs';
import { loadLocalEnv } from './lib/local-env.mjs';

await loadLocalEnv();

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

await submitChromeWebStorePackage({
  token,
  publisherId: chromeConfig.publisherId,
  extensionId: chromeConfig.extensionId,
  zipPath,
  publishType: chromeConfig.publishType
});

console.log(`Submitted Chrome Web Store release ${releaseVersion}.`);

function normalizeVersion(version) {
  return String(version).replace(/^v/, '');
}
