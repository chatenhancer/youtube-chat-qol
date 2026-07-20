import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { publishWalkthroughVideos } from './publish-walkthrough-videos.mjs';

const sourceManifestPath = path.resolve('docs/src/data/walkthrough-videos.json');
let temporaryDir = '';

describe('walkthrough video publishing', () => {
  afterEach(async () => {
    if (temporaryDir) await rm(temporaryDir, { force: true, recursive: true });
    temporaryDir = '';
  });

  it('validates a selected locale and prepares its manifest update without uploading', async () => {
    const { inputDir, manifestPath } = await createFixture();
    const fileName = await addVideo(inputDir, 'es', 'localized-video');

    const result = await publishWalkthroughVideos({
      dryRun: true,
      inputDir,
      locales: 'es',
      manifestPath
    });

    expect(result.videos.map(({ locale }) => locale)).toEqual(['es']);
    expect(result.manifest.videos.es).toBe(fileName);
    expect(JSON.parse(await readFile(manifestPath, 'utf8')).videos.es).not.toBe(fileName);
  });

  it('rejects a video whose file name does not match its contents', async () => {
    const { inputDir, manifestPath } = await createFixture();
    await writeFile(path.join(inputDir, 'chat-enhancer-walkthrough-es-deadbeef.mp4'), 'different contents');

    await expect(publishWalkthroughVideos({
      dryRun: true,
      inputDir,
      locales: 'es',
      manifestPath
    })).rejects.toThrow(/has content hash/);
  });
});

async function createFixture() {
  temporaryDir = await mkdtemp(path.join(tmpdir(), 'ytcq-walkthrough-publish-'));
  const inputDir = path.join(temporaryDir, 'videos');
  const manifestPath = path.join(temporaryDir, 'manifest.json');
  await mkdir(inputDir, { recursive: true });
  await writeFile(manifestPath, await readFile(sourceManifestPath));
  return { inputDir, manifestPath };
}

async function addVideo(inputDir, locale, contents) {
  const hash = createHash('sha256').update(contents).digest('hex').slice(0, 8);
  const fileName = `chat-enhancer-walkthrough-${locale}-${hash}.mp4`;
  await writeFile(path.join(inputDir, fileName), contents);
  return fileName;
}
