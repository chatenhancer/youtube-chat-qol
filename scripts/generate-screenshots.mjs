/*
 * Screenshot asset generation script.
 *
 * Uses the three high-resolution screenshot exports in assets/screenshots
 * as the source of truth, then generates the README showcase, high-resolution
 * docs showcase, and Chrome Web Store screenshots with centered white padding.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'assets', 'screenshots');
const readmeDir = sourceDir;
const docsDir = path.join(root, 'docs', 'assets', 'screenshots');
const chromeWebStoreDir = path.join(readmeDir, 'chrome-web-store');

const screenshots = [
  '1_screenshot_translation.png',
  '2_screenshot_mentions.png',
  '3_screenshot_extras.png'
];

const readmeShowcaseSize = {
  width: 1542,
  height: 852
};

const chromeWebStoreSize = {
  width: 1280,
  height: 800
};

const whiteBackground = {
  r: 255,
  g: 255,
  b: 255,
  alpha: 1
};

await mkdir(readmeDir, { recursive: true });
await mkdir(docsDir, { recursive: true });
await mkdir(chromeWebStoreDir, { recursive: true });

const readmeShowcaseBuffers = await Promise.all(screenshots.map(async (filename) => {
  const sourcePath = path.join(sourceDir, filename);
  const normalizedScreenshot = await sharp(sourcePath)
    .resize(readmeShowcaseSize.width, readmeShowcaseSize.height, {
      fit: 'contain',
      position: 'center',
      background: whiteBackground
    })
    .flatten({ background: whiteBackground })
    .png()
    .toBuffer();

  await sharp(sourcePath)
    .resize(chromeWebStoreSize.width, chromeWebStoreSize.height, {
      fit: 'contain',
      position: 'center',
      background: whiteBackground
    })
    .flatten({ background: whiteBackground })
    .png()
    .toFile(path.join(chromeWebStoreDir, filename));

  return normalizedScreenshot;
}));

const readmeShowcase = await stackScreenshots(readmeShowcaseBuffers, readmeShowcaseSize);
const docsShowcase = await createDocsFeatureShowcase();

await Promise.all([
  sharp(readmeShowcase).toFile(path.join(readmeDir, 'readme-showcase.png')),
  sharp(docsShowcase).toFile(path.join(docsDir, 'feature-showcase.png'))
]);

async function createDocsFeatureShowcase() {
  const sourceMetadata = await sharp(path.join(sourceDir, screenshots[0])).metadata();
  const docsShowcaseSize = {
    width: sourceMetadata.width || readmeShowcaseSize.width * 2,
    height: sourceMetadata.height || readmeShowcaseSize.height * 2
  };

  const buffers = await Promise.all(screenshots.map((filename) => (
    sharp(path.join(sourceDir, filename))
      .resize(docsShowcaseSize.width, docsShowcaseSize.height, {
        fit: 'contain',
        position: 'center',
        background: whiteBackground
      })
      .flatten({ background: whiteBackground })
      .png()
      .toBuffer()
  )));

  return stackScreenshots(buffers, docsShowcaseSize);
}

async function stackScreenshots(buffers, size) {
  return sharp({
    create: {
      width: size.width,
      height: size.height * buffers.length,
      channels: 4,
      background: whiteBackground
    }
  })
    .composite(buffers.map((input, index) => ({
      input,
      left: 0,
      top: index * size.height
    })))
    .png()
    .toBuffer();
}
