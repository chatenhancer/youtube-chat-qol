import { setTimeout as delay } from 'node:timers/promises';
import { appStoreConnectFetch } from './app-store-connect.ts';

type AppStoreVersion = {
  id: string;
  attributes: { platform: string; versionString: string; appStoreState: string };
};

type ReviewSubmission = {
  id: string;
  attributes: { state: string };
  relationships?: { appStoreVersionForReview?: { data?: { id: string } } };
};

type ReviewItem = {
  id: string;
  relationships?: { appStoreVersion?: { data?: { id: string } } };
};

const editableStates = [
  'PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED',
  'METADATA_REJECTED', 'INVALID_BINARY'
];
const cancelableStates = [
  'WAITING_FOR_REVIEW', 'IN_REVIEW', 'WAITING_FOR_EXPORT_COMPLIANCE',
  'PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE'
];
const releasedStates = [
  'READY_FOR_SALE', 'READY_FOR_DISTRIBUTION', 'REPLACED_WITH_NEW_VERSION',
  'DEVELOPER_REMOVED_FROM_SALE', 'REMOVED_FROM_SALE'
];

// Call only after the replacement build has finished processing. Reusing the
// version record preserves its screenshots, localizations, and review details.
export async function reusePendingAppStoreVersion(config, {
  appId,
  platform,
  marketingVersion
}: { appId: string; platform: string; marketingVersion: string }) {
  const versions = await listResources<AppStoreVersion>(
    config, `/v1/apps/${appId}/appStoreVersions`, { 'filter[platform]': platform }
  );
  const platformVersions = versions.filter((version) => version.attributes.platform === platform);
  for (const version of platformVersions) {
    if (compareVersions(version.attributes.versionString, marketingVersion) > 0) {
      throw new Error(
        `Mac App Store already has newer version ${version.attributes.versionString}; `
        + `refusing to replace it with ${marketingVersion}.`
      );
    }
  }

  const matchingVersion = platformVersions.find((version) =>
    compareVersions(version.attributes.versionString, marketingVersion) === 0
  );
  if (matchingVersion) return matchingVersion;

  const pendingVersions = platformVersions.filter((version) =>
    !releasedStates.includes(version.attributes.appStoreState)
  );
  if (pendingVersions.length === 0) return null;
  if (pendingVersions.length !== 1) {
    throw new Error('More than one pending Mac App Store version exists; refusing to choose one.');
  }

  const version = pendingVersions[0];
  const state = version.attributes.appStoreState;
  if (![...editableStates, ...cancelableStates, 'READY_FOR_REVIEW'].includes(state)) {
    throw new Error(`Mac App Store version ${version.attributes.versionString} cannot be replaced in ${state}.`);
  }

  console.log(`Replacing pending Mac App Store version ${version.attributes.versionString} with ${marketingVersion}.`);
  const { submission, items } = await findReviewSubmission(config, appId, platform, version.id) || {};
  if (submission) {
    if (items.length !== 1 || items[0].relationships?.appStoreVersion?.data?.id !== version.id) {
      throw new Error(`Review submission ${submission.id} contains other items; refusing to cancel them.`);
    }

    if (submission.attributes.state === 'READY_FOR_REVIEW') {
      await appStoreConnectFetch(config, `/v1/reviewSubmissionItems/${items[0].id}`, { method: 'DELETE' });
    } else if (!['CANCELING', 'COMPLETING'].includes(submission.attributes.state)) {
      await appStoreConnectFetch(config, `/v1/reviewSubmissions/${submission.id}`, {
        method: 'PATCH',
        body: { data: { type: 'reviewSubmissions', id: submission.id, attributes: { canceled: true } } }
      });
      console.log(`Requested cancellation of Mac App Store review submission ${submission.id}.`);
    }
  } else if (cancelableStates.includes(state)) {
    // Approved versions can await release after their review submission is COMPLETE.
    // Apple's deprecated version-submission endpoint also removes these from the release process.
    const payload = await appStoreConnectFetch(config, `/v1/appStoreVersions/${version.id}/appStoreVersionSubmission`);
    if (!payload.data?.id) throw new Error(`No cancellable submission found for Mac App Store version ${version.id}.`);
    await appStoreConnectFetch(config, `/v1/appStoreVersionSubmissions/${payload.data.id}`, { method: 'DELETE' });
  }

  await waitForEditableVersion(config, version.id,
    submission?.attributes.state === 'READY_FOR_REVIEW' ? undefined : submission?.id);

  // Detach, rather than delete or expire, the uploaded build before changing the
  // marketing version: Apple requires the attached build's version to match it.
  await appStoreConnectFetch(config, `/v1/appStoreVersions/${version.id}/relationships/build`, {
    method: 'PATCH',
    body: { data: null }
  });
  const payload = await appStoreConnectFetch(config, `/v1/appStoreVersions/${version.id}`, {
    method: 'PATCH',
    body: { data: { type: 'appStoreVersions', id: version.id, attributes: { versionString: marketingVersion } } }
  });
  console.log(`Updated Mac App Store version ${version.attributes.versionString} to ${marketingVersion}.`);
  return payload.data as AppStoreVersion;
}

async function findReviewSubmission(config, appId: string, platform: string, versionId: string) {
  const submissions = await listResources<ReviewSubmission>(config, '/v1/reviewSubmissions', {
    'filter[app]': appId,
    'filter[platform]': platform,
    'filter[state]': 'READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES,CANCELING,COMPLETING',
    include: 'appStoreVersionForReview'
  });
  for (const submission of submissions) {
    const linkedVersionId = submission.relationships?.appStoreVersionForReview?.data?.id;
    if (linkedVersionId && linkedVersionId !== versionId) continue;
    const items = await listReviewItems(config, submission.id);
    if (linkedVersionId === versionId
      || items.some((item) => item.relationships?.appStoreVersion?.data?.id === versionId)) {
      return { submission, items };
    }
  }
  return null;
}

async function listReviewItems(config, submissionId: string) {
  return listResources<ReviewItem>(config, `/v1/reviewSubmissions/${submissionId}/items`, {
    'fields[reviewSubmissionItems]': 'appStoreVersion',
    include: 'appStoreVersion'
  });
}

async function waitForEditableVersion(config, versionId: string, submissionId?: string) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const { data: version } = await appStoreConnectFetch(config, `/v1/appStoreVersions/${versionId}`);
    const submission = submissionId
      ? await appStoreConnectFetch(config, `/v1/reviewSubmissions/${submissionId}`)
      : null;
    if (editableStates.includes(version.attributes.appStoreState)
      && (!submission || submission.data.attributes.state === 'COMPLETE')) return;

    console.log(`Waiting for Mac App Store cancellation to finish (attempt ${attempt}/20).`);
    if (attempt < 20) await delay(15_000);
  }
  throw new Error(`Mac App Store version ${versionId} is still not editable after cancellation; retry publishing once Apple finishes processing it.`);
}

async function listResources<T>(config, resourcePath: string, query: Record<string, string>) {
  let next = `${resourcePath}?${new URLSearchParams({ ...query, limit: '200' })}`;
  const resources: T[] = [];
  while (next) {
    const payload = await appStoreConnectFetch(config, next);
    resources.push(...(payload.data || []));
    next = payload.links?.next;
  }
  return resources;
}

function compareVersions(left: string, right: string) {
  if (![left, right].every((version) => /^\d+(?:\.\d+){0,2}$/.test(version))) {
    throw new Error(`Cannot compare Mac App Store versions ${left} and ${right}.`);
  }
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return difference;
  }
  return 0;
}
