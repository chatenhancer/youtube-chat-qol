/*
 * Extension build script.
 *
 * Bundles TypeScript entrypoints with esbuild, copies static assets, and writes
 * flattened browser-specific manifests into dist folders that can be loaded
 * directly by extension browsers or zipped for stores.
 */
import { build } from 'esbuild';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };
import { syncExtensionLocales } from './sync-extension-locales.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targetOutputDirs = {
  chrome: path.join(root, 'dist', 'extension-chrome'),
  edge: path.join(root, 'dist', 'extension-edge'),
  firefox: path.join(root, 'dist', 'extension-firefox')
};
const targets = getRequestedTargets();

await syncVersionedSourceFiles();

const manifestSource = await readFile(path.join(root, 'manifest.json'), 'utf8');

const sharedBuildOptions = {
  bundle: true,
  target: 'es2022',
  legalComments: 'none',
  logLevel: 'info',
  sourcemap: false
};

for (const target of targets) {
  await buildTarget(target);
}

async function buildTarget(target) {
  const extensionDir = targetOutputDirs[target];
  if (!extensionDir) throw new Error(`Unsupported build target: ${target}`);

  await rm(extensionDir, { recursive: true, force: true });
  await mkdir(extensionDir, { recursive: true });

  await Promise.all([
    build({
      ...sharedBuildOptions,
      entryPoints: [path.join(root, 'src', 'content', 'index.ts')],
      outfile: path.join(extensionDir, 'content.js'),
      format: 'iife'
    }),
    build({
      ...sharedBuildOptions,
      entryPoints: [path.join(root, 'src', 'background', 'translate.ts')],
      outfile: path.join(extensionDir, 'background.js'),
      format: 'iife'
    }),
    build({
      ...sharedBuildOptions,
      entryPoints: [path.join(root, 'src', 'popup', 'index.ts')],
      outfile: path.join(extensionDir, 'popup.js'),
      format: 'iife'
    })
  ]);

  await Promise.all([
    copyFile(path.join(root, 'src', 'content.css'), path.join(extensionDir, 'content.css')),
    copyFile(path.join(root, 'src', 'popup.css'), path.join(extensionDir, 'popup.css')),
    copyFile(path.join(root, 'src', 'popup.html'), path.join(extensionDir, 'popup.html')),
    copyFile(path.join(root, 'assets', 'logo.png'), path.join(extensionDir, 'logo.png')),
    copyFile(path.join(root, 'assets', 'logo-white.png'), path.join(extensionDir, 'logo-white.png')),
    syncExtensionLocales(path.join(extensionDir, '_locales')),
    cp(path.join(root, 'assets', 'icons'), path.join(extensionDir, 'icons'), { recursive: true })
  ]);

  await writeFile(
    path.join(extensionDir, 'manifest.json'),
    `${JSON.stringify(createManifest(target), null, 2)}\n`
  );
}

function createManifest(target) {
  const manifest = JSON.parse(manifestSource);
  manifest.version = packageJson.version;
  for (const size of Object.keys(manifest.icons || {})) {
    manifest.icons[size] = stripBuildPrefix(manifest.icons[size]);
  }
  manifest.background.service_worker = stripBuildPrefix(manifest.background.service_worker);
  manifest.action.default_popup = stripBuildPrefix(manifest.action.default_popup);
  for (const size of Object.keys(manifest.action.default_icon || {})) {
    manifest.action.default_icon[size] = stripBuildPrefix(manifest.action.default_icon[size]);
  }
  for (const script of manifest.content_scripts) {
    script.js = script.js.map(stripBuildPrefix);
    script.css = script.css.map(stripBuildPrefix);
  }

  if (target === 'firefox') {
    manifest.background = {
      scripts: [manifest.background.service_worker]
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'chat-enhancer-for-youtube@chat-enhancer-yt.github.io',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['personalCommunications']
        }
      }
    };
  }

  return manifest;
}

function stripBuildPrefix(value) {
  return String(value).replace(/^dist\/extension(?:-chrome)?\//, '');
}

function getRequestedTargets() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--all')) return ['chrome', 'edge', 'firefox'];
  const targetArg = [...args].find((arg) => arg.startsWith('--target='));
  const target = targetArg ? targetArg.slice('--target='.length) : 'chrome';
  if (!Object.hasOwn(targetOutputDirs, target)) {
    throw new Error(`Unsupported build target: ${target}`);
  }
  return [target];
}

async function syncVersionedSourceFiles() {
  await Promise.all([
    syncManifestVersion(),
    syncPackageLockVersion()
  ]);
}

async function syncManifestVersion() {
  const manifestPath = path.join(root, 'manifest.json');
  const original = await readFile(manifestPath, 'utf8');
  const next = original.replace(
    /("version":\s*")[^"]+(")/,
    `$1${packageJson.version}$2`
  );
  if (next !== original) await writeFile(manifestPath, next);
}

async function syncPackageLockVersion() {
  const packageLockPath = path.join(root, 'package-lock.json');
  const original = await readFile(packageLockPath, 'utf8');
  const next = original
    .replace(/("version":\s*")[^"]+(")/, `$1${packageJson.version}$2`)
    .replace(
      /("packages":\s*\{\n\s+"":\s*\{\n\s+"name":\s*"[^"]+",\n\s+"version":\s*")[^"]+(")/,
      `$1${packageJson.version}$2`
    );
  if (next !== original) await writeFile(packageLockPath, next);
}
