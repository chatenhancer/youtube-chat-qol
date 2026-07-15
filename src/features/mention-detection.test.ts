import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('current-user mention detection', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.replaceChildren();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives mention candidates from the signed-in chat identity surface', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');

    mentionDetection.initMentionDetection();

    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@currentviewer');
    expect(mentionDetection.isCurrentUserAuthorName('@CurrentViewer')).toBe(true);
    expect(mentionDetection.isCurrentUserAuthorName('@OtherViewer')).toBe(false);
  });

  it('notifies feed consumers when mention candidates become available', async () => {
    const mentionDetection = await import('./mention-detection');
    const listener = vi.fn();
    const unsubscribe = mentionDetection.onMentionCandidatesChanged(listener);

    mentionDetection.initMentionDetection();
    expect(listener).not.toHaveBeenCalled();

    document.body.append(createIdentitySurface('@CurrentViewer'));
    mentionDetection.initMentionDetection();
    expect(listener).toHaveBeenCalledWith(['@currentviewer']);

    unsubscribe();
    document.body.querySelector('#author-name')!.textContent = '@NextViewer';
    mentionDetection.initMentionDetection();
    expect(listener).toHaveBeenCalledOnce();
  });

  it('derives candidates from plain handles and channel URL handles', async () => {
    const surface = document.createElement('yt-live-chat-message-input-renderer');
    surface.innerHTML = `
      <span id="author-name">CurrentViewer</span>
      <span id="author-alt">/@CurrentViewerAlt</span>
      <span id="short">ab</span>
    `;
    document.body.append(surface);
    const mentionDetection = await import('./mention-detection');

    mentionDetection.initMentionDetection();

    expect(mentionDetection.getCurrentMentionCandidates()).toEqual(expect.arrayContaining([
      '@currentviewer',
      '@currentvieweralt'
    ]));
    expect(mentionDetection.getCurrentMentionCandidates()).not.toContain('@ab');
  });

  it('returns a display handle for local-only UI copy', async () => {
    const surface = document.createElement('yt-live-chat-message-input-renderer');
    surface.innerHTML = '<span id="author-name">CurrentViewer</span>';
    document.body.append(surface);
    const mentionDetection = await import('./mention-detection');

    expect(mentionDetection.getCurrentMentionDisplayHandle()).toBe('@CurrentViewer');

    surface.querySelector('#author-name')!.textContent = '/@CurrentViewerAlt';
    expect(mentionDetection.getCurrentMentionDisplayHandle()).toBe('@CurrentViewerAlt');
  });

  it('refreshes candidates from lifecycle mutation batches', async () => {
    const mentionDetection = await import('./mention-detection');
    const { handleFeatureMutations } = await import('../content/feature-runtime');
    mentionDetection.initMentionDetection();
    expect(mentionDetection.getCurrentMentionCandidates()).toEqual([]);

    const surface = createIdentitySurface('@MutationViewer');
    document.body.append(surface);
    handleFeatureMutations({
      addedElements: [surface],
      mutations: [{
        addedNodes: [surface] as unknown as NodeList,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: document.body,
        type: 'childList'
      }]
    });
    await vi.runOnlyPendingTimersAsync();

    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@mutationviewer');
  });

  it('ignores unrelated mutations and coalesces pending identity refreshes', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const mentionDetection = await import('./mention-detection');
    const { handleFeatureMutations } = await import('../content/feature-runtime');
    const unrelated = document.createElement('div');
    document.body.append(unrelated);

    handleFeatureMutations({
      addedElements: [],
      mutations: [{
        addedNodes: [] as unknown as NodeList,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: unrelated,
        type: 'childList'
      }]
    });
    expect(setTimeoutSpy).not.toHaveBeenCalled();

    const surface = createIdentitySurface('@CoalescedViewer');
    document.body.append(surface);
    const mutation = {
      addedNodes: [] as unknown as NodeList,
      attributeName: null,
      attributeNamespace: null,
      nextSibling: null,
      oldValue: null,
      previousSibling: null,
      removedNodes: [] as unknown as NodeList,
      target: surface,
      type: 'childList' as MutationRecordType
    };
    handleFeatureMutations({ addedElements: [], mutations: [mutation] });
    handleFeatureMutations({ addedElements: [], mutations: [mutation] });
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    await vi.runOnlyPendingTimersAsync();
    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@coalescedviewer');
  });

  it('refreshes identity when character data changes inside the composer identity surface', async () => {
    const surface = createIdentitySurface('@BeforeViewer');
    const author = surface.querySelector('#author-name')!;
    document.body.append(surface);
    const mentionDetection = await import('./mention-detection');
    const { handleFeatureMutations } = await import('../content/feature-runtime');
    mentionDetection.initMentionDetection();

    author.textContent = '@AfterViewer';
    handleFeatureMutations({
      addedElements: [],
      mutations: [{
        addedNodes: [] as unknown as NodeList,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: '@BeforeViewer',
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: author.firstChild!,
        type: 'characterData'
      }]
    });
    await vi.runOnlyPendingTimersAsync();

    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@afterviewer');
  });

  it('refreshes identity when the identity container itself is the mutation target', async () => {
    const mentionDetection = await import('./mention-detection');
    const { handleFeatureMutations } = await import('../content/feature-runtime');
    const surface = createIdentitySurface('@TargetViewer');
    document.body.append(surface);

    handleFeatureMutations({
      addedElements: [],
      mutations: [{
        addedNodes: [] as unknown as NodeList,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: surface,
        type: 'childList'
      }]
    });
    await vi.runOnlyPendingTimersAsync();

    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@targetviewer');
  });

  it('refreshes identity when an added wrapper contains an identity surface', async () => {
    const mentionDetection = await import('./mention-detection');
    const { handleFeatureMutations } = await import('../content/feature-runtime');
    const wrapper = document.createElement('div');
    wrapper.append(createIdentitySurface('@WrappedViewer'));
    document.body.append(wrapper);

    handleFeatureMutations({
      addedElements: [],
      mutations: [{
        addedNodes: [wrapper] as unknown as NodeList,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: document.body,
        type: 'childList'
      }]
    });
    await vi.runOnlyPendingTimersAsync();

    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@wrappedviewer');
  });

  it('cancels a pending mention identity refresh during stale cleanup', async () => {
    const mentionDetection = await import('./mention-detection');
    const { cleanupFeatures, handleFeatureMutations } = await import('../content/feature-runtime');
    const surface = createIdentitySurface('@CanceledViewer');
    document.body.append(surface);

    handleFeatureMutations({
      addedElements: [],
      mutations: [{
        addedNodes: [] as unknown as NodeList,
        attributeName: null,
        attributeNamespace: null,
        nextSibling: null,
        oldValue: null,
        previousSibling: null,
        removedNodes: [] as unknown as NodeList,
        target: surface,
        type: 'childList'
      }]
    });
    cleanupFeatures();
    surface.remove();
    await vi.runOnlyPendingTimersAsync();

    expect(mentionDetection.getCurrentMentionCandidates()).toEqual([]);
  });
});

function createIdentitySurface(authorName: string): HTMLElement {
  const surface = document.createElement('yt-live-chat-message-input-renderer');
  surface.innerHTML = `<span id="author-name">${authorName}</span>`;
  return surface;
}
