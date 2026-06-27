import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

const defaultApiOrigin = 'https://api.appstoreconnect.apple.com';

export class AppStoreConnectError extends Error {
  constructor(message, { payload = null, status = null, url = null } = {}) {
    super(message);
    this.name = 'AppStoreConnectError';
    this.payload = payload;
    this.status = status;
    this.url = url;
  }
}

export async function getAppStoreConnectConfig({ env = process.env } = {}) {
  const keyPath = env.YTCQ_APP_STORE_CONNECT_KEY_PATH
    || env.APP_STORE_CONNECT_API_KEY_PATH;
  const privateKey = keyPath ? await readFile(keyPath, 'utf8') : '';
  const keyId = env.YTCQ_APP_STORE_CONNECT_KEY_ID
    || env.APP_STORE_CONNECT_API_KEY_ID;
  const issuerId = env.YTCQ_APP_STORE_CONNECT_ISSUER_ID
    || env.APP_STORE_CONNECT_ISSUER_ID;
  const missing = [
    ['YTCQ_APP_STORE_CONNECT_KEY_ID', keyId],
    ['YTCQ_APP_STORE_CONNECT_ISSUER_ID', issuerId],
    ['YTCQ_APP_STORE_CONNECT_KEY_PATH', privateKey]
  ].filter(([, value]) => !String(value || '').trim()).map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing App Store Connect API configuration: ${missing.join(', ')}`);
  }

  return {
    apiOrigin: env.YTCQ_APP_STORE_CONNECT_API_ORIGIN || defaultApiOrigin,
    issuerId,
    keyId,
    privateKey
  };
}

export async function appStoreConnectFetch(config, pathOrUrl, options = {}) {
  const url = resolveApiUrl(config.apiOrigin, pathOrUrl);
  const { body, headers } = normalizeRequestBody(options.body, options.headers);
  const response = await fetch(url, {
    ...options,
    body,
    headers: {
      Accept: 'application/json',
      ...headers,
      Authorization: `Bearer ${createAppStoreConnectJwt(config)}`
    }
  });
  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new AppStoreConnectError(
      formatAppStoreConnectError(response, payload, url),
      {
        payload,
        status: response.status,
        url
      }
    );
  }

  return payload;
}

function createAppStoreConnectJwt({ issuerId, keyId, privateKey }) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT'
  };
  const payload = {
    aud: 'appstoreconnect-v1',
    exp: issuedAt + 20 * 60,
    iat: issuedAt,
    iss: issuerId
  };
  const unsignedToken = [
    base64Url(JSON.stringify(header)),
    base64Url(JSON.stringify(payload))
  ].join('.');
  const signature = crypto.sign(
    'sha256',
    Buffer.from(unsignedToken),
    {
      dsaEncoding: 'ieee-p1363',
      key: privateKey
    }
  );

  return `${unsignedToken}.${base64Url(signature)}`;
}

function normalizeRequestBody(body, headers = {}) {
  if (!body || typeof body === 'string' || body instanceof FormData) {
    return {
      body,
      headers
    };
  }

  return {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatAppStoreConnectError(response, payload, url) {
  const prefix = `App Store Connect request failed (${response.status}) ${url}`;
  if (!payload || typeof payload !== 'object') return prefix;
  if (!Array.isArray(payload.errors)) return `${prefix}: ${JSON.stringify(payload)}`;

  const details = payload.errors
    .map((error) => formatAppStoreConnectErrorEntry(error))
    .filter(Boolean)
    .join('; ');

  return details ? `${prefix}: ${details}` : prefix;
}

function formatAppStoreConnectErrorEntry(error) {
  const details = [
    error.code,
    error.title,
    error.detail
  ];

  if (error.source) {
    details.push(`source=${JSON.stringify(error.source)}`);
  }

  if (error.meta) {
    details.push(`meta=${JSON.stringify(error.meta)}`);
  }

  return details.filter(Boolean).join(': ');
}

function resolveApiUrl(apiOrigin, pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return new URL(pathOrUrl, apiOrigin).toString();
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
