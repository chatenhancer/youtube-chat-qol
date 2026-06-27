/*
 * Archives and optionally uploads the generated Safari Web Extension wrapper.
 *
 * Run after scripts/package-safari.mjs has generated dist/safari.
 */
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskGithubActionsValues } from './lib/github-actions-log.mjs';
import { loadLocalEnv, requireEnv } from './lib/local-env.mjs';
import {
  createSafariExportOptionsPlist,
  getSafariExportProvisioningArgs
} from './lib/safari-export-options.mjs';

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
requireEnv('YTCQ_SAFARI_BUNDLE_ID');
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
const bundleIdentifier = requireEnv('YTCQ_SAFARI_BUNDLE_ID');
maskGithubActionsValues([
  developmentTeam,
  bundleIdentifier,
  `${bundleIdentifier}.Extension`,
  process.env.YTCQ_APP_STORE_CONNECT_KEY_ID,
  process.env.APP_STORE_CONNECT_API_KEY_ID,
  process.env.YTCQ_APP_STORE_CONNECT_ISSUER_ID,
  process.env.APP_STORE_CONNECT_ISSUER_ID,
  process.env.YTCQ_APP_STORE_APPLE_ID,
  process.env.YTCQ_SAFARI_EXPORT_SIGNING_CERTIFICATE,
  process.env.YTCQ_SAFARI_EXPORT_INSTALLER_SIGNING_CERTIFICATE,
  process.env.YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES
]);
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
  await assertArchiveBundleIdentifiers(nextArchivePath);
}

async function uploadArchive(nextArchivePath, archiveVersions) {
  const exportPath = process.env.YTCQ_SAFARI_EXPORT_PATH
    || path.join(
      exportRoot,
      `${sanitizePathPart(appName)}-${archiveVersions.marketingVersion}-${archiveVersions.buildNumber}`
    );
  const exportOptionsPath = path.join(exportPath, 'ExportOptions.plist');

  await mkdir(exportPath, { recursive: true });
  await writeFile(exportOptionsPath, createSafariExportOptionsPlist({
    developmentTeam,
    env: {
      ...process.env,
      YTCQ_SAFARI_EXPORT_DESTINATION: 'export'
    }
  }), 'utf8');

  run('xcodebuild', [
    '-exportArchive',
    '-archivePath',
    nextArchivePath,
    '-exportPath',
    exportPath,
    '-exportOptionsPlist',
    exportOptionsPath,
    ...getSafariExportProvisioningArgs(),
    ...getAuthenticationArgs()
  ]);

  await uploadExportedPackage(exportPath);
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

function getProvisioningArgs() {
  return process.env.YTCQ_SAFARI_ALLOW_PROVISIONING_UPDATES === '0'
    ? []
    : ['-allowProvisioningUpdates'];
}

function getAuthenticationArgs() {
  const config = getAuthenticationConfig();
  if (!config) return [];

  return [
    '-authenticationKeyPath',
    config.keyPath,
    '-authenticationKeyID',
    config.keyId,
    '-authenticationKeyIssuerID',
    config.issuerId
  ];
}

function getAuthenticationConfig() {
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
    ? null
    : {
      issuerId,
      keyId,
      keyPath
    };
}

async function assertArchiveBundleIdentifiers(nextArchivePath) {
  const appInfoPlist = path.join(
    nextArchivePath,
    'Products',
    'Applications',
    `${appName}.app`,
    'Contents',
    'Info.plist'
  );
  const extensionInfoPlist = path.join(
    nextArchivePath,
    'Products',
    'Applications',
    `${appName}.app`,
    'Contents',
    'PlugIns',
    `${appName} Extension.appex`,
    'Contents',
    'Info.plist'
  );
  const appBundleId = readPlistValue(appInfoPlist, ':CFBundleIdentifier');
  const extensionBundleId = readPlistValue(extensionInfoPlist, ':CFBundleIdentifier');
  const expectedExtensionBundleId = `${bundleIdentifier}.Extension`;

  if (appBundleId !== bundleIdentifier || extensionBundleId !== expectedExtensionBundleId) {
    throw new Error(
      'Safari archive bundle identifiers do not match the App Store Connect app: '
      + `expected ${bundleIdentifier} and ${expectedExtensionBundleId}, `
      + `got ${appBundleId} and ${extensionBundleId}.`
    );
  }

  console.log('Verified Safari archive bundle identifiers.');
}

function readPlistValue(plistPath, key) {
  return runCapture('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, plistPath]);
}

async function uploadExportedPackage(exportPath) {
  const packagePath = await findExportedPackage(exportPath);
  const normalizedPackagePath = await normalizePackageIdentifier(packagePath);
  const authentication = getAuthenticationConfig();
  const appleId = requireEnv('YTCQ_APP_STORE_APPLE_ID');

  if (!authentication) {
    throw new Error(
      'Uploading the Safari package requires App Store Connect API key env vars.'
    );
  }

  run('xcrun', [
    'altool',
    '--upload-package',
    normalizedPackagePath,
    '--type',
    'macos',
    '--apple-id',
    appleId,
    '--bundle-id',
    bundleIdentifier,
    '--bundle-version',
    versions.buildNumber,
    '--bundle-short-version-string',
    versions.marketingVersion,
    '--apiKey',
    authentication.keyId,
    '--apiIssuer',
    authentication.issuerId
  ], {
    env: {
      ...process.env,
      API_PRIVATE_KEYS_DIR: path.dirname(authentication.keyPath)
    }
  });
}

async function normalizePackageIdentifier(packagePath) {
  const workRoot = await mkdtemp(path.join(tmpdir(), 'ytcq-safari-pkg-'));
  const expandedPath = path.join(workRoot, 'expanded');
  const unsignedPackagePath = path.join(workRoot, 'unsigned.pkg');
  const normalizedPackagePath = packagePath.replace(/[.]pkg$/i, '.appstore.pkg');

  try {
    run('pkgutil', ['--expand', packagePath, expandedPath]);

    const currentIdentifier = await readProductPackageIdentifier(expandedPath);
    if (currentIdentifier === bundleIdentifier) return packagePath;

    await rewriteProductPackageIdentifier(expandedPath, currentIdentifier);
    run('pkgutil', ['--flatten', expandedPath, unsignedPackagePath]);
    run('productsign', [
      '--sign',
      getInstallerSigningCertificate(),
      unsignedPackagePath,
      normalizedPackagePath
    ]);

    console.log('Normalized Safari package identifier for App Store upload.');
    return normalizedPackagePath;
  } finally {
    await rm(workRoot, { force: true, recursive: true });
  }
}

async function readProductPackageIdentifier(expandedPath) {
  const distributionPath = path.join(expandedPath, 'Distribution');
  const distribution = await readFile(distributionPath, 'utf8');
  const productMatch = /<product\b[^>]*\bid="([^"]+)"/.exec(distribution);
  if (productMatch?.[1]) return productMatch[1];

  const packageInfoPaths = await findFilesByName(expandedPath, 'PackageInfo');
  for (const packageInfoPath of packageInfoPaths) {
    const packageInfo = await readFile(packageInfoPath, 'utf8');
    const packageMatch = /<pkg-info\b[^>]*\bidentifier="([^"]+)"/.exec(packageInfo);
    if (packageMatch?.[1]) return packageMatch[1];
  }

  throw new Error(`Could not read the product package identifier from ${expandedPath}.`);
}

