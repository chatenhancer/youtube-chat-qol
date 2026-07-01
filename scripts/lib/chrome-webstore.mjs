import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const apiBaseUrl = process.env.CHROME_WEBSTORE_API_BASE_URL || 'https://chromewebstore.googleapis.com';
const uploadBaseUrl = process.env.CHROME_WEBSTORE_UPLOAD_BASE_URL || 'https://chromewebstore.googleapis.com/upload';

export const requiredChromeWebStoreEnv = [
  'CHROME_WEBSTORE_EXTENSION_ID',
  'CHROME_WEBSTORE_PUBLISHER_ID',
  'CHROME_WEBSTORE_SERVICE_ACCOUNT_JSON'
];

export function getMissingChromeWebStoreEnv(env = process.env) {
  return requiredChromeWebStoreEnv.filter((name) => !env[name]);
}

export function getChromeWebStoreConfig(env = process.env) {
  return {
    extensionId: env.CHROME_WEBSTORE_EXTENSION_ID,
    publisherId: env.CHROME_WEBSTORE_PUBLISHER_ID,
    publishType: env.CHROME_WEBSTORE_PUBLISH_TYPE,
    serviceAccount: JSON.parse(env.CHROME_WEBSTORE_SERVICE_ACCOUNT_JSON)
  };
}

export async function getAccessToken(serviceAccount) {
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

async function fetchChromeWebStoreStatus(token, publisherId, extensionId) {
  const response = await chromeWebStoreFetch(
    token,
    `/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:fetchStatus`
  );
  const payload = await parseJson(response);
  await assertOk(response, 'Chrome status check failed', payload);
  return payload;
}

export async function submitChromeWebStorePackage({
  token,
  publisherId,
  extensionId,
  zipPath,
  publishType
}) {
  await uploadPackage(token, publisherId, extensionId, zipPath);
  await publishPackage(token, publisherId, extensionId, publishType);
}

async function uploadPackage(token, publisherId, extensionId, filePath) {
  const body = await readFile(filePath);
  const response = await fetch(
    `${uploadBaseUrl}/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:upload`,
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
    const payload = await fetchChromeWebStoreStatus(token, publisherId, extensionId);
    state = payload.lastAsyncUploadState;

    if (isUploadSucceeded(state)) return;
    if (isUploadFailed(state)) {
      throw new Error(`Chrome package upload failed: ${JSON.stringify(payload)}`);
    }
  }

  throw new Error('Chrome package upload did not finish in time.');
}

async function publishPackage(token, publisherId, extensionId, publishType) {
  const hasBody = Boolean(publishType);
  const response = await chromeWebStoreFetch(
    token,
    `/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:publish`,
    {
      method: 'POST',
      headers: hasBody ? { 'Content-Type': 'application/json' } : {},
      body: hasBody ? JSON.stringify({ publishType }) : undefined
    }
  );

  const payload = await parseJson(response);
  await assertOk(response, 'Chrome package publish failed', payload);
}

function chromeWebStoreFetch(token, path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });
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
