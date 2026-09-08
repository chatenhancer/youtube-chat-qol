import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppStoreConnectError, appStoreConnectFetch } from './lib/app-store-connect.ts';

vi.mock('./lib/app-store-connect.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/app-store-connect.ts')>(),
  appStoreConnectFetch: vi.fn(),
  getAppStoreConnectConfig: vi.fn(async () => ({}))
}));
vi.mock('./lib/local-env.ts', async (importOriginal) => ({
  ...await importOriginal<typeof import('./lib/local-env.ts')>(),
  loadLocalEnv: vi.fn(async () => {})
}));
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));

const request = vi.mocked(appStoreConnectFetch);
const versionPath = '/v1/appStoreVersions/pending-version';
const submissionPath = '/v1/reviewSubmissions/old-review';

describe('Mac App Store publishing', () => {
  beforeEach(() => {
    vi.resetModules();
    request.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((code) => { throw new Error(`exit:${code}`); });
    vi.stubEnv('YTCQ_SAFARI_BUNDLE_ID', 'test.example.safari');
    vi.stubEnv('YTCQ_SAFARI_MARKETING_VERSION', '1.0.2');
    vi.stubEnv('YTCQ_SAFARI_BUILD_NUMBER', '20260908000000');
    vi.stubEnv('YTCQ_APP_STORE_PLATFORM', 'MAC_OS');
    vi.stubEnv('YTCQ_APP_STORE_RELEASE_TYPE', 'AFTER_APPROVAL');
    vi.stubEnv('YTCQ_APP_STORE_WHATS_NEW', 'Release notes');
    vi.stubEnv('YTCQ_APP_STORE_USES_NON_EXEMPT_ENCRYPTION', 'false');
    vi.stubEnv('YTCQ_APP_STORE_BUILD_WAIT_ATTEMPTS', '1');
    vi.stubEnv('YTCQ_APP_STORE_BUILD_WAIT_SECONDS', '1');
    vi.stubEnv('YTCQ_APP_STORE_REPLACE_PENDING', 'true');
  });

  afterEach(() => vi.unstubAllEnvs());

  it.each(['WAITING_FOR_REVIEW', 'IN_REVIEW', 'WAITING_FOR_EXPORT_COMPLIANCE'])(
    'replaces a %s version and submits its new version number and build', async (state) => {
      const store = mockStore();
      store.version.attributes.appStoreState = state;
      await publish();

      expect(store.version.attributes.versionString).toBe('1.0.2');
      expect(store.version.attributes.appStoreState).toBe('WAITING_FOR_REVIEW');
      expect(store.attachedBuild).toBe('new-build');
      const changes = writes();
      const cancel = changes.findIndex(({ body }) => body?.data?.attributes?.canceled);
      const detach = changes.findIndex(({ path, body }) => path.endsWith('/relationships/build') && body.data === null);
      const rename = changes.findIndex(({ body }) => body?.data?.attributes?.versionString);
      const attach = changes.findIndex(({ path, body }) => path.endsWith('/relationships/build') && body.data?.id === 'new-build');
      const submit = changes.findIndex(({ body }) => body?.data?.attributes?.submitted);
      expect(cancel).toBeGreaterThan(0);
      expect(detach).toBeGreaterThan(cancel);
      expect(rename).toBeGreaterThan(detach);
      expect(attach).toBeGreaterThan(rename);
      expect(submit).toBeGreaterThan(attach);
      expect(changes[rename]).toMatchObject({
        path: versionPath,
        method: 'PATCH',
        body: { data: { id: 'pending-version', type: 'appStoreVersions', attributes: { versionString: '1.0.2' } } }
      });
      expect(changes.some(({ method, path }) => method === 'POST' && path === '/v1/appStoreVersions')).toBe(false);
      expect(changes.some(({ path }) => /screenshots|appStoreReviewDetails/.test(path))).toBe(false);
      expect(changes.filter(({ path }) => path === '/v1/builds/new-build')).toEqual([
        expect.objectContaining({ method: 'PATCH', body: { data: {
          type: 'builds', id: 'new-build', attributes: { usesNonExemptEncryption: false }
        } } })
      ]);
    }
  );

  it.each(['PENDING_DEVELOPER_RELEASE', 'PENDING_APPLE_RELEASE'])(
    'removes a %s version after its review has completed', async (state) => {
      const store = mockStore();
      store.version.attributes.appStoreState = state;
      store.review.attributes.state = 'COMPLETE';
      await publish();
      expect(writes()).toContainEqual({ path: '/v1/appStoreVersionSubmissions/version-submission', method: 'DELETE', body: undefined });
      expect(store.version.attributes.versionString).toBe('1.0.2');
    }
  );

  it('resumes an already rejected version without canceling it again', async () => {
    const store = mockStore();
    store.version.attributes.appStoreState = 'DEVELOPER_REJECTED';
    store.review.attributes.state = 'COMPLETE';
    await publish();
    expect(writes().some(({ body }) => body?.data?.attributes?.canceled)).toBe(false);
    expect(store.attachedBuild).toBe('new-build');
  });

  it('waits for an interrupted cancellation to complete even if the version is already editable', async () => {
    const store = mockStore();
    store.version.attributes.appStoreState = 'DEVELOPER_REJECTED';
    store.review.attributes.state = 'CANCELING';
    store.cancellationReads = 2;
    await publish();
    expect(writes().some(({ body }) => body?.data?.attributes?.canceled)).toBe(false);
    expect(store.cancellationReads).toBe(0);
    expect(store.attachedBuild).toBe('new-build');
  });

  it('removes a draft review item before changing its version', async () => {
    const store = mockStore();
    store.version.attributes.appStoreState = 'READY_FOR_REVIEW';
    store.review.attributes.state = 'READY_FOR_REVIEW';
    await publish();
    expect(writes()).toContainEqual({ path: '/v1/reviewSubmissionItems/old-item', method: 'DELETE', body: undefined });
    expect(store.attachedBuild).toBe('new-build');
  });

  it('finds the pending version through review items when its shortcut relationship is absent', async () => {
    const store = mockStore();
    store.review.relationships.appStoreVersionForReview.data = null;
    await publish();
    expect(writes()).toContainEqual(expect.objectContaining({ path: submissionPath, body: {
      data: { id: 'old-review', type: 'reviewSubmissions', attributes: { canceled: true } }
    } }));
  });

  it.each(['INVALID', 'PROCESSING', ''])('leaves the pending release intact when the replacement build is %s', async (state) => {
    const store = mockStore();
    store.build.attributes.processingState = state;
    await expect(publish()).rejects.toThrow(/processing/);
    expect(writes()).toEqual([]);
    expect(store.version.attributes.appStoreState).toBe('WAITING_FOR_REVIEW');
  });

  it.each(['1.0.1', ''])('requires the replacement build to belong to the requested marketing version (received %s)', async (version) => {
    const store = mockStore();
    store.buildVersion.attributes.version = version;
    await expect(publish()).rejects.toThrow(/did not finish processing/);
    expect(writes()).toEqual([]);
  });

  it('leaves same-version reruns already in review unchanged', async () => {
    const store = mockStore();
    store.version.attributes.versionString = '1.0.2';
    await expect(publish()).rejects.toThrow('exit:0');
    expect(writes()).toEqual([]);
  });

  it('preserves local publishing behavior unless replacement is explicitly enabled', async () => {
    vi.stubEnv('YTCQ_APP_STORE_REPLACE_PENDING', '');
    mockStore();
    await expect(publish()).rejects.toThrow('A pending version already exists');
    expect(writes().some(({ path }) => path === submissionPath || path.startsWith(versionPath))).toBe(false);
  });

  it.each(['WAITING_FOR_REVIEW', 'READY_FOR_SALE'])('refuses an older tag when a newer version is %s', async (state) => {
    const store = mockStore();
    store.version.attributes.versionString = '1.0.10';
    store.version.attributes.appStoreState = state;
    await expect(publish()).rejects.toThrow('already has newer version 1.0.10');
    expect(writes().some(({ path }) => path.startsWith('/v1/appStoreVersions/') || path.startsWith('/v1/review'))).toBe(false);
  });

  it('checks subsequent version pages before replacing an older pending version', async () => {
    const store = mockStore();
    store.nextVersions.push({ ...structuredClone(store.version), id: 'newer-version', attributes: {
      ...store.version.attributes, versionString: '1.0.10'
    } });
    await expect(publish()).rejects.toThrow('already has newer version 1.0.10');
    expect(writes().some(({ path }) => path === submissionPath)).toBe(false);
  });

  it('creates a new version while leaving a released version untouched', async () => {
    const store = mockStore();
    store.version.attributes.appStoreState = 'READY_FOR_SALE';
    const released = structuredClone(store.version);
    await publish();
    expect(store.versions[0]).toEqual(released);
    expect(writes()).toContainEqual(expect.objectContaining({ method: 'POST', path: '/v1/appStoreVersions' }));
    expect(writes().some(({ path }) => path.startsWith(versionPath))).toBe(false);
  });

  it('does not cancel unrelated items in the same review submission', async () => {
    const store = mockStore();
    store.items.push({ id: 'other-item', relationships: {} });
    await expect(publish()).rejects.toThrow('contains other items');
    expect(writes().some(({ path }) => path === submissionPath)).toBe(false);
  });

  it('stops when Apple refuses cancellation, without detaching or renaming the version', async () => {
    const store = mockStore();
    store.rejectCancellation = true;
    await expect(publish()).rejects.toThrow('Cancellation denied');
    expect(store.version.attributes.versionString).toBe('1.0.1');
    expect(store.attachedBuild).toBe('old-build');
    expect(writes().some(({ path }) => path.startsWith(versionPath))).toBe(false);
  });

  it('bounds cancellation polling and leaves the version and build intact on timeout', async () => {
    const store = mockStore();
    store.cancellationReads = Infinity;
    await expect(publish()).rejects.toThrow('still not editable after cancellation');
    expect(request.mock.calls.filter(([, path, options]) => path === submissionPath && !options?.method)).toHaveLength(20);
    expect(store.version.attributes.versionString).toBe('1.0.1');
    expect(store.attachedBuild).toBe('old-build');
  });
});

