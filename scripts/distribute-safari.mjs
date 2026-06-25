/*
 * Archives and optionally uploads the generated Safari Web Extension wrapper.
 *
 * Run after scripts/package-safari.mjs has generated dist/safari.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv, requireEnv } from './lib/local-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));

if (args.has('--help')) {
  printUsage();
  process.exit(0);
}

for (const arg of args) {
  if (!['--archive', '--upload'].includes(arg)) {
    throw new Error(`Unknown argument: ${arg}`);
  }
}

await loadLocalEnv();

const appName = process.env.YTCQ_SAFARI_APP_NAME || 'Chat Enhancer for YouTube';
const developmentTeam = requireEnv('YTCQ_SAFARI_DEVELOPMENT_TEAM');
const configuration = process.env.YTCQ_SAFARI_CONFIGURATION || 'Release';
const destination = process.env.YTCQ_SAFARI_DESTINATION || 'generic/platform=macOS';
const projectLocation = path.join(root, 'dist', 'safari');
const projectPath = path.join(projectLocation, appName, `${appName}.xcodeproj`);
const pbxProjectPath = path.join(projectPath, 'project.pbxproj');
const scheme = process.env.YTCQ_SAFARI_SCHEME || `${appName} (macOS)`;
const archiveRoot = path.join(root, 'dist', 'safari-archives');
const exportRoot = path.join(root, 'dist', 'safari-upload');

const shouldUpload = args.has('--upload');
const versions = await readProjectVersions();
const archivePath = process.env.YTCQ_SAFARI_ARCHIVE_PATH
  || path.join(
    archiveRoot,
    `${sanitizePathPart(appName)}-${versions.marketingVersion}-${versions.buildNumber}.xcarchive`
  );

await archiveApp(archivePath);

if (shouldUpload) {
  await uploadArchive(archivePath, versions);
}

async function archiveApp(nextArchivePath) {
  await mkdir(path.dirname(nextArchivePath), { recursive: true });

  run('xcodebuild', [
    '-project',
    projectPath,
    '-scheme',
    scheme,
    '-configuration',
    configuration,
    '-destination',
    destination,
    `DEVELOPMENT_TEAM=${developmentTeam}`,
    '-archivePath',
    nextArchivePath,
    'archive',
    ...getProvisioningArgs(),
    ...getAuthenticationArgs()
  ]);

  console.log(`Safari archive: ${nextArchivePath}`);
}

async function uploadArchive(nextArchivePath, archiveVersions) {
  const exportPath = process.env.YTCQ_SAFARI_EXPORT_PATH
    || path.join(
      exportRoot,
      `${sanitizePathPart(appName)}-${archiveVersions.marketingVersion}-${archiveVersions.buildNumber}`
    );
  const exportOptionsPath = path.join(exportPath, 'ExportOptions.plist');

  await mkdir(exportPath, { recursive: true });
  await writeFile(exportOptionsPath, getExportOptionsPlist(), 'utf8');

  run('xcodebuild', [
    '-exportArchive',
    '-archivePath',
    nextArchivePath,
    '-exportPath',
    exportPath,
    '-exportOptionsPlist',
    exportOptionsPath,
    ...getProvisioningArgs(),
    ...getAuthenticationArgs()
  ]);
}

async function readProjectVersions() {
  const project = await readFile(pbxProjectPath, 'utf8');
  return {
    buildNumber: parsePbxSetting(project, 'CURRENT_PROJECT_VERSION') || '1',
    marketingVersion: parsePbxSetting(project, 'MARKETING_VERSION') || '1.0'
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

function getExportOptionsPlist() {
  const values = {
    destination: 'upload',
    manageAppVersionAndBuildNumber: false,
    method: 'app-store-connect',
    signingStyle: 'automatic',
    stripSwiftSymbols: true,
    teamID: developmentTeam,
    uploadSymbols: true
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${Object.entries(values).map(([key, value]) => `\t<key>${escapeXml(key)}</key>\n${plistValue(value)}`).join('\n')}
</dict>
</plist>
`;
}

function plistValue(value) {
  if (typeof value === 'boolean') return `\t<${value ? 'true' : 'false'}/>`;
  return `\t<string>${escapeXml(value)}</string>`;
}

function getProvisioningArgs() {
  return process.env.YTCQ_SAFARI_ALLOW_PROVISIONING_UPDATES === '0'
    ? []
    : ['-allowProvisioningUpdates'];
}

function getAuthenticationArgs() {
  const keyPath = process.env.YTCQ_APP_STORE_CONNECT_KEY_PATH
    || process.env.APP_STORE_CONNECT_API_KEY_PATH;
  const keyId = process.env.YTCQ_APP_STORE_CONNECT_KEY_ID
    || process.env.APP_STORE_CONNECT_API_KEY_ID;
  const issuerId = process.env.YTCQ_APP_STORE_CONNECT_ISSUER_ID
    || process.env.APP_STORE_CONNECT_ISSUER_ID;
  const presentValues = [keyPath, keyId, issuerId].filter(Boolean);

  if (presentValues.length > 0 && presentValues.length < 3) {
    throw new Error(
      'Set all App Store Connect API key env vars: '
      + 'YTCQ_APP_STORE_CONNECT_KEY_PATH, YTCQ_APP_STORE_CONNECT_KEY_ID, '
      + 'and YTCQ_APP_STORE_CONNECT_ISSUER_ID.'
    );
  }

  return presentValues.length === 0
    ? []
    : [
      '-authenticationKeyPath',
      keyPath,
      '-authenticationKeyID',
      keyId,
      '-authenticationKeyIssuerID',
      issuerId
    ];
}

function sanitizePathPart(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || 'safari-app';
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function printUsage() {
  console.log(`
Usage:
  node scripts/distribute-safari.mjs --archive
  node scripts/distribute-safari.mjs --upload

Environment:
  YTCQ_SAFARI_DEVELOPMENT_TEAM           Apple Developer team ID.
  YTCQ_SAFARI_APP_NAME                   Generated Safari wrapper app name.
  YTCQ_SAFARI_ARCHIVE_PATH               Optional .xcarchive output path.
  YTCQ_SAFARI_EXPORT_PATH                Optional upload export working directory.
  YTCQ_SAFARI_ALLOW_PROVISIONING_UPDATES Set to 0 to disable Xcode provisioning updates.
  YTCQ_APP_STORE_CONNECT_KEY_PATH        Optional App Store Connect API key .p8 path.
  YTCQ_APP_STORE_CONNECT_KEY_ID          Optional App Store Connect API key ID.
  YTCQ_APP_STORE_CONNECT_ISSUER_ID       Optional App Store Connect issuer ID.
`.trim());
}

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }
}
