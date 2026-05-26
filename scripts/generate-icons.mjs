/*
 * Icon generation script.
 *
 * Rasterizes the source SVG into the Chrome-required PNG sizes. The SVG stays
 * as the editable source of truth for extension icons.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = path.join(root, 'assets', 'icons');
const sourcePath = path.join(iconDir, 'icon.svg');
const sizes = [16, 32, 48, 128];

export async function generateIcons() {
  const source = await readFile(sourcePath);

  for (const size of sizes) {
    await sharp(source)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(iconDir, `icon-${size}.png`));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generateIcons();
}
