import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getChromeWebStoreConfig, submitChromeWebStorePackage } from './chrome-webstore.ts';

const request = vi.fn<typeof fetch>();
const archive = Buffer.from('test release archive');
let directory: string;
let zipPath: string;

describe('Chrome Web Store publishing', () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'chrome-webstore-test-'));
    zipPath = path.join(directory, 'release.zip');
    await writeFile(zipPath, archive);
    request.mockReset().mockImplementation(async () => { throw new Error('Unexpected Chrome Web Store request'); });
    vi.stubGlobal('fetch', request);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([undefined, 'false', 'true'])('enables replacement only with an explicit true flag (%s)', (flag) => {
    expect(getChromeWebStoreConfig({
      CHROME_WEBSTORE_SERVICE_ACCOUNT_JSON: '{}',
      CHROME_WEBSTORE_REPLACE_PENDING: flag
    }).replacePending).toBe(flag === 'true');
  });

  it('preserves upload-and-submit behavior and publish type when replacement is disabled', async () => {
    request.mockResolvedValueOnce(Response.json({ uploadState: 'SUCCEEDED' }))
      .mockResolvedValueOnce(Response.json({ state: 'PENDING_REVIEW' }));

    await expect(submitChromeWebStorePackage({
      token: 'test-token',
      publisherId: 'test-publisher',
      extensionId: 'test-extension',
      zipPath,
      publishType: 'STAGED_PUBLISH'
    })).resolves.toBe(true);

    expect(actions()).toEqual(['POST upload', 'POST publish']);
    expect(request.mock.calls[1][1]?.body).toBe(JSON.stringify({ publishType: 'STAGED_PUBLISH' }));
  });

  it.each([200, 204])('replaces an older pending review before uploading and submitting (%s)', async (status) => {
    request.mockResolvedValueOnce(Response.json({
      publishedItemRevisionStatus: revision('PUBLISHED', '1.0.8'),
      submittedItemRevisionStatus: revision('PENDING_REVIEW', '1.0.9')
    })).mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(Response.json({ uploadState: 'SUCCEEDED' }))
      .mockResolvedValueOnce(Response.json({ state: 'PENDING_REVIEW' }));

    await expect(submit()).resolves.toBe(true);

    expect(actions()).toEqual(['GET fetchStatus', 'POST cancelSubmission', 'POST upload', 'POST publish']);
    expect(request.mock.calls[1][0]).toMatch(/\/v2\/publishers\/test-publisher\/items\/test-extension:cancelSubmission$/);
    expect(request.mock.calls[1][1]).toMatchObject({ headers: { Authorization: 'Bearer test-token' } });
    expect(request.mock.calls[1][1]?.body).toBeUndefined();
    expect(request.mock.calls[2][1]).toMatchObject({
      headers: { 'Content-Type': 'application/zip', Authorization: 'Bearer test-token' },
      body: archive
    });
  });

  it.each(['PENDING_REVIEW', 'STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS'])(
    'leaves the same version in %s intact on a retry', async (state) => {
      request.mockResolvedValueOnce(Response.json({
        [state.startsWith('PUBLISHED') ? 'publishedItemRevisionStatus' : 'submittedItemRevisionStatus']:
          revision(state, '1.0.10.0')
      }));

      await expect(submit()).resolves.toBe(false);

      expect(actions()).toEqual(['GET fetchStatus']);
    }
  );

  it.each(['publishedItemRevisionStatus', 'submittedItemRevisionStatus'])(
    'refuses an older release when %s has a newer version', async (field) => {
      request.mockResolvedValueOnce(Response.json({
        [field]: revision(field.startsWith('published') ? 'PUBLISHED' : 'PENDING_REVIEW', '1.0.10.1')
      }));

      await expect(submit()).rejects.toThrow('already has newer version 1.0.10.1');

      expect(actions()).toEqual(['GET fetchStatus']);
    }
  );

  it('checks all versions before treating a release as already submitted', async () => {
    request.mockResolvedValueOnce(Response.json({
      publishedItemRevisionStatus: revision('PUBLISHED', '1.0.10'),
      submittedItemRevisionStatus: revision('PENDING_REVIEW', '1.0.11')
    }));

    await expect(submit()).rejects.toThrow('already has newer version 1.0.11');

    expect(actions()).toEqual(['GET fetchStatus']);
  });

  it.each([undefined, 'CANCELLED', 'REJECTED'])(
    'uploads without cancellation when the previous submission is %s', async (state) => {
      request.mockResolvedValueOnce(Response.json({
        submittedItemRevisionStatus: state ? revision(state, '1.0.10') : undefined
      })).mockResolvedValueOnce(Response.json({ uploadState: 'SUCCEEDED' }))
        .mockResolvedValueOnce(Response.json({ state: 'PENDING_REVIEW' }));

      await expect(submit()).resolves.toBe(true);

      expect(actions()).toEqual(['GET fetchStatus', 'POST upload', 'POST publish']);
    }
  );

  it.each([
    { state: 'PENDING_REVIEW' },
    { state: 'PENDING_REVIEW', distributionChannels: [] },
    revision('PENDING_REVIEW', 'unknown')
  ])('does not cancel when the pending version cannot be determined (%j)', async (pending) => {
    request.mockResolvedValueOnce(Response.json({ submittedItemRevisionStatus: pending }));

    await expect(submit()).rejects.toThrow(/Cannot (determine|compare)/);

    expect(actions()).toEqual(['GET fetchStatus']);
  });

  it('does not contact the store if the release archive is missing', async () => {
    await expect(submit({ zipPath: path.join(directory, 'missing.zip') })).rejects.toThrow(/ENOENT/);
    expect(request).not.toHaveBeenCalled();
  });

  it('requires the target version before checking for a replacement', async () => {
    await expect(submit({ releaseVersion: '' })).rejects.toThrow('A release version is required');
    expect(request).not.toHaveBeenCalled();
  });

  it('stops before cancelling or uploading when the status check fails', async () => {
    request.mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));

    await expect(submit()).rejects.toThrow('Chrome status check failed: 503');

    expect(actions()).toEqual(['GET fetchStatus']);
  });

  it('does not upload or retry cancellation when the cancellation quota is exhausted', async () => {
    request.mockResolvedValueOnce(Response.json({ submittedItemRevisionStatus: revision('PENDING_REVIEW', '1.0.9') }))
      .mockResolvedValueOnce(Response.json({ error: 'quota exhausted' }, { status: 429 }));

    await expect(submit()).rejects.toThrow('Chrome review cancellation failed: 429');

    expect(actions()).toEqual(['GET fetchStatus', 'POST cancelSubmission']);
  });

  it('does not publish the old archive if the replacement upload fails', async () => {
    request.mockResolvedValueOnce(Response.json({ submittedItemRevisionStatus: revision('PENDING_REVIEW', '1.0.9') }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ uploadState: 'FAILED' }));

    await expect(submit()).rejects.toThrow('Chrome package upload failed');

    expect(actions()).toEqual(['GET fetchStatus', 'POST cancelSubmission', 'POST upload']);
  });
});

function submit(overrides: Partial<Parameters<typeof submitChromeWebStorePackage>[0]> = {}) {
  return submitChromeWebStorePackage({
    token: 'test-token',
    publisherId: 'test-publisher',
    extensionId: 'test-extension',
    zipPath,
    publishType: undefined,
    releaseVersion: '1.0.10',
    replacePending: true,
    ...overrides
  });
}

function revision(state: string, crxVersion: string) {
  return { state, distributionChannels: [{ crxVersion }] };
}

function actions() {
  return request.mock.calls.map(([url, options]) => `${options?.method || 'GET'} ${String(url).split(':').at(-1)}`);
}
