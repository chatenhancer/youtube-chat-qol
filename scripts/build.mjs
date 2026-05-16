/*
 * Extension build script.
 *
 * Bundles TypeScript entrypoints with esbuild, copies static assets, and writes
 * a flattened manifest into dist/extension so that folder can be loaded
 * directly by Chrome or zipped for the Web Store.
 */
import { build } from 'esbuild';
import { copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extensionDir = path.join(root, 'dist', 'extension');

await rm(extensionDir, { recursive: true, force: true });
await mkdir(extensionDir, { recursive: true });

const sharedBuildOptions = {
  bundle: true,
  target: 'es2022',
  legalComments: 'none',
  logLevel: 'info',
  sourcemap: false
};

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
  cp(path.join(root, 'assets', 'icons'), path.join(extensionDir, 'icons'), { recursive: true })
]);

const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
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

await writeFile(
  path.join(extensionDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
);

function stripBuildPrefix(value) {
  return String(value).replace(/^dist\/extension\//, '');
}
