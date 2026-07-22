import { describe, expect, it, vi } from 'vitest';

describe('content feature dispatcher', () => {
  it('runs every independent message hook once', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const calls: string[] = [];
    const message = document.createElement('yt-live-chat-text-message-renderer');

    dispatcher.registerFeature({
      message: () => calls.push('first')
    });
    dispatcher.registerFeature({
      message: () => calls.push('second')
    });

    dispatcher.handleFeatureMessage(message, { source: 'added' });

    expect(calls).toHaveLength(2);
    expect(calls).toEqual(expect.arrayContaining(['first', 'second']));
  });

  it('passes the source context to a message hook', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const message = document.createElement('yt-live-chat-text-message-renderer');
    let receivedSource = '';

    dispatcher.registerFeature({
      message: (_message, context) => {
        receivedSource = context.source;
      }
    });

    dispatcher.handleFeatureMessage(message, { source: 'changed' });

    expect(receivedSource).toBe('changed');
  });

  it('continues feature dispatch after a hook fails', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const error = new Error('feature failed');
    const originalReportError = (globalThis as { reportError?: (error: unknown) => void }).reportError;
    const reportError = vi.fn();
    (globalThis as { reportError?: (error: unknown) => void }).reportError = reportError;
    const calls: string[] = [];

    try {
      dispatcher.registerFeature({
        message: () => {
          calls.push('message-before');
          throw error;
        }
      });
      dispatcher.registerFeature({
        message: () => calls.push('message-after'),
        page: {
          boot: () => {
            calls.push('boot-before');
            throw error;
          },
          visibleRecovery: () => calls.push('visible-recovery-after')
        }
      });

      dispatcher.handleFeatureMessage(document.createElement('yt-live-chat-text-message-renderer'), { source: 'added' });
      dispatcher.bootFeatures();
      dispatcher.recoverVisibleFeatures();

      expect(calls).toEqual([
        'message-before',
        'message-after',
        'boot-before',
        'visible-recovery-after'
      ]);
      expect(reportError).toHaveBeenCalledWith(error);
    } finally {
      (globalThis as { reportError?: (error: unknown) => void }).reportError = originalReportError;
    }
  });

  it('runs structural mutation hooks once in registration order', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const calls: string[] = [];
    const batch = { addedElements: [], mutations: [] };

    dispatcher.registerFeature({
      mutation: () => calls.push('first')
    });
    dispatcher.registerFeature({
      mutation: () => calls.push('second')
    });

    dispatcher.handleFeatureMutations(batch);

    expect(calls).toEqual(['first', 'second']);
  });

  it('ignores extension-managed observer nodes automatically', async () => {
    vi.resetModules();
    const [{ ytcqCreateElement }, dispatcher] = await Promise.all([
      import('../shared/managed-dom'),
      import('./dispatcher')
    ]);
    const managed = ytcqCreateElement('div');
    const child = document.createElement('span');
    managed.append(child);

    expect(dispatcher.shouldIgnoreFeatureAddedNode(managed)).toBe(true);
    expect(dispatcher.shouldIgnoreFeatureAddedNode(child)).toBe(true);
    expect(dispatcher.shouldIgnoreFeatureMutation(child)).toBe(true);
  });

  it('cleans stale UI and stops normal feature dispatch when suspended', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const cleanup = vi.fn();
    const message = vi.fn();
    const mutation = vi.fn();
    const participant = vi.fn();

    dispatcher.registerFeature({
      page: { cleanup },
      message,
      mutation,
      participant
    });

    dispatcher.suspendFeatures();
    dispatcher.handleFeatureMessage(document.createElement('yt-live-chat-text-message-renderer'), { source: 'added' });
    dispatcher.handleFeatureMutations({
      addedElements: [],
      mutations: []
    });
    dispatcher.handleFeatureParticipant(document.createElement('yt-live-chat-participant-renderer'));

    expect(cleanup).toHaveBeenCalledOnce();
    expect(message).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
    expect(participant).not.toHaveBeenCalled();
  });

  it('runs page lifecycle hooks with their expected arguments', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const init = vi.fn();
    const boot = vi.fn();
    const reset = vi.fn();
    const optionsChanged = vi.fn();
    const visibleRecovery = vi.fn();
    const visibilityChanged = vi.fn();
    const context = { saveOptions: vi.fn() };
    const previousOptions = { targetLanguage: '' } as never;
    const nextOptions = { targetLanguage: 'ja' } as never;

    dispatcher.registerFeature({
      page: {
        init,
        boot,
        reset,
        optionsChanged,
        visibleRecovery,
        visibilityChanged
      }
    });

    dispatcher.initFeatures(context);
    dispatcher.bootFeatures();
    dispatcher.handleFeatureOptionsChanged(previousOptions, nextOptions);
    dispatcher.recoverVisibleFeatures();
    dispatcher.handleFeatureVisibilityChanged('hidden');
    dispatcher.resetFeatures();

    expect(init).toHaveBeenCalledWith(context);
    expect(boot).toHaveBeenCalledOnce();
    expect(optionsChanged).toHaveBeenCalledWith(previousOptions, nextOptions);
    expect(visibleRecovery).toHaveBeenCalledOnce();
    expect(visibilityChanged).toHaveBeenCalledWith('hidden');
    expect(reset).toHaveBeenCalledOnce();
  });

  it('keeps suspension idempotent and blocks every later feature hook', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const cleanup = vi.fn();
    const boot = vi.fn();
    const reset = vi.fn();
    const optionsChanged = vi.fn();
    const visibleRecovery = vi.fn();
    const visibilityChanged = vi.fn();

    dispatcher.registerFeature({
      page: {
        cleanup,
        boot,
        reset,
        optionsChanged,
        visibleRecovery,
        visibilityChanged
      }
    });

    dispatcher.suspendFeatures();
    dispatcher.suspendFeatures();
    dispatcher.bootFeatures();
    dispatcher.handleFeatureOptionsChanged({} as never, {} as never);
    dispatcher.recoverVisibleFeatures();
    dispatcher.handleFeatureVisibilityChanged('visible');
    dispatcher.resetFeatures();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(boot).not.toHaveBeenCalled();
    expect(optionsChanged).not.toHaveBeenCalled();
    expect(visibleRecovery).not.toHaveBeenCalled();
    expect(visibilityChanged).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('uses custom observer ignore hooks only after managed-element checks fail', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const added = document.createElement('div');
    const mutation = document.createElement('span');
    const ordinary = document.createElement('button');
    const ignoreAdded = vi.fn((element: Element) => element === added);
    const ignoreMutation = vi.fn((element: Element) => element === mutation);

    dispatcher.registerFeature({
      observerIgnore: {
        addedNode: ignoreAdded,
        mutation: ignoreMutation
      }
    });

    expect(dispatcher.shouldIgnoreFeatureAddedNode(added)).toBe(true);
    expect(dispatcher.shouldIgnoreFeatureMutation(mutation)).toBe(true);
    expect(dispatcher.shouldIgnoreFeatureAddedNode(ordinary)).toBe(false);
    expect(dispatcher.shouldIgnoreFeatureMutation(ordinary)).toBe(false);
    expect(ignoreAdded).toHaveBeenCalledWith(ordinary);
    expect(ignoreMutation).toHaveBeenCalledWith(ordinary);
  });

  it('treats throwing observer ignore hooks as non-matches', async () => {
    vi.resetModules();
    const dispatcher = await import('./dispatcher');
    const element = document.createElement('div');

    dispatcher.registerFeature({
      observerIgnore: {
        addedNode: () => {
          throw new Error('ignore failed');
        },
        mutation: () => {
          throw new Error('ignore failed');
        }
      }
    });

    expect(dispatcher.shouldIgnoreFeatureAddedNode(element)).toBe(false);
    expect(dispatcher.shouldIgnoreFeatureMutation(element)).toBe(false);
  });
});
