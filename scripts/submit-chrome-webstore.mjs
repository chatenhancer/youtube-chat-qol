/*
 * Chrome Web Store release submission.
 *
 * Uploads the Chrome release zip and submits it for review using the Chrome Web
 * Store API v2. The script intentionally exits successfully when credentials
 * are not configured so tagged releases can still produce GitHub artifacts.
 */
import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'dist', 'release');
const zipPath = path.join(releaseDir, `youtube-chat-qol-${packageJson.version}-chrome.zip`);
const requiredEnv = [
  'CHROME_WEBSTORE_EXTENSION_ID',
  'CHROME_WEBSTORE_PUBLISHER_ID',
  'CHROME_WEBSTORE_SERVICE_ACCOUNT_JSON'
];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length) {
  console.log(`Skipping Chrome Web Store submission. Missing: ${missingEnv.join(', ')}`);
  process.exit(0);
}

const extensionId = process.env.CHROME_WEBSTORE_EXTENSION_ID;
const publisherId = process.env.CHROME_WEBSTORE_PUBLISHER_ID;
const serviceAccount = JSON.parse(process.env.CHROME_WEBSTORE_SERVICE_ACCOUNT_JSON);
const token = await getAccessToken(serviceAccount);

await uploadPackage(token, publisherId, extensionId, zipPath);
await publishPackage(token, publisherId, extensionId);

console.log(`Submitted Chrome Web Store release ${packageJson.version}.`);

async function uploadPackage(token, publisherId, extensionId, filePath) {
  const body = await readFile(filePath);
  const response = await fetch(
    `https://chromewebstore.googleapis.com/upload/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:upload`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/zip'
      },
      body
    }
  );

  const payload = await parseJson(response);
  await assertOk(response, 'Chrome package upload failed', payload);
  await waitForUpload(token, publisherId, extensionId, payload);
}

async function waitForUpload(token, publisherId, extensionId, upload) {
  let state = upload.uploadState;
  if (isUploadSucceeded(state)) return;
  if (isUploadFailed(state)) {
    throw new Error(`Chrome package upload failed: ${JSON.stringify(upload)}`);
  }

  for (let attempt = 1; attempt <= 24; attempt += 1) {
    await delay(5000);
    const response = await fetch(
      `https://chromewebstore.googleapis.com/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:fetchStatus`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    const payload = await parseJson(response);
    await assertOk(response, 'Chrome upload status check failed', payload);
    state = payload.lastAsyncUploadState;

    if (isUploadSucceeded(state)) return;
    if (isUploadFailed(state)) {
      throw new Error(`Chrome package upload failed: ${JSON.stringify(payload)}`);
    }
  }

  throw new Error('Chrome package upload did not finish in time.');
}

async function publishPackage(token, publisherId, extensionId) {
  const publishType = process.env.CHROME_WEBSTORE_PUBLISH_TYPE;
  const hasBody = Boolean(publishType);
  const response = await fetch(
    `https://chromewebstore.googleapis.com/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:publish`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {})
      },
      body: hasBody ? JSON.stringify({ publishType }) : undefined
    }
  );

  await assertOk(response, 'Chrome package publish failed');
}

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    header: {
      alg: 'RS256',
      typ: 'JWT'
    },
    payload: {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/chromewebstore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    },
    privateKey: serviceAccount.private_key
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`Chrome OAuth failed: ${JSON.stringify(payload)}`);
  }

  return payload.access_token;
}

function signJwt({ header, payload, privateKey }) {
  const unsignedToken = [
    base64Url(JSON.stringify(header)),
    base64Url(JSON.stringify(payload))
  ].join('.');
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsignedToken)
    .sign(privateKey);

  return `${unsignedToken}.${base64Url(signature)}`;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function isUploadSucceeded(state) {
  return state === 'SUCCEEDED';
}

function isUploadFailed(state) {
  return state === 'FAILED';
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function parseJson(response) {
  return response.json().catch(() => ({}));
}

async function assertOk(response, message, payload = null) {
  if (response.ok) return;
  const details = payload ? JSON.stringify(payload) : await response.text();
  throw new Error(`${message}: ${response.status} ${details}`);
}
