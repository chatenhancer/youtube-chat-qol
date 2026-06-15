import { writeFile } from 'node:fs/promises';

export const deferredChromeIssueTitle = 'Deferred Chrome Web Store release';
export const deferredChromeIssueLabel = 'release-state';

export function getDeferredChromeIssueTitle(release) {
  return `${deferredChromeIssueTitle}: ${release.tag || `v${release.version}`}`;
}

export function createDeferredChromeRelease({ env = process.env, statusDescription, version }) {
  const tag = env.GITHUB_REF_NAME || `v${version}`;
  const repository = env.GITHUB_REPOSITORY || null;
  const runId = env.GITHUB_RUN_ID || null;

  return {
    tag,
    version,
    sha: env.GITHUB_SHA || null,
    chrome_asset_name: `youtube-chat-qol-${version}-chrome.zip`,
    release_url: repository ? `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}` : null,
    source_run_id: runId,
    source_run_url: repository && runId ? `https://github.com/${repository}/actions/runs/${runId}` : null,
    queued_at: new Date().toISOString(),
    reason: 'cws_pending_review',
    blocked_status: statusDescription
  };
}

export function getGitHubConfig(env = process.env) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  const apiBaseUrl = env.GITHUB_API_URL || 'https://api.github.com';

  if (!token) throw new Error('Missing GITHUB_TOKEN or GH_TOKEN.');
  if (!repository) throw new Error('Missing GITHUB_REPOSITORY.');

  return { apiBaseUrl, repository, token };
}

export async function queueDeferredChromeRelease({ config, release }) {
  const issue = await findDeferredChromeIssue(config);

  if (!issue) {
    const createdIssue = await createDeferredChromeIssue(config, release);
    console.log(`Created deferred Chrome Web Store issue #${createdIssue.number} for ${release.tag}.`);
    return { action: 'created', issue: createdIssue };
  }

  const currentRelease = parseDeferredChromeRelease(issue.body);
  if (currentRelease && isNewerVersion(currentRelease.version, release.version)) {
    console.log(
      `Keeping deferred Chrome Web Store issue #${issue.number} at ${currentRelease.tag}; ${release.tag} is older.`
    );
    return { action: 'kept', issue };
  }

  const updatedIssue = await updateDeferredChromeIssue(config, issue.number, release);
  console.log(`Updated deferred Chrome Web Store issue #${issue.number} to ${release.tag}.`);
  return { action: 'updated', issue: updatedIssue };
}

export async function findDeferredChromeIssue(config) {
  const issues = await githubJson(config, `${repoPath(config.repository)}/issues?state=open&per_page=100`);
  return issues.find((issue) => !issue.pull_request && isDeferredChromeIssueTitle(issue.title)) || null;
}

export function parseDeferredChromeRelease(body) {
  const match = String(body || '').match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export async function closeDeferredChromeIssue({ config, issueNumber, release }) {
  await githubJson(config, `${repoPath(config.repository)}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({
      body: `Submitted ${release.tag} to Chrome Web Store after the previous review cleared.`
    })
  });
  return githubJson(config, `${repoPath(config.repository)}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({
      state: 'closed'
    })
  });
}

export async function findGitHubReleaseAsset(config, tag, assetName) {
  const release = await githubJson(config, `${repoPath(config.repository)}/releases/tags/${encodeURIComponent(tag)}`);
  return release.assets?.find((asset) => asset.name === assetName) || null;
}

export async function downloadGitHubReleaseAsset(config, asset, filePath) {
  const response = await fetch(asset.url, {
    headers: {
      Accept: 'application/octet-stream',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`GitHub release asset download failed: ${response.status} ${details}`);
  }

  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
}

export function buildDeferredChromeIssueBody(release) {
  return [
    'This issue is managed by release automation.',
    '',
    'Newer Chrome release tags replace older deferred submissions.',
    '',
    '```json',
    JSON.stringify(release, null, 2),
    '```'
  ].join('\n');
}

export function compareSemverVersions(left, right) {
  const leftParts = parseSemverVersion(left);
  const rightParts = parseSemverVersion(right);
  if (!leftParts || !rightParts) return 0;

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }

  return 0;
}

async function createDeferredChromeIssue(config, release) {
  const labels = await getDeferredChromeIssueLabels(config);
  return githubJson(config, `${repoPath(config.repository)}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: getDeferredChromeIssueTitle(release),
      body: buildDeferredChromeIssueBody(release),
      labels
    })
  });
}

async function updateDeferredChromeIssue(config, issueNumber, release) {
  return githubJson(config, `${repoPath(config.repository)}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: getDeferredChromeIssueTitle(release),
      body: buildDeferredChromeIssueBody(release)
    })
  });
}

async function getDeferredChromeIssueLabels(config) {
  try {
    await ensureDeferredChromeIssueLabel(config);
    return [deferredChromeIssueLabel];
  } catch (error) {
    console.warn(`Could not ensure ${deferredChromeIssueLabel} label: ${error.message}`);
    return [];
  }
}

async function ensureDeferredChromeIssueLabel(config) {
  const labelPath = `${repoPath(config.repository)}/labels/${encodeURIComponent(deferredChromeIssueLabel)}`;
  const existing = await githubResponse(config, labelPath);

  if (existing.response.ok) return;
  if (existing.response.status !== 404) {
    throw new Error(`GitHub label lookup failed: ${existing.response.status} ${JSON.stringify(existing.payload)}`);
  }

  const created = await githubResponse(config, `${repoPath(config.repository)}/labels`, {
    method: 'POST',
    body: JSON.stringify({
      name: deferredChromeIssueLabel,
      color: '5319e7',
      description: 'State issue used by release automation.'
    })
  });

  if (!created.response.ok && created.response.status !== 422) {
    throw new Error(`GitHub label creation failed: ${created.response.status} ${JSON.stringify(created.payload)}`);
  }
}

function isNewerVersion(left, right) {
  return compareSemverVersions(left, right) > 0;
}

function isDeferredChromeIssueTitle(title) {
  return title === deferredChromeIssueTitle || title.startsWith(`${deferredChromeIssueTitle}: `);
}

function parseSemverVersion(version) {
  const match = String(version || '').match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

function repoPath(repository) {
  const [owner, repo] = repository.split('/');
  if (!owner || !repo) throw new Error(`Invalid GITHUB_REPOSITORY "${repository}".`);
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function githubJson(config, path, options = {}) {
  const { response, payload } = await githubResponse(config, path, options);
  if (response.ok) return payload;
  throw new Error(`GitHub request failed: ${response.status} ${JSON.stringify(payload)}`);
}

async function githubResponse(config, path, options = {}) {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}
