import { describe, expect, it, vi } from 'vitest';

describe('content feature runtime', () => {
  it('runs every independent message hook once', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const calls: string[] = [];
    const message = document.createElement('yt-live-chat-text-message-renderer');

    lifecycle.registerFeature({
      message: () => calls.push('first')
    });
    lifecycle.registerFeature({
      message: () => calls.push('second')
    });

    lifecycle.handleFeatureMessage(message, { source: 'added' });

    expect(calls).toHaveLength(2);
    expect(calls).toEqual(expect.arrayContaining(['first', 'second']));
  });

  it('passes the source context to a message hook', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const message = document.createElement('yt-live-chat-text-message-renderer');
    let receivedSource = '';

    lifecycle.registerFeature({
      message: (_message, context) => {
        receivedSource = context.source;
      }
    });

    lifecycle.handleFeatureMessage(message, { source: 'changed' });

    expect(receivedSource).toBe('changed');
  });

  it('continues runtime dispatch after feature hook failures', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const error = new Error('feature failed');
    const originalReportError = (globalThis as { reportError?: (error: unknown) => void }).reportError;
    const reportError = vi.fn();
    (globalThis as { reportError?: (error: unknown) => void }).reportError = reportError;
    const calls: string[] = [];

    try {
      lifecycle.registerFeature({
        message: () => {
          calls.push('message-before');
          throw error;
        }
      });
      lifecycle.registerFeature({
        message: () => calls.push('message-after'),
        page: {
          boot: () => {
            calls.push('boot-before');
            throw error;
          },
          visibleRecovery: () => calls.push('visible-recovery-after')
        }
      });

      lifecycle.handleFeatureMessage(document.createElement('yt-live-chat-text-message-renderer'), { source: 'added' });
      lifecycle.bootFeatures();
      lifecycle.recoverVisibleFeatures();

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
    const lifecycle = await import('./feature-runtime');
    const calls: string[] = [];
    const batch = { addedElements: [], mutations: [] };

    lifecycle.registerFeature({
      mutation: () => calls.push('first')
    });
    lifecycle.registerFeature({
      mutation: () => calls.push('second')
    });

    lifecycle.handleFeatureMutations(batch);

    expect(calls).toEqual(['first', 'second']);
  });

  it('ignores extension-managed observer nodes automatically', async () => {
    vi.resetModules();
    const [{ ytcqCreateElement }, lifecycle] = await Promise.all([
      import('../shared/managed-dom'),
      import('./feature-runtime')
    ]);
    const managed = ytcqCreateElement('div');
    const child = document.createElement('span');
    managed.append(child);

    expect(lifecycle.shouldIgnoreFeatureAddedNode(managed)).toBe(true);
    expect(lifecycle.shouldIgnoreFeatureAddedNode(child)).toBe(true);
    expect(lifecycle.shouldIgnoreFeatureMutation(child)).toBe(true);
  });

  it('cleans stale UI and stops normal feature dispatch when suspended', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const cleanup = vi.fn();
    const message = vi.fn();
    const mutation = vi.fn();
    const participant = vi.fn();

    lifecycle.registerFeature({
      page: { cleanup },
      message,
      mutation,
      participant
    });

    lifecycle.suspendFeatures();
    lifecycle.handleFeatureMessage(document.createElement('yt-live-chat-text-message-renderer'), { source: 'added' });
    lifecycle.handleFeatureMutations({
      addedElements: [],
      mutations: []
    });
    lifecycle.handleFeatureParticipant(document.createElement('yt-live-chat-participant-renderer'));

    expect(cleanup).toHaveBeenCalledOnce();
    expect(message).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
    expect(participant).not.toHaveBeenCalled();
  });

  it('runs page lifecycle hooks with their expected arguments', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const init = vi.fn();
    const boot = vi.fn();
    const reset = vi.fn();
    const optionsChanged = vi.fn();
    const visibleRecovery = vi.fn();
    const visibilityChanged = vi.fn();
    const context = { saveOptions: vi.fn() };
    const previousOptions = { targetLanguage: '' } as never;
    const nextOptions = { targetLanguage: 'ja' } as never;

    lifecycle.registerFeature({
      page: {
        init,
        boot,
        reset,
        optionsChanged,
        visibleRecovery,
        visibilityChanged
      }
    });

    lifecycle.initFeatures(context);
    lifecycle.bootFeatures();
    lifecycle.handleFeatureOptionsChanged(previousOptions, nextOptions);
    lifecycle.recoverVisibleFeatures();
    lifecycle.handleFeatureVisibilityChanged('hidden');
    lifecycle.resetFeatures();

    expect(init).toHaveBeenCalledWith(context);
    expect(boot).toHaveBeenCalledOnce();
    expect(optionsChanged).toHaveBeenCalledWith(previousOptions, nextOptions);
    expect(visibleRecovery).toHaveBeenCalledOnce();
    expect(visibilityChanged).toHaveBeenCalledWith('hidden');
    expect(reset).toHaveBeenCalledOnce();
  });

  it('keeps suspension idempotent and blocks every later feature hook', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const cleanup = vi.fn();
    const boot = vi.fn();
    const reset = vi.fn();
    const optionsChanged = vi.fn();
    const visibleRecovery = vi.fn();
    const visibilityChanged = vi.fn();

    lifecycle.registerFeature({
      page: {
        cleanup,
        boot,
        reset,
        optionsChanged,
        visibleRecovery,
        visibilityChanged
      }
    });

    lifecycle.suspendFeatures();
    lifecycle.suspendFeatures();
    lifecycle.bootFeatures();
    lifecycle.handleFeatureOptionsChanged({} as never, {} as never);
    lifecycle.recoverVisibleFeatures();
    lifecycle.handleFeatureVisibilityChanged('visible');
    lifecycle.resetFeatures();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(boot).not.toHaveBeenCalled();
    expect(optionsChanged).not.toHaveBeenCalled();
    expect(visibleRecovery).not.toHaveBeenCalled();
    expect(visibilityChanged).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('uses custom observer ignore hooks only after managed-element checks fail', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const added = document.createElement('div');
    const mutation = document.createElement('span');
    const ordinary = document.createElement('button');
    const ignoreAdded = vi.fn((element: Element) => element === added);
    const ignoreMutation = vi.fn((element: Element) => element === mutation);

    lifecycle.registerFeature({
      observerIgnore: {
        addedNode: ignoreAdded,
        mutation: ignoreMutation
      }
    });

    expect(lifecycle.shouldIgnoreFeatureAddedNode(added)).toBe(true);
    expect(lifecycle.shouldIgnoreFeatureMutation(mutation)).toBe(true);
    expect(lifecycle.shouldIgnoreFeatureAddedNode(ordinary)).toBe(false);
    expect(lifecycle.shouldIgnoreFeatureMutation(ordinary)).toBe(false);
    expect(ignoreAdded).toHaveBeenCalledWith(ordinary);
    expect(ignoreMutation).toHaveBeenCalledWith(ordinary);
  });

  it('treats throwing observer ignore hooks as non-matches', async () => {
    vi.resetModules();
    const lifecycle = await import('./feature-runtime');
    const element = document.createElement('div');

    lifecycle.registerFeature({
      observerIgnore: {
        addedNode: () => {
          throw new Error('ignore failed');
        },
        mutation: () => {
          throw new Error('ignore failed');
        }
      }
    });

    expect(lifecycle.shouldIgnoreFeatureAddedNode(element)).toBe(false);
    expect(lifecycle.shouldIgnoreFeatureMutation(element)).toBe(false);
  });
});
