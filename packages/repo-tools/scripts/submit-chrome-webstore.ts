/*
 * Chrome Web Store release submission.
 *
 * Uploads the Chrome release zip and submits it for review using the Chrome Web
 * Store API v2. The script intentionally exits successfully when credentials
 * are not configured so tagged releases can still produce GitHub artifacts.
 * Set CHROME_WEBSTORE_REPLACE_PENDING=true to replace an older pending review;
 * local publishing retains the existing upload-and-submit behavior by default.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../../../package.json' with { type: 'json' };
import {
  getAccessToken,
  getChromeWebStoreConfig,
  getMissingChromeWebStoreEnv,
  submitChromeWebStorePackage
} from './lib/chrome-webstore.ts';
import { loadLocalEnv } from './lib/local-env.ts';

await loadLocalEnv();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
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

const submitted = await submitChromeWebStorePackage({
  token,
  publisherId: chromeConfig.publisherId,
  extensionId: chromeConfig.extensionId,
  zipPath,
  publishType: chromeConfig.publishType,
  releaseVersion,
  replacePending: chromeConfig.replacePending
});

if (submitted) console.log(`Submitted Chrome Web Store release ${releaseVersion}.`);

function normalizeVersion(version) {
  return String(version).replace(/^v/, '');
}
