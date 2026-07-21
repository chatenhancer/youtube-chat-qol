import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWalkthroughPublicationPlan,
  publishWalkthroughVideos,
  verifyLiveWalkthroughReferences
} from './publish-walkthrough-videos.mjs';

const sourceManifestPath = path.resolve('docs/src/data/walkthrough-videos.json');
let temporaryDir = '';

describe('walkthrough video publishing', () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    if (temporaryDir) await rm(temporaryDir, { force: true, recursive: true });
    temporaryDir = '';
  });

  it('validates a selected locale and prepares its manifest update without uploading', async () => {
    const { inputDir, manifestPath } = await createFixture();
    const originalManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const fileName = await addVideo(inputDir, 'es', 'localized-video');

    const result = await publishWalkthroughVideos({
      dryRun: true,
      inputDir,
      locales: 'es',
      manifestPath
    });

    expect(result.videos.map(({ locale }) => locale)).toEqual(['es']);
    expect(result.manifest.videos.es).toBe(fileName);
    expect(result.manifest.retention.previousVideos.es).toBe(originalManifest.videos.es);
    expect(result.obsoleteVideos).toEqual([{
      fileName: originalManifest.retention.previousVideos.es,
      locale: 'es'
    }]);
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

  it('does not rotate retention when the content hash is unchanged', () => {
    const manifest = createManifest();
    const plan = buildWalkthroughPublicationPlan(manifest, [{
      fileName: manifest.videos.es,
      locale: 'es'
    }]);

    expect(plan.manifest).toEqual(manifest);
    expect(plan.obsoleteVideos).toEqual([]);
  });

  it('can roll back to the previous version without deleting either retained file', () => {
    const manifest = createManifest();
    const plan = buildWalkthroughPublicationPlan(manifest, [{
      fileName: manifest.retention.previousVideos.es,
      locale: 'es'
    }]);

    expect(plan.manifest.videos.es).toBe(manifest.retention.previousVideos.es);
    expect(plan.manifest.retention.previousVideos.es).toBe(manifest.videos.es);
    expect(plan.obsoleteVideos).toEqual([]);
  });

  it('blocks pruning while the live page still references another version', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => '<video src="chat-enhancer-walkthrough-es-11111111.mp4"></video>'
    })));

    await expect(verifyLiveWalkthroughReferences(
      'https://example.test/',
      { es: 'chat-enhancer-walkthrough-es-22222222.mp4' },
      ['es']
    )).rejects.toThrow(/wait for Pages to deploy/);
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

function createManifest() {
  return {
    retention: {
      keepVersionsPerLocale: 2,
      previousVideos: {
        es: 'chat-enhancer-walkthrough-es-11111111.mp4'
      }
    },
    videos: {
      es: 'chat-enhancer-walkthrough-es-22222222.mp4'
    }
  };
}
