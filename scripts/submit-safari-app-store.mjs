/*
 * Mac App Store release submission for the generated Safari Web Extension app.
 *
 * Run after scripts/distribute-safari.mjs uploads the archive. The script waits
 * for App Store Connect to finish processing that build, attaches it to the app
 * version, and submits the version for review.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import packageJson from '../package.json' with { type: 'json' };
import {
  AppStoreConnectError,
  appStoreConnectFetch,
  getAppStoreConnectConfig
} from './lib/app-store-connect.mjs';
import { loadLocalEnv, requireEnv, root } from './lib/local-env.mjs';

await loadLocalEnv();

const appName = process.env.YTCQ_SAFARI_APP_NAME || 'Chat Enhancer for YouTube';
const bundleId = requireEnv('YTCQ_SAFARI_BUNDLE_ID');
const platform = process.env.YTCQ_APP_STORE_PLATFORM || 'MAC_OS';
const releaseType = process.env.YTCQ_APP_STORE_RELEASE_TYPE || 'AFTER_APPROVAL';
const whatsNew = process.env.YTCQ_APP_STORE_WHATS_NEW
  || 'Thanks for using Chat Enhancer for YouTube. This update includes new features, along with refinements and fixes to make the extension feel smoother and more reliable.';
const usesNonExemptEncryption = readBoolean(
  'YTCQ_APP_STORE_USES_NON_EXEMPT_ENCRYPTION',
  false
);
const waitAttempts = readPositiveInteger('YTCQ_APP_STORE_BUILD_WAIT_ATTEMPTS', 20);
const waitSeconds = readPositiveInteger('YTCQ_APP_STORE_BUILD_WAIT_SECONDS', 30);
const projectPath = path.join(
  root,
  'dist',
  'safari',
  appName,
  `${appName}.xcodeproj`,
  'project.pbxproj'
);
const projectVersions = await readProjectVersions();
const marketingVersion = String(process.env.YTCQ_SAFARI_MARKETING_VERSION
  || projectVersions.marketingVersion
  || packageJson.version).trim();
const buildNumber = String(process.env.YTCQ_SAFARI_BUILD_NUMBER
  || projectVersions.buildNumber
  || '').trim();

if (!buildNumber) {
  throw new Error(
    'Could not determine the Safari app build number. Set YTCQ_SAFARI_BUILD_NUMBER '
    + 'or run after generating the Safari Xcode project.'
  );
}

console.log(`Preparing Mac App Store submission for ${marketingVersion} build ${buildNumber}.`);

const config = await getAppStoreConnectConfig();
const app = await findApp(config);
const appVersion = await getOrCreateAppStoreVersion(config, app.id);
const currentState = normalizeState(appVersion.attributes?.appStoreState);

if (isAlreadySubmittedState(currentState)) {
  console.log(
    `Mac App Store version ${marketingVersion} is already ${currentState}; skipping submission.`
  );
  process.exit(0);
}

await setReleaseType(config, appVersion);
await setWhatsNew(config, appVersion.id);
const build = await waitForProcessedBuild(config, app.id);
await setBuildEncryptionCompliance(config, build.id);
await attachBuild(config, appVersion.id, build.id);
await skipIfAlreadySubmitted(config, appVersion.id);
await submitReviewSubmission(config, app.id, appVersion.id);
await confirmSubmittedAppStoreVersion(config, appVersion.id);

console.log(`Submitted Mac App Store release ${marketingVersion} build ${buildNumber}.`);

async function findApp(config) {
  const payload = await ascGet(config, '/v1/apps', {
    'filter[bundleId]': bundleId,
    limit: 1
  });
  const app = payload.data?.[0];

  if (!app) {
    throw new Error(`No App Store Connect app found for bundle ID ${bundleId}.`);
  }

  console.log(`Found App Store Connect app ${app.attributes?.name || app.id}.`);
  return app;
}

async function getOrCreateAppStoreVersion(config, appId) {
  const existingVersion = await findAppStoreVersion(config, appId);
  if (existingVersion) {
    console.log(`Found Mac App Store version ${marketingVersion}.`);
    return existingVersion;
  }

  const payload = await appStoreConnectFetch(config, '/v1/appStoreVersions', {
    method: 'POST',
    body: jsonApiResource({
      type: 'appStoreVersions',
      attributes: {
        platform,
        versionString: marketingVersion
      },
      relationships: {
        app: relationship('apps', appId)
      }
    })
  });

  console.log(`Created Mac App Store version ${marketingVersion}.`);
  return payload.data;
}

async function findAppStoreVersion(config, appId) {
  const payload = await ascGet(config, `/v1/apps/${appId}/appStoreVersions`, {
    'filter[platform]': platform,
    'filter[versionString]': marketingVersion,
    limit: 10
  });

  return payload.data?.[0] || null;
}

async function setReleaseType(config, appVersion) {
  if (!releaseType) return;

  await appStoreConnectFetch(config, `/v1/appStoreVersions/${appVersion.id}`, {
    method: 'PATCH',
    body: jsonApiResource({
      id: appVersion.id,
      type: 'appStoreVersions',
      attributes: {
        releaseType
      }
    })
  });

  console.log(`Set Mac App Store release type to ${releaseType}.`);
}

async function setWhatsNew(config, appStoreVersionId) {
  const localizations = await listAppStoreVersionLocalizations(config, appStoreVersionId);

  if (localizations.length === 0) {
    await createAppStoreVersionLocalization(config, appStoreVersionId);
    console.log("Set What's New for the default Mac App Store localization.");
    return;
  }

  for (const localization of localizations) {
    await appStoreConnectFetch(config, `/v1/appStoreVersionLocalizations/${localization.id}`, {
      method: 'PATCH',
      body: jsonApiResource({
        id: localization.id,
        type: 'appStoreVersionLocalizations',
        attributes: {
          whatsNew
        }
      })
    });
  }

  console.log(`Set What's New for ${localizations.length} Mac App Store localization(s).`);
}

async function listAppStoreVersionLocalizations(config, appStoreVersionId) {
  const payload = await ascGet(
    config,
    `/v1/appStoreVersions/${appStoreVersionId}/appStoreVersionLocalizations`,
    {
      limit: 200
    }
  );

  return payload.data || [];
}

async function createAppStoreVersionLocalization(config, appStoreVersionId) {
  return appStoreConnectFetch(config, '/v1/appStoreVersionLocalizations', {
    method: 'POST',
    body: jsonApiResource({
      type: 'appStoreVersionLocalizations',
      attributes: {
        locale: 'en-US',
        whatsNew
      },
      relationships: {
        appStoreVersion: relationship('appStoreVersions', appStoreVersionId)
      }
    })
  });
}

async function waitForProcessedBuild(config, appId) {
  for (let attempt = 1; attempt <= waitAttempts; attempt += 1) {
    const build = await findUploadedBuild(config, appId);

    if (build) {
      const processingState = normalizeState(build.attributes?.processingState);

      if (!processingState || isProcessedBuildState(processingState)) {
        console.log(`Found processed Mac App Store build ${buildNumber}.`);
        return build;
      }

      if (isFailedBuildState(processingState)) {
        throw new Error(
          `Mac App Store build ${buildNumber} processing failed with state ${processingState}.`
        );
      }

      console.log(
        `Waiting for Mac App Store build ${buildNumber} processing `
        + `(${processingState}, attempt ${attempt}/${waitAttempts}).`
      );
    } else {
      console.log(
        `Waiting for Mac App Store build ${buildNumber} to appear `
        + `(attempt ${attempt}/${waitAttempts}).`
      );

      if (shouldLogVisibleBuilds(attempt)) {
        await logVisibleBuilds(config, appId);
      }
    }

    if (attempt < waitAttempts) await delay(waitSeconds * 1000);
  }

  throw new Error(
    `Mac App Store build ${buildNumber} did not finish processing within `
    + `${waitAttempts * waitSeconds} seconds.`
  );
}

async function findUploadedBuild(config, appId) {
  const payload = await ascGet(config, '/v1/builds', {
    'filter[app]': appId,
    'filter[version]': buildNumber,
    include: 'preReleaseVersion',
    limit: 20,
    sort: '-uploadedDate'
  });
  const builds = payload.data || [];
  const matchingBuild = builds.find((build) =>
    isMatchingBuild(payload, build)
  );

  if (matchingBuild) return matchingBuild;

  const recentPayload = await listVisibleBuilds(config, appId, 20);
  return (recentPayload.data || []).find((build) =>
    isMatchingBuild(recentPayload, build)
  ) || null;
}

async function listVisibleBuilds(config, appId, limit) {
  return ascGet(config, '/v1/builds', {
    'filter[app]': appId,
    include: 'preReleaseVersion',
    limit,
    sort: '-uploadedDate'
  });
}

async function logVisibleBuilds(config, appId) {
  const payload = await listVisibleBuilds(config, appId, 5);
  const builds = payload.data || [];

  if (builds.length === 0) {
    console.log('No recent Mac App Store builds are visible for this app yet.');
    return;
  }

  const summary = builds.map((build) => {
    const version = build.attributes?.version || 'unknown-build';
    const state = build.attributes?.processingState || 'unknown-state';
    const uploadedDate = build.attributes?.uploadedDate || 'unknown-upload-date';
    const preReleaseVersion = getBuildMarketingVersion(payload, build) || 'unknown-version';

    return `${preReleaseVersion} (${version}, ${state}, ${uploadedDate})`;
  }).join('; ');

  console.log(`Recent visible Mac App Store builds: ${summary}.`);
}

function shouldLogVisibleBuilds(attempt) {
  return attempt === 1 || attempt % 5 === 0 || attempt === waitAttempts;
}

function isMatchingBuild(payload, build) {
  const version = String(build.attributes?.version || '').trim();
  const preReleaseVersion = getBuildMarketingVersion(payload, build);

  return version === buildNumber
    && (!preReleaseVersion || preReleaseVersion === marketingVersion);
}

async function attachBuild(config, appStoreVersionId, buildId) {
  await appStoreConnectFetch(
    config,
    `/v1/appStoreVersions/${appStoreVersionId}/relationships/build`,
    {
      method: 'PATCH',
      body: {
        data: {
          id: buildId,
          type: 'builds'
        }
      }
    }
  );

  console.log(`Attached build ${buildNumber} to Mac App Store version ${marketingVersion}.`);
}

async function setBuildEncryptionCompliance(config, buildId) {
  await appStoreConnectFetch(config, `/v1/builds/${buildId}`, {
    method: 'PATCH',
    body: jsonApiResource({
      id: buildId,
      type: 'builds',
      attributes: {
        usesNonExemptEncryption
      }
    })
  });

  console.log(
    `Set Mac App Store build usesNonExemptEncryption to ${usesNonExemptEncryption}.`
  );
}

async function skipIfAlreadySubmitted(config, appStoreVersionId) {
  const state = await readAppStoreVersionState(config, appStoreVersionId);
  if (!isAlreadySubmittedState(state)) return;

  console.log(
    `Mac App Store version ${marketingVersion} is already ${state}; skipping submission.`
  );
  process.exit(0);
}

async function submitReviewSubmission(config, appId, appStoreVersionId) {
  let reviewSubmission = await getOrCreateReviewSubmission(config, appId, appStoreVersionId);
  reviewSubmission = await ensureReviewSubmissionItem(
    config,
    appId,
    reviewSubmission,
    appStoreVersionId
  );
  await submitReviewSubmissionForReview(config, reviewSubmission.id);
}

async function getOrCreateReviewSubmission(config, appId, appStoreVersionId) {
  const existingForVersion = await findReviewSubmissionForVersion(
    config,
    appId,
    appStoreVersionId
  );
  if (existingForVersion) {
    console.log(
      `Using existing Mac App Store review submission ${existingForVersion.id} `
      + `for version ${marketingVersion}.`
    );
    return existingForVersion;
  }

  const readySubmission = await findReadyReviewSubmission(config, appId);
  if (readySubmission) {
    console.log(`Using existing Mac App Store review submission ${readySubmission.id}.`);
    return readySubmission;
  }

  try {
    const payload = await appStoreConnectFetch(config, '/v1/reviewSubmissions', {
      method: 'POST',
      body: jsonApiResource({
        type: 'reviewSubmissions',
        attributes: {
          platform
        },
        relationships: {
          app: relationship('apps', appId)
        }
      })
    });

    console.log(`Created Mac App Store review submission ${payload.data.id}.`);
    return payload.data;
  } catch (error) {
    if (!(error instanceof AppStoreConnectError) || error.status !== 409) {
      throw error;
    }

    const reviewSubmission = await findReadyReviewSubmission(config, appId);
    if (!reviewSubmission) throw error;

    console.log(`Using existing Mac App Store review submission ${reviewSubmission.id}.`);
    return reviewSubmission;
  }
}

async function findReadyReviewSubmission(config, appId) {
  const submissions = await listReadyReviewSubmissions(config, appId);
  return submissions[0] || null;
}

async function findReviewSubmissionForVersion(config, appId, appStoreVersionId) {
  const submissions = await listReadyReviewSubmissions(config, appId);
  for (const submission of submissions) {
    if (await reviewSubmissionHasVersion(config, submission, appStoreVersionId)) {
      return submission;
    }
  }

  return null;
}

async function listReadyReviewSubmissions(config, appId) {
  const payload = await ascGet(config, '/v1/reviewSubmissions', {
    'filter[app]': appId,
    'filter[platform]': platform,
    'filter[state]': 'READY_FOR_REVIEW',
    include: 'appStoreVersionForReview',
    limit: 20
  });

  return payload.data || [];
}

async function ensureReviewSubmissionItem(config, appId, reviewSubmission, appStoreVersionId) {
  if (await reviewSubmissionHasVersion(config, reviewSubmission, appStoreVersionId)) {
    console.log(`Review submission already includes Mac App Store version ${marketingVersion}.`);
    return reviewSubmission;
  }

  try {
    await appStoreConnectFetch(config, '/v1/reviewSubmissionItems', {
      method: 'POST',
      body: jsonApiResource({
        type: 'reviewSubmissionItems',
        relationships: {
          appStoreVersion: relationship('appStoreVersions', appStoreVersionId),
          reviewSubmission: relationship('reviewSubmissions', reviewSubmission.id)
        }
      })
    });

    console.log(`Added Mac App Store version ${marketingVersion} to the review submission.`);
  } catch (error) {
    if (!(error instanceof AppStoreConnectError) || error.status !== 409) {
      throw error;
    }

    const existingForVersion = await findReviewSubmissionForVersion(
      config,
      appId,
      appStoreVersionId
    );
    if (!existingForVersion) throw error;

    console.log(
      `Using existing Mac App Store review submission ${existingForVersion.id} `
      + `for version ${marketingVersion}.`
    );
    return existingForVersion;
  }

  await confirmReviewSubmissionHasVersion(config, reviewSubmission, appStoreVersionId);
  return reviewSubmission;
}

async function confirmReviewSubmissionHasVersion(config, reviewSubmission, appStoreVersionId) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    if (await reviewSubmissionHasVersion(config, reviewSubmission, appStoreVersionId)) return;
    if (attempt < 6) await delay(5 * 1000);
  }

  throw new Error(
    `Review submission ${reviewSubmission.id} still has no item for Mac App Store `
    + `version ${marketingVersion} after adding it.`
  );
}

async function reviewSubmissionHasVersion(config, reviewSubmission, appStoreVersionId) {
  const appStoreVersionForReview = reviewSubmission
    .relationships?.appStoreVersionForReview?.data?.id;
  if (appStoreVersionForReview === appStoreVersionId) return true;

  return Boolean(
    await findReviewSubmissionItem(config, reviewSubmission.id, appStoreVersionId)
  );
}

async function findReviewSubmissionItem(config, reviewSubmissionId, appStoreVersionId) {
  const payload = await ascGet(config, `/v1/reviewSubmissions/${reviewSubmissionId}/items`, {
    limit: 200
  });

  return (payload.data || []).find((item) =>
    item.relationships?.appStoreVersion?.data?.id === appStoreVersionId
  ) || null;
}

async function submitReviewSubmissionForReview(config, reviewSubmissionId) {
  await appStoreConnectFetch(config, `/v1/reviewSubmissions/${reviewSubmissionId}`, {
    method: 'PATCH',
    body: jsonApiResource({
      id: reviewSubmissionId,
      type: 'reviewSubmissions',
      attributes: {
        submitted: true
      }
    })
  });

  console.log(`Sent Mac App Store review submission ${reviewSubmissionId} for review.`);
}

async function confirmSubmittedAppStoreVersion(config, appStoreVersionId) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const state = await readAppStoreVersionState(config, appStoreVersionId);
    if (isAlreadySubmittedState(state)) {
      console.log(`Mac App Store version ${marketingVersion} is now ${state}.`);
      return;
    }

    if (attempt < 6) await delay(10 * 1000);
  }

  const state = await readAppStoreVersionState(config, appStoreVersionId);
  throw new Error(
    `Mac App Store review submission was sent, but version ${marketingVersion} `
    + `is still ${state || 'in an unknown state'}.`
  );
}

async function readAppStoreVersionState(config, appStoreVersionId) {
  try {
    const appVersion = await getAppStoreVersion(config, appStoreVersionId);
    return normalizeState(appVersion.attributes?.appStoreState);
  } catch (error) {
    if (error instanceof AppStoreConnectError) return '';
    throw error;
  }
}

async function getAppStoreVersion(config, appStoreVersionId) {
  const payload = await appStoreConnectFetch(config, `/v1/appStoreVersions/${appStoreVersionId}`);
  return payload.data;
}

async function ascGet(config, resourcePath, query = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString() ? `?${search}` : '';

  return appStoreConnectFetch(config, `${resourcePath}${suffix}`);
}

async function readProjectVersions() {
  let project;
  try {
    project = await readFile(projectPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return {
      buildNumber: '',
      marketingVersion: ''
    };
  }

  return {
    buildNumber: parsePbxSetting(project, 'CURRENT_PROJECT_VERSION'),
    marketingVersion: parsePbxSetting(project, 'MARKETING_VERSION')
  };
}

function parsePbxSetting(project, key) {
  const match = new RegExp(`${key} = ([^;]+);`).exec(project);
  if (!match) return null;
  return unquotePbxValue(match[1]);
}

function unquotePbxValue(value) {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) return trimmed;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed.slice(1, -1);
  }
}

function getBuildMarketingVersion(payload, build) {
  const preReleaseVersion = build.relationships?.preReleaseVersion?.data;
  if (!preReleaseVersion) return null;

  return payload.included?.find((item) =>
    item.type === preReleaseVersion.type && item.id === preReleaseVersion.id
  )?.attributes?.version || null;
}

function jsonApiResource(resource) {
  return {
    data: resource
  };
}

function relationship(type, id) {
  return {
    data: {
      id,
      type
    }
  };
}

function isProcessedBuildState(state) {
  return ['VALID', 'VALIDATED'].includes(state);
}

function isFailedBuildState(state) {
  return ['FAILED', 'INVALID'].includes(state);
}

function isAlreadySubmittedState(state) {
  return [
    'APPROVED',
    'IN_REVIEW',
    'PENDING_APPLE_RELEASE',
    'PENDING_CONTRACT',
    'PENDING_DEVELOPER_RELEASE',
    'PREORDER_READY_FOR_SALE',
    'PROCESSING_FOR_APP_STORE',
    'READY_FOR_DISTRIBUTION',
    'READY_FOR_SALE',
    'WAITING_FOR_EXPORT_COMPLIANCE',
    'WAITING_FOR_REVIEW'
  ].includes(state);
}

function normalizeState(state) {
  return String(state || '').trim().toUpperCase();
}

function readPositiveInteger(name, defaultValue) {
  const rawValue = process.env[name];
  if (!rawValue) return defaultValue;

  const value = Number.parseInt(rawValue, 10);
  if (Number.isInteger(value) && value > 0) return value;

  throw new Error(`${name} must be a positive integer.`);
}

function readBoolean(name, defaultValue) {
  const rawValue = process.env[name];
  if (!rawValue) return defaultValue;

  const value = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes'].includes(value)) return true;
  if (['0', 'false', 'no'].includes(value)) return false;

  throw new Error(`${name} must be true or false.`);
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
