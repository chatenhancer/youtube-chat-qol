import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const apiBaseUrl = process.env.CHROME_WEBSTORE_API_BASE_URL || 'https://chromewebstore.googleapis.com';
const uploadBaseUrl = process.env.CHROME_WEBSTORE_UPLOAD_BASE_URL || 'https://chromewebstore.googleapis.com/upload';

type ItemRevisionStatus = {
  state: string;
  distributionChannels?: { crxVersion: string }[];
};

type ChromeWebStoreStatus = {
  publishedItemRevisionStatus?: ItemRevisionStatus;
  submittedItemRevisionStatus?: ItemRevisionStatus;
  lastAsyncUploadState?: string;
};

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
    replacePending: env.CHROME_WEBSTORE_REPLACE_PENDING === 'true',
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

async function fetchChromeWebStoreStatus(token, publisherId, extensionId): Promise<ChromeWebStoreStatus> {
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
  publishType,
  releaseVersion = '',
  replacePending = false
}) {
  // Read the archive before withdrawing a review, then upload those same bytes.
  const body = await readFile(zipPath);
  if (replacePending && !await prepareRelease(token, publisherId, extensionId, releaseVersion)) return false;

  await uploadPackage(token, publisherId, extensionId, body);
  await publishPackage(token, publisherId, extensionId, publishType);
  return true;
}

async function prepareRelease(token, publisherId, extensionId, releaseVersion: string) {
  if (!releaseVersion) throw new Error('A release version is required to replace a pending Chrome Web Store review.');

  const status = await fetchChromeWebStoreStatus(token, publisherId, extensionId);
  let alreadySubmitted = false;
  for (const revision of [status.publishedItemRevisionStatus, status.submittedItemRevisionStatus]) {
    if (!revision) continue;
    if (!revision.distributionChannels?.length) {
      throw new Error(`Cannot determine the Chrome Web Store version in ${revision.state}; refusing to replace it.`);
    }
    for (const { crxVersion } of revision.distributionChannels) {
      const comparison = compareVersions(crxVersion, releaseVersion);
      if (comparison > 0) {
        throw new Error(`Chrome Web Store already has newer version ${crxVersion}; refusing to replace it with ${releaseVersion}.`);
      }
      if (comparison === 0 && ['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'].includes(revision.state)) {
        alreadySubmitted = true;
      }
    }
  }
  if (alreadySubmitted) {
    console.log(`Chrome Web Store release ${releaseVersion} is already submitted or published; leaving it unchanged.`);
    return false;
  }

  if (status.submittedItemRevisionStatus?.state === 'PENDING_REVIEW') {
    const response = await chromeWebStoreFetch(
      token,
      `/v2/publishers/${encodeURIComponent(publisherId)}/items/${encodeURIComponent(extensionId)}:cancelSubmission`,
      { method: 'POST' }
    );
    await assertOk(response, 'Chrome review cancellation failed', await parseJson(response));
    console.log(`Cancelled the older Chrome Web Store review to submit ${releaseVersion}.`);
  }
  return true;
}

function compareVersions(left: string, right: string) {
  if (![left, right].every((version) => /^\d+(?:\.\d+){0,3}$/.test(version))) {
    throw new Error(`Cannot compare Chrome Web Store versions ${left} and ${right}.`);
  }
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 4; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

async function uploadPackage(token, publisherId, extensionId, body: Buffer<ArrayBuffer>) {
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

function chromeWebStoreFetch(token, path, options: any = {}) {
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
