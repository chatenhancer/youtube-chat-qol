/*
 * Safari Web Extension packaging script.
 *
 * Builds the Xcode wrapper that Safari requires around the web extension
 * resources. The wrapper is generated into dist/safari and can be opened,
 * built, signed, and distributed with Xcode.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import packageJson from '../package.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const safariAppIconSourcePath = path.join(root, 'src', 'assets', 'icons', 'safari-app-icon.svg');
const extensionDir = path.join(root, 'dist', 'extension-safari');
const projectLocation = path.join(root, 'dist', 'safari');
const appName = process.env.YTCQ_SAFARI_APP_NAME || 'Chat Enhancer for YouTube';
const bundleIdentifier = process.env.YTCQ_SAFARI_BUNDLE_ID || 'com.chatenhancer.safari';
const developmentTeam = process.env.YTCQ_SAFARI_DEVELOPMENT_TEAM || '2UJF2GNW75';
const marketingVersion = process.env.YTCQ_SAFARI_MARKETING_VERSION || packageJson.version;
const buildNumber = process.env.YTCQ_SAFARI_BUILD_NUMBER || getDefaultBuildNumber();
const macAppCategory = process.env.YTCQ_SAFARI_APP_CATEGORY || 'public.app-category.entertainment';

await unregisterLegacySafariExtensionBuilds();
await assertSafariExtensionBuildExists();
run('xcrun', [
  'safari-web-extension-converter',
  extensionDir,
  '--project-location',
  projectLocation,
  '--app-name',
  appName,
  '--bundle-identifier',
  bundleIdentifier,
  '--swift',
  '--copy-resources',
  '--no-open',
  '--no-prompt',
  '--force'
], {
  cwd: root,
  stdio: 'inherit'
});

await updateXcodeProjectSettings();
await updateMacAppInfoPlist();
await updateSafariAppIcons();

async function assertSafariExtensionBuildExists() {
  try {
    await readFile(path.join(extensionDir, 'manifest.json'), 'utf8');
  } catch {
    throw new Error('Missing dist/extension-safari. Run npm run build:safari first.');
  }
}

async function updateXcodeProjectSettings() {
  const projectPath = path.join(projectLocation, appName, `${appName}.xcodeproj`, 'project.pbxproj');
  const original = await readFile(projectPath, 'utf8');
  const next = original
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${quotePbxValue(buildNumber)};`)
    .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${quotePbxValue(marketingVersion)};`)
    .replace(
      /(CODE_SIGN_STYLE = Automatic;\n)(?!\s*DEVELOPMENT_TEAM = )/g,
      `$1\t\t\t\tDEVELOPMENT_TEAM = ${quotePbxValue(developmentTeam)};\n`
    )
    .replace(
      /(ENABLE_HARDENED_RUNTIME = YES;\n)(?!\s*ENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;\n)(?=[\s\S]*?INFOPLIST_FILE = "macOS \(Extension\)\/Info\.plist";)/g,
      '$1\t\t\t\tENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;\n'
    );
  if (next !== original) await writeFile(projectPath, next);
}

async function updateMacAppInfoPlist() {
  const plistPath = path.join(projectLocation, appName, 'macOS (App)', 'Info.plist');
  const original = await readFile(plistPath, 'utf8');
  const next = original.includes('<key>LSApplicationCategoryType</key>')
    ? original.replace(
      /<key>LSApplicationCategoryType<\/key>\s*<string>[^<]*<\/string>/,
      `<key>LSApplicationCategoryType</key>\n\t<string>${escapeXml(macAppCategory)}</string>`
    )
    : original.replace(
      '</dict>',
      `\t<key>LSApplicationCategoryType</key>\n\t<string>${escapeXml(macAppCategory)}</string>\n</dict>`
    );
  if (next !== original) await writeFile(plistPath, next);
}

async function updateSafariAppIcons() {
  const appRoot = path.join(projectLocation, appName);
  const appIconDir = path.join(appRoot, 'Shared (App)', 'Assets.xcassets', 'AppIcon.appiconset');
  const outputSpecs = [
    ['universal-icon-1024@1x.png', 1024],
    ['mac-icon-16@1x.png', 16],
    ['mac-icon-16@2x.png', 32],
    ['mac-icon-32@1x.png', 32],
    ['mac-icon-32@2x.png', 64],
    ['mac-icon-128@1x.png', 128],
    ['mac-icon-128@2x.png', 256],
    ['mac-icon-256@1x.png', 256],
    ['mac-icon-256@2x.png', 512],
    ['mac-icon-512@1x.png', 512],
    ['mac-icon-512@2x.png', 1024],
    [path.join('..', '..', 'Resources', 'Icon.png'), 512],
    [path.join('..', 'LargeIcon.imageset', 'icon-128.png'), 128]
  ];

  await Promise.all(outputSpecs.map(([fileName, size]) =>
    sharp(safariAppIconSourcePath)
      .resize(size, size)
      .png()
      .toFile(path.join(appIconDir, fileName))
  ));
}

async function unregisterLegacySafariExtensionBuilds() {
  const legacyProductsDir = path.join(root, 'dist', 'safari-derived', 'Build', 'Products', 'Debug');
  const pluginPaths = [
    path.join(legacyProductsDir, `${appName}.app`, 'Contents', 'PlugIns', `${appName} Extension.appex`),
    path.join(legacyProductsDir, `${appName} Extension.appex`)
  ];

  for (const pluginPath of pluginPaths) {
    if (!(await pathExists(pluginPath))) continue;

    // Older local builds used dist/safari-derived and can stay registered with
    // Safari under the same bundle ID, causing Safari to load stale scripts.
    spawnSync('pluginkit', ['-r', pluginPath], { stdio: 'ignore' });
  }
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function quotePbxValue(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9_.-]+$/.test(text)
    ? text
    : JSON.stringify(text);
}

function getDefaultBuildNumber() {
  const now = new Date();
  const parts = [
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  ];

  return [
    parts[0],
    ...parts.slice(1).map((part) => String(part).padStart(2, '0'))
  ].join('');
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, options);

  if (result.status !== 0) {
    throw new Error(`${command} exited with ${result.status ?? 'unknown status'}`);
  }

  return result;
}