async function rewriteProductPackageIdentifier(expandedPath, currentIdentifier) {
  const replacementFiles = [
    path.join(expandedPath, 'Distribution'),
    ...await findFilesByName(expandedPath, 'PackageInfo')
  ];

  await Promise.all(replacementFiles.map(async (filePath) => {
    const original = await readFile(filePath, 'utf8');
    const next = original.replaceAll(currentIdentifier, bundleIdentifier);
    if (next !== original) await writeFile(filePath, next, 'utf8');
  }));

  const currentComponentPath = path.join(expandedPath, `${currentIdentifier}.pkg`);
  const nextComponentPath = path.join(expandedPath, `${bundleIdentifier}.pkg`);
  if (currentComponentPath !== nextComponentPath && await pathExists(currentComponentPath)) {
    await rm(nextComponentPath, { force: true, recursive: true });
    await rename(currentComponentPath, nextComponentPath);
  }
}

function getInstallerSigningCertificate() {
  return process.env.YTCQ_SAFARI_EXPORT_INSTALLER_SIGNING_CERTIFICATE
    || 'Mac Installer Distribution';
}

async function findExportedPackage(exportPath) {
  const packagePaths = (await findFilesByExtension(exportPath, '.pkg')).filter(
    (packagePath) => !/[.]appstore[.]pkg$/i.test(packagePath)
  );

  if (packagePaths.length === 1) return packagePaths[0];
  if (packagePaths.length > 1) {
    throw new Error(
      `Expected one exported Safari package in ${exportPath}, found ${packagePaths.length}.`
    );
  }

  throw new Error(`No exported Safari .pkg found in ${exportPath}.`);
}

async function findFilesByExtension(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      matches.push(...await findFilesByExtension(entryPath, extension));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(extension)) {
      matches.push(entryPath);
    }
  }

  return matches;
}

async function findFilesByName(directory, fileName) {
  const entries = await readdir(directory, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      matches.push(...await findFilesByName(entryPath, fileName));
      continue;
    }

    if (entry.isFile() && entry.name === fileName) {
      matches.push(entryPath);
    }
  }

  return matches;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizePathPart(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-|-$/g, '') || 'safari-app';
}

function printUsage() {
  console.log(`
Usage:
  node scripts/distribute-safari.mjs --archive
  node scripts/distribute-safari.mjs --upload

Environment:
  YTCQ_SAFARI_DEVELOPMENT_TEAM           Apple Developer team ID.
  YTCQ_SAFARI_BUNDLE_ID                  Mac App Store app bundle ID.
  YTCQ_SAFARI_APP_NAME                   Generated Safari wrapper app name.
  YTCQ_SAFARI_ARCHIVE_PATH               Optional .xcarchive output path.
  YTCQ_SAFARI_EXPORT_PATH                Optional upload export working directory.
  YTCQ_SAFARI_ALLOW_PROVISIONING_UPDATES Set to 0 to disable Xcode provisioning updates.
  YTCQ_SAFARI_EXPORT_SIGNING_STYLE       automatic or manual. Defaults to automatic.
  YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES
                                            JSON bundle ID to profile name map for manual export signing.
  YTCQ_SAFARI_EXPORT_SIGNING_CERTIFICATE Optional manual app signing certificate name.
  YTCQ_SAFARI_EXPORT_INSTALLER_SIGNING_CERTIFICATE
                                            Optional manual installer signing certificate name.
  YTCQ_APP_STORE_CONNECT_KEY_PATH        Optional App Store Connect API key .p8 path.
  YTCQ_APP_STORE_CONNECT_KEY_ID          Optional App Store Connect API key ID.
  YTCQ_APP_STORE_CONNECT_ISSUER_ID       Optional App Store Connect issuer ID.
  YTCQ_APP_STORE_APPLE_ID                Mac App Store numeric app ID.
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

function runCapture(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    ...options
  });

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }

  return result.stdout.trim();
}
