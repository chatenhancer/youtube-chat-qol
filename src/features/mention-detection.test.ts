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

  it('detects messages that mention the current user without matching self-authored messages', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();

    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@OtherViewer', 'hello @CurrentViewer'),
      'ytcqMentionChecked',
      onMention
    );
    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@CurrentViewer', 'hello @CurrentViewer'),
      'ytcqMentionChecked',
      onMention
    );

    expect(onMention).toHaveBeenCalledOnce();
  });

  it('waits for identity discovery before flushing pending mention messages', async () => {
    const mentionDetection = await import('./mention-detection');
    const processor = vi.fn();
    const message = createMessage('@OtherViewer', 'hello @CurrentViewer');

    mentionDetection.registerMentionProcessor(processor);
    mentionDetection.processPotentialMentionForConsumer(message, 'ytcqMentionChecked', vi.fn());

    expect(processor).not.toHaveBeenCalled();

    document.body.append(createIdentitySurface('@CurrentViewer'));
    mentionDetection.initMentionDetection();

    expect(processor).toHaveBeenCalledWith(message);
  });

  it('does not match handles embedded inside longer handle text', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();

    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@OtherViewer', 'hello @CurrentViewerExtra'),
      'ytcqMentionChecked',
      onMention
    );

    expect(onMention).not.toHaveBeenCalled();
  });

  it('continues searching when the first handle occurrence is embedded but a later one is valid', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();

    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@OtherViewer', 'hello @CurrentViewer_name and @CurrentViewer'),
      'ytcqMentionChecked',
      onMention
    );

    expect(onMention).toHaveBeenCalledOnce();
  });

  it('matches handles with punctuation boundaries and ignores messages with no text', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();

    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@OtherViewer', 'hello, @CurrentViewer!'),
      'ytcqMentionChecked',
      onMention
    );
    mentionDetection.processPotentialMentionForConsumer(
      createMessage('@OtherViewer', ''),
      'ytcqMentionChecked',
      onMention
    );

    expect(onMention).toHaveBeenCalledOnce();
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

  it('ignores already-checked and disconnected messages', async () => {
    document.body.append(createIdentitySurface('@CurrentViewer'));
    const mentionDetection = await import('./mention-detection');
    const onMention = vi.fn();
    const checked = createMessage('@OtherViewer', 'hello @CurrentViewer');
    checked.dataset.ytcqMentionChecked = 'true';
    const disconnected = createMessage('@OtherViewer', 'hello @CurrentViewer');
    disconnected.remove();

    mentionDetection.processPotentialMentionForConsumer(checked, 'ytcqMentionChecked', onMention);
    mentionDetection.processPotentialMentionForConsumer(disconnected, 'ytcqMentionChecked', onMention);

    expect(onMention).not.toHaveBeenCalled();
  });

  it('does not flush disconnected pending mention messages after identity discovery', async () => {
    const mentionDetection = await import('./mention-detection');
    const processor = vi.fn();
    const message = createMessage('@OtherViewer', 'hello @CurrentViewer');

    mentionDetection.registerMentionProcessor(processor);
    mentionDetection.processPotentialMentionForConsumer(message, 'ytcqMentionChecked', vi.fn());
    message.remove();
    document.body.append(createIdentitySurface('@CurrentViewer'));
    mentionDetection.initMentionDetection();

    expect(processor).not.toHaveBeenCalled();
  });

  it('caps pending mention messages while waiting for identity discovery', async () => {
    const mentionDetection = await import('./mention-detection');
    const processor = vi.fn();
    mentionDetection.registerMentionProcessor(processor);
    for (let index = 0; index < 45; index += 1) {
      mentionDetection.processPotentialMentionForConsumer(
        createMessage('@OtherViewer', `hello @CurrentViewer ${index}`),
        'ytcqMentionChecked',
        vi.fn()
      );
    }

    document.body.append(createIdentitySurface('@CurrentViewer'));
    mentionDetection.initMentionDetection();

    expect(processor).toHaveBeenCalledTimes(40);
    const processedTexts = processor.mock.calls.map(([message]) => (message as HTMLElement).textContent || '');
    expect(processedTexts.some((text) => text.includes('hello @CurrentViewer 0'))).toBe(false);
  });

  it('refreshes candidates from lifecycle mutation batches', async () => {
    const mentionDetection = await import('./mention-detection');
    const { handleFeatureMutations } = await import('../content/lifecycle');
    mentionDetection.initMentionDetection();
    expect(mentionDetection.getCurrentMentionCandidates()).toEqual([]);

    const surface = createIdentitySurface('@MutationViewer');
    document.body.append(surface);
    handleFeatureMutations({
      addedElements: [surface],
      changedMessages: [],
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
    const { handleFeatureMutations } = await import('../content/lifecycle');
    const unrelated = document.createElement('div');
    document.body.append(unrelated);

    handleFeatureMutations({
      addedElements: [],
      changedMessages: [],
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
    handleFeatureMutations({ addedElements: [], changedMessages: [], mutations: [mutation] });
    handleFeatureMutations({ addedElements: [], changedMessages: [], mutations: [mutation] });
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    await vi.runOnlyPendingTimersAsync();
    expect(mentionDetection.getCurrentMentionCandidates()).toContain('@coalescedviewer');
  });

  it('refreshes identity when character data changes inside the composer identity surface', async () => {
    const surface = createIdentitySurface('@BeforeViewer');
    const author = surface.querySelector('#author-name')!;
    document.body.append(surface);
    const mentionDetection = await import('./mention-detection');
    const { handleFeatureMutations } = await import('../content/lifecycle');
    mentionDetection.initMentionDetection();

    author.textContent = '@AfterViewer';
    handleFeatureMutations({
      addedElements: [],
      changedMessages: [],
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
    const { handleFeatureMutations } = await import('../content/lifecycle');
    const surface = createIdentitySurface('@TargetViewer');
    document.body.append(surface);

    handleFeatureMutations({
      addedElements: [],
      changedMessages: [],
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
    const { handleFeatureMutations } = await import('../content/lifecycle');
    const wrapper = document.createElement('div');
    wrapper.append(createIdentitySurface('@WrappedViewer'));
    document.body.append(wrapper);

    handleFeatureMutations({
      addedElements: [],
      changedMessages: [],
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
    const { cleanupStaleFeatures, handleFeatureMutations } = await import('../content/lifecycle');
    const surface = createIdentitySurface('@CanceledViewer');
    document.body.append(surface);

    handleFeatureMutations({
      addedElements: [],
      changedMessages: [],
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
    cleanupStaleFeatures();
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

function createMessage(authorName: string, text: string): HTMLElement {
  const message = document.createElement('yt-live-chat-text-message-renderer');
  message.innerHTML = `
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  document.body.append(message);
  return message;
}
