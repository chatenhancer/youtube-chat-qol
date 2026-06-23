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
import { generateIcons } from './generate-icons.mjs';
import { syncExtensionLocales } from './sync-extension-locales.mjs';
import { validateExtensionLocales } from './validate-extension-locales.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionAssetsDir = path.join(root, 'src', 'assets');
const targetOutputDirs = {
  chrome: path.join(root, 'dist', 'extension-chrome'),
  edge: path.join(root, 'dist', 'extension-edge'),
  firefox: path.join(root, 'dist', 'extension-firefox'),
  safari: path.join(root, 'dist', 'extension-safari')
};
const targets = getRequestedTargets();
const playgroundBackendOrigin = getPlaygroundBackendOrigin();

await generateIcons();
await validateExtensionLocales();
await syncVersionedSourceFiles();

const manifestSource = await readFile(path.join(root, 'manifest.json'), 'utf8');

const sharedBuildOptions = {
  bundle: true,
  target: 'es2022',
  legalComments: 'none',
  minify: true,
  logLevel: 'info',
  sourcemap: false
};

const sharedDefines = {
  'globalThis.YTCQ_PLAYGROUND_BACKEND_ORIGIN': JSON.stringify(playgroundBackendOrigin)
};

function getBuildOptions(target) {
  return {
    ...sharedBuildOptions,
    define: {
      ...sharedDefines,
      'globalThis.YTCQ_INJECT_MESSAGE_DATA_PAGE': JSON.stringify(target === 'safari')
    }
  };
}

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
      ...getBuildOptions(target),
      entryPoints: [path.join(root, 'src', 'content', 'index.ts')],
      outfile: path.join(extensionDir, 'content.js'),
      format: 'iife'
    }),
    build({
      ...getBuildOptions(target),
      entryPoints: [path.join(root, 'src', 'youtube', 'message-data-page.ts')],
      outfile: path.join(extensionDir, 'message-data-page.js'),
      format: 'iife'
    }),
    build({
      ...getBuildOptions(target),
      entryPoints: [path.join(root, 'src', 'background', 'index.ts')],
      outfile: path.join(extensionDir, 'background.js'),
      format: 'iife'
    }),
    build({
      ...getBuildOptions(target),
      entryPoints: [path.join(root, 'src', 'popup', 'index.ts')],
      outfile: path.join(extensionDir, 'popup.js'),
      format: 'iife'
    })
  ]);

  await Promise.all([
    copyFile(path.join(root, 'src', 'content.css'), path.join(extensionDir, 'content.css')),
    copyFile(path.join(root, 'src', 'popup.css'), path.join(extensionDir, 'popup.css')),
    copyFile(path.join(root, 'src', 'popup.html'), path.join(extensionDir, 'popup.html')),
    copyFile(path.join(root, 'LICENSE'), path.join(extensionDir, 'LICENSE')),
    copyFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(extensionDir, 'THIRD_PARTY_NOTICES.md')),
    copyFile(path.join(extensionAssetsDir, 'logos', 'logo.png'), path.join(extensionDir, 'logo.png')),
    copyFile(path.join(extensionAssetsDir, 'logos', 'logo-white.png'), path.join(extensionDir, 'logo-white.png')),
    syncExtensionLocales(path.join(extensionDir, '_locales')),
    copyStaticDirectory(path.join(root, 'src', 'shared', 'locales'), path.join(extensionDir, 'locales')),
    copyStaticDirectory(path.join(extensionAssetsDir, 'fonts'), path.join(extensionDir, 'fonts')),
    copyStaticDirectory(path.join(extensionAssetsDir, 'games'), path.join(extensionDir, 'games')),
    copyStaticDirectory(path.join(extensionAssetsDir, 'icons'), path.join(extensionDir, 'icons')),
    copyStaticDirectory(path.join(root, 'licenses'), path.join(extensionDir, 'licenses'))
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
    if (script.css) script.css = script.css.map(stripBuildPrefix);
  }

  const usesLocalPlaygroundBackend = isLocalPlaygroundBackendOrigin(playgroundBackendOrigin);
  if (usesLocalPlaygroundBackend) {
    manifest.host_permissions = [
      ...new Set([
        ...(manifest.host_permissions || []),
        'http://127.0.0.1/*',
        'http://localhost/*'
      ])
    ];
  }

  if (target === 'safari') {
    manifest.permissions = [
      ...new Set([
        ...(manifest.permissions || []),
        'activeTab',
        'tabs'
      ])
    ];
    manifest.host_permissions = [
      ...new Set([
        ...(manifest.host_permissions || []),
        'https://www.youtube.com/*',
        'https://studio.youtube.com/*',
        'wss://playground.chatenhancer.com/*'
      ])
    ];
    removeMainWorldContentScripts(manifest);
    addSafariMessageDataPageResource(manifest);
    useSafariPersistentBackground(manifest);
  }

  if (target === 'safari' || usesLocalPlaygroundBackend) {
    const connectSources = [
      "'self'",
      'https://translate.googleapis.com',
      'https://playground.chatenhancer.com',
      'wss://playground.chatenhancer.com'
    ];
    if (usesLocalPlaygroundBackend) {
      connectSources.push(playgroundBackendOrigin, getSocketOrigin(playgroundBackendOrigin));
    }
    setExtensionPageContentSecurityPolicy(manifest, connectSources);
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

function removeMainWorldContentScripts(manifest) {
  manifest.content_scripts = (manifest.content_scripts || []).filter((script) => {
    if (script.world !== 'MAIN') return true;
    return false;
  });
}

function addSafariMessageDataPageResource(manifest) {
  const resources = manifest.web_accessible_resources || [];
  const entry = resources.find((candidate) =>
    Array.isArray(candidate.resources) &&
    Array.isArray(candidate.matches) &&
    candidate.matches.includes('https://www.youtube.com/*')
  );
  if (entry) {
    entry.resources = [...new Set([...entry.resources, 'message-data-page.js'])];
    return;
  }
  resources.push({
    resources: ['message-data-page.js'],
    matches: [
      'https://www.youtube.com/*',
      'https://studio.youtube.com/*'
    ]
  });
  manifest.web_accessible_resources = resources;
}

function useSafariPersistentBackground(manifest) {
  const hostPermissions = manifest.host_permissions || [];
  manifest.manifest_version = 2;
  manifest.background = {
    persistent: true,
    scripts: [manifest.background.service_worker]
  };
  manifest.browser_action = manifest.action;
  delete manifest.action;
  manifest.permissions = [
    ...new Set([
      ...(manifest.permissions || []),
      ...hostPermissions
    ])
  ];
  delete manifest.host_permissions;
  if (Array.isArray(manifest.web_accessible_resources)) {
    manifest.web_accessible_resources = [
      ...new Set(manifest.web_accessible_resources.flatMap((entry) =>
        Array.isArray(entry.resources) ? entry.resources : entry
      ))
    ];
  }
}

function setExtensionPageContentSecurityPolicy(manifest, connectSources) {
  const policy = [
    "script-src 'self'",
    "object-src 'self'",
    `connect-src ${[...new Set(connectSources)].join(' ')}`
  ].join('; ');
  if (manifest.manifest_version === 2) {
    manifest.content_security_policy = policy;
    return;
  }

  manifest.content_security_policy = {
    extension_pages: policy
  };
}

function copyStaticDirectory(source, destination) {
  return cp(source, destination, {
    recursive: true,
    filter: (entry) => !path.basename(entry).startsWith('.')
  });
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

function getPlaygroundBackendOrigin() {
  const args = process.argv.slice(2);
  const originArg = args.find((arg) => arg.startsWith('--playground-backend='));
  const rawOrigin = originArg
    ? originArg.slice('--playground-backend='.length)
    : process.env.YTCQ_PLAYGROUND_BACKEND_ORIGIN || '';
  if (!rawOrigin) return '';

  const normalized = normalizeHttpOrigin(rawOrigin);
  if (!normalized) {
    throw new Error(`Invalid playground backend origin: ${rawOrigin}`);
  }
  return normalized;
}

function normalizeHttpOrigin(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function isLocalPlaygroundBackendOrigin(value) {
  if (!value) return false;
  const { hostname, protocol } = new URL(value);
  return protocol === 'http:' && (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]'
  );
}

function getSocketOrigin(value) {
  const url = new URL(value);
  url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
  return url.toString().replace(/\/$/, '');
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
