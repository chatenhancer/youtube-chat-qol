/*
 * Optional CI setup for explicit Mac App Store signing assets.
 *
 * When the Safari release workflow has distribution certificates and
 * provisioning profiles in secrets, this script imports them into a temporary
 * keychain and configures xcodebuild exportArchive for manual signing. If no
 * assets are configured, the workflow keeps using Xcode automatic signing.
 */
import { appendFile, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';

const env = process.env;
const runnerTemp = env.RUNNER_TEMP || tmpdir();
const combinedCertificate = env.YTCQ_SAFARI_DISTRIBUTION_CERTIFICATE_P12_BASE64
  || env.YTCQ_SAFARI_DISTRIBUTION_CERTIFICATES_P12_BASE64;
const appCertificate = env.YTCQ_SAFARI_APP_DISTRIBUTION_CERTIFICATE_P12_BASE64
  || combinedCertificate;
const installerCertificate = env.YTCQ_SAFARI_INSTALLER_DISTRIBUTION_CERTIFICATE_P12_BASE64
  || combinedCertificate;
const appProfile = env.YTCQ_SAFARI_APP_PROVISIONING_PROFILE_BASE64;
const extensionProfile = env.YTCQ_SAFARI_EXTENSION_PROVISIONING_PROFILE_BASE64;

if (![appCertificate, installerCertificate, appProfile, extensionProfile].some(Boolean)) {
  console.log('No explicit Safari signing assets configured; using Xcode automatic signing.');
  process.exit(0);
}

requireSigningAssets();

const keychainPath = path.join(runnerTemp, 'ytcq-safari-signing.keychain-db');
const keychainPassword = env.YTCQ_SAFARI_SIGNING_KEYCHAIN_PASSWORD
  || crypto.randomBytes(24).toString('hex');
const sharedCertificatePassword = env.YTCQ_SAFARI_CERTIFICATE_PASSWORD || '';
const appCertificatePassword = env.YTCQ_SAFARI_APP_DISTRIBUTION_CERTIFICATE_PASSWORD
  || sharedCertificatePassword;
const installerCertificatePassword = env.YTCQ_SAFARI_INSTALLER_DISTRIBUTION_CERTIFICATE_PASSWORD
  || sharedCertificatePassword;

await createTemporaryKeychain(keychainPath, keychainPassword);
await importCertificate({
  contents: appCertificate,
  keychainPath,
  label: 'app-distribution',
  password: appCertificatePassword
});
await importCertificate({
  contents: installerCertificate,
  keychainPath,
  label: 'installer-distribution',
  password: installerCertificatePassword
});
run('security', [
  'set-key-partition-list',
  '-S',
  'apple-tool:,apple:,codesign:',
  '-s',
  '-k',
  keychainPassword,
  keychainPath
]);

const installedProfiles = [
  await installProvisioningProfile({
    bundleIdOverride: env.YTCQ_SAFARI_APP_PROVISIONING_PROFILE_BUNDLE_ID,
    contents: appProfile,
    label: 'app'
  }),
  await installProvisioningProfile({
    bundleIdOverride: env.YTCQ_SAFARI_EXTENSION_PROVISIONING_PROFILE_BUNDLE_ID,
    contents: extensionProfile,
    label: 'extension'
  })
];
const provisioningProfiles = Object.fromEntries(installedProfiles.map((profile) => [
  profile.bundleId,
  profile.name
]));

await appendGithubEnv({
  YTCQ_SAFARI_EXPORT_SIGNING_STYLE: 'manual',
  YTCQ_SAFARI_EXPORT_SIGNING_CERTIFICATE: env.YTCQ_SAFARI_EXPORT_SIGNING_CERTIFICATE
    || 'Mac App Distribution',
  YTCQ_SAFARI_EXPORT_INSTALLER_SIGNING_CERTIFICATE:
    env.YTCQ_SAFARI_EXPORT_INSTALLER_SIGNING_CERTIFICATE
    || 'Mac Installer Distribution',
  YTCQ_SAFARI_EXPORT_PROVISIONING_PROFILES: JSON.stringify(provisioningProfiles)
});

console.log(
  `Configured explicit Safari App Store signing assets for ${Object.keys(provisioningProfiles).join(', ')}.`
);

function requireSigningAssets() {
  const missing = [];
  if (!appCertificate) missing.push('YTCQ_SAFARI_APP_DISTRIBUTION_CERTIFICATE_P12_BASE64');
  if (!installerCertificate) {
    missing.push('YTCQ_SAFARI_INSTALLER_DISTRIBUTION_CERTIFICATE_P12_BASE64');
  }
  if (!appProfile) missing.push('YTCQ_SAFARI_APP_PROVISIONING_PROFILE_BASE64');
  if (!extensionProfile) missing.push('YTCQ_SAFARI_EXTENSION_PROVISIONING_PROFILE_BASE64');

  if (missing.length === 0) return;

  throw new Error(
    'Incomplete explicit Safari signing asset configuration. Missing: '
    + missing.join(', ')
    + '. Set all signing asset secrets, or leave all of them unset to use automatic signing.'
  );
}

async function createTemporaryKeychain(nextKeychainPath, password) {
  run('security', ['create-keychain', '-p', password, nextKeychainPath]);
  run('security', ['set-keychain-settings', '-lut', '21600', nextKeychainPath]);
  run('security', ['unlock-keychain', '-p', password, nextKeychainPath]);
  run('security', ['default-keychain', '-d', 'user', '-s', nextKeychainPath]);

  const currentKeychains = readUserKeychains().filter((keychain) => keychain !== nextKeychainPath);
  run('security', ['list-keychains', '-d', 'user', '-s', nextKeychainPath, ...currentKeychains]);
}

function readUserKeychains() {
  const result = spawnSync('security', ['list-keychains', '-d', 'user'], {
    encoding: 'utf8'
  });

  if (result.status !== 0) return [];

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

async function importCertificate({
  contents,
  keychainPath: nextKeychainPath,
  label,
  password
}) {
  const certificatePath = path.join(runnerTemp, `${label}.p12`);
  await writeFile(certificatePath, decodeBase64(contents));
  run('security', [
    'import',
    certificatePath,
    '-k',
    nextKeychainPath,
    '-P',
    password,
    '-T',
    '/usr/bin/codesign',
    '-T',
    '/usr/bin/productbuild',
    '-T',
    '/usr/bin/productsign'
  ]);
}

async function installProvisioningProfile({
  bundleIdOverride,
  contents,
  label
}) {
  const sourcePath = path.join(runnerTemp, `${label}.provisionprofile`);
  await writeFile(sourcePath, decodeBase64(contents));

  const metadata = await readProvisioningProfileMetadata({
    bundleIdOverride,
    label,
    profilePath: sourcePath
  });
  const destinationDir = path.join(homedir(), 'Library', 'MobileDevice', 'Provisioning Profiles');
  const destinationPath = path.join(destinationDir, `${metadata.uuid}.provisionprofile`);

  await mkdir(destinationDir, { recursive: true });
  await copyFile(sourcePath, destinationPath);

  return metadata;
}

async function readProvisioningProfileMetadata({
  bundleIdOverride,
  label,
  profilePath
}) {
  const plistPath = path.join(runnerTemp, `${label}.plist`);
  const decodedProfile = runCapture('security', ['cms', '-D', '-i', profilePath]);
  await writeFile(plistPath, decodedProfile);

  const name = readPlistValue(plistPath, ':Name');
  const uuid = readPlistValue(plistPath, ':UUID');
  const applicationIdentifier = readFirstPlistValue(plistPath, [
    ':Entitlements:application-identifier',
    ':Entitlements:com.apple.application-identifier'
  ]);
  const bundleId = bundleIdOverride || bundleIdFromApplicationIdentifier(applicationIdentifier);

  if (!name || !uuid || !bundleId) {
    throw new Error(
      `Could not read name, UUID, and bundle identifier from the ${label} provisioning profile.`
    );
  }

  return { bundleId, name, uuid };
}

function readFirstPlistValue(plistPath, keys) {
  for (const key of keys) {
    const value = readPlistValue(plistPath, key, { allowMissing: true });
    if (value) return value;
  }

  return '';
}

function readPlistValue(plistPath, key, { allowMissing = false } = {}) {
  const result = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Print ${key}`, plistPath], {
    encoding: 'utf8'
  });

  if (result.status === 0) return result.stdout.trim();
  if (allowMissing) return '';

  throw new Error(`Could not read ${key} from ${plistPath}.`);
}

function bundleIdFromApplicationIdentifier(applicationIdentifier) {
  const match = /^[^.]+[.](.+)$/.exec(applicationIdentifier || '');
  return match?.[1] || '';
}

function decodeBase64(value) {
  return Buffer.from(String(value).replace(/\s+/g, ''), 'base64');
}

async function appendGithubEnv(values) {
  if (!env.GITHUB_ENV) {
    Object.assign(env, values);
    return;
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join('');
  await appendFile(env.GITHUB_ENV, lines);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }

  return result.stdout;
}