async function publish() {
  await import('./submit-safari-app-store.ts');
}

function writes() {
  return request.mock.calls.filter(([, , options]) => options?.method && options.method !== 'GET')
    .map(([, path, options]) => ({ path, method: options.method, body: options.body }));
}

function mockStore() {
  const version = { id: 'pending-version', type: 'appStoreVersions', attributes: {
    platform: 'MAC_OS', versionString: '1.0.1', appStoreState: 'WAITING_FOR_REVIEW'
  } };
  const review = { id: 'old-review', type: 'reviewSubmissions', attributes: { state: 'WAITING_FOR_REVIEW' },
    relationships: { appStoreVersionForReview: { data: { id: version.id } } }
  };
  const store = {
    version,
    versions: [version],
    nextVersions: [] as typeof version[],
    review,
    reviews: [review],
    items: [{ id: 'old-item', relationships: { appStoreVersion: { data: { id: version.id } } } }] as {
      id: string; relationships: { appStoreVersion?: { data: { id: string } } }
    }[],
    attachedBuild: 'old-build',
    cancellationReads: 1,
    rejectCancellation: false,
    buildVersion: { id: 'build-version', type: 'preReleaseVersions', attributes: { version: '1.0.2' } },
    build: { id: 'new-build', type: 'builds', attributes: { version: '20260908000000', processingState: 'VALID' },
      relationships: { preReleaseVersion: { data: { id: 'build-version', type: 'preReleaseVersions' } } }
    }
  };
  request.mockImplementation(async (_config, resourcePath, options = {}) => {
    const url = new URL(resourcePath, 'https://example.test');
    const path = url.pathname;
    const method = options.method || 'GET';
    const resource = options.body?.data;
    const respond = (data) => structuredClone({ data });
    const target = store.versions.find(({ id }) => path === `/v1/appStoreVersions/${id}`);

    if (method === 'GET') {
      if (path === '/v1/apps') return respond([{ id: 'app', attributes: { name: 'Test app' } }]);
      if (path === '/v1/apps/app/appStoreVersions') {
        const exact = url.searchParams.get('filter[versionString]');
        if (exact) return respond(store.versions.filter(({ attributes }) => attributes.versionString === exact));
        if (url.searchParams.has('cursor')) return respond(store.nextVersions);
        return { ...respond(store.versions), links: {
          next: store.nextVersions.length ? 'https://example.test/v1/apps/app/appStoreVersions?cursor=next' : null
        } };
      }
      if (path === '/v1/builds') return { ...respond([store.build]), included: [structuredClone(store.buildVersion)] };
      if (path === '/v1/reviewSubmissions') {
        const states = url.searchParams.get('filter[state]')?.split(',') || [];
        return respond(store.reviews.filter(({ attributes }) => states.includes(attributes.state)));
      }
      if (path.endsWith('/items')) return respond(path.startsWith(submissionPath) ? store.items : []);
      if (path.endsWith('/appStoreVersionLocalizations')) return respond([{ id: 'localization' }]);
      if (path.endsWith('/appStoreVersionSubmission')) return respond({ id: 'version-submission' });
      if (target) return respond(target);
      if (path === submissionPath) {
        if (review.attributes.state === 'CANCELING') {
          if (store.cancellationReads > 0) store.cancellationReads -= 1;
          else {
            review.attributes.state = 'COMPLETE';
            version.attributes.appStoreState = 'DEVELOPER_REJECTED';
          }
        }
        return respond(review);
      }
    }
    if (method === 'PATCH') {
      if (path === submissionPath && resource.attributes?.canceled) {
        if (store.rejectCancellation) throw new AppStoreConnectError('Cancellation denied', { status: 403 });
        review.attributes.state = 'CANCELING';
        return respond(review);
      }
      if (path.endsWith('/relationships/build')) {
        expect(review.attributes.state).not.toBe('CANCELING');
        store.attachedBuild = resource?.id || null;
        return respond(resource);
      }
      if (target) {
        if (resource.attributes.versionString) expect(store.attachedBuild).toBeNull();
        Object.assign(target.attributes, resource.attributes);
        return respond(target);
      }
      if (path.startsWith('/v1/builds/') || path.startsWith('/v1/appStoreVersionLocalizations/')) return respond(resource);
      if (path.startsWith('/v1/reviewSubmissions/') && resource.attributes.submitted) {
        store.version.attributes.appStoreState = 'WAITING_FOR_REVIEW';
        return respond(resource);
      }
    }
    if (method === 'DELETE') {
      if (path === '/v1/reviewSubmissionItems/old-item') {
        store.items = [];
        version.attributes.appStoreState = 'PREPARE_FOR_SUBMISSION';
        review.relationships.appStoreVersionForReview.data = null;
        return null;
      }
      if (path === '/v1/appStoreVersionSubmissions/version-submission') {
        version.attributes.appStoreState = 'DEVELOPER_REJECTED';
        return null;
      }
    }
    if (method === 'POST') {
      if (path === '/v1/appStoreVersions') {
        if (store.versions.some(({ attributes }) => attributes.appStoreState !== 'READY_FOR_SALE')) {
          throw new AppStoreConnectError('A pending version already exists', { status: 409 });
        }
        store.version = { ...resource, id: 'new-version', attributes: { ...resource.attributes, appStoreState: 'PREPARE_FOR_SUBMISSION' } };
        store.versions.push(store.version);
        return respond(store.version);
      }
      if (path === '/v1/reviewSubmissions') {
        const newReview = { ...resource, id: 'new-review', attributes: { state: 'READY_FOR_REVIEW' } };
        store.reviews.push(newReview);
        return respond(newReview);
      }
      if (path === '/v1/reviewSubmissionItems') return respond({ ...resource, id: 'new-item' });
    }
    throw new Error(`Unexpected App Store Connect request: ${method} ${resourcePath}`);
  });
  return store;
}
