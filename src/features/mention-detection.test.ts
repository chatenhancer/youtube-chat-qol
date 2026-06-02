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
});

function createIdentitySurface(authorName: string): HTMLElement {
  const surface = document.createElement('yt-live-chat-message-input-renderer');
  surface.innerHTML = `<span id="author-name">${authorName}</span>`;
  return surface;
}

function createMessage(authorName: string, text: string): HTMLElement & {
  data?: {
    authorName: { simpleText: string };
    message: { runs: { text: string }[] };
  };
} {
  const message = document.createElement('yt-live-chat-text-message-renderer') as HTMLElement & {
    data?: {
      authorName: { simpleText: string };
      message: { runs: { text: string }[] };
    };
  };
  message.data = {
    authorName: { simpleText: authorName },
    message: { runs: [{ text }] }
  };
  message.innerHTML = `
    <span id="author-name">${authorName}</span>
    <span id="message">${text}</span>
  `;
  document.body.append(message);
  return message;
}
