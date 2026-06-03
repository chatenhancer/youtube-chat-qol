import { describe, expect, it, vi } from 'vitest';

describe('content feature lifecycle', () => {
  it('runs message hooks by lifecycle phase, not registration order', async () => {
    vi.resetModules();
    const lifecycle = await import('./lifecycle');
    const calls: string[] = [];
    const message = document.createElement('yt-live-chat-text-message-renderer');

    lifecycle.registerFeatureLifecycle({
      message: {
        render: () => calls.push('first-render')
      }
    });
    lifecycle.registerFeatureLifecycle({
      message: {
        collect: () => calls.push('second-collect'),
        enhance: () => calls.push('second-enhance')
      }
    });

    lifecycle.handleFeatureMessage(message, { allowTranslate: true });

    expect(calls).toEqual(['second-collect', 'second-enhance', 'first-render']);
  });

  it('ignores extension-managed observer nodes automatically', async () => {
    vi.resetModules();
    const [{ ytcqCreateElement }, lifecycle] = await Promise.all([
      import('../shared/managed-dom'),
      import('./lifecycle')
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
    const lifecycle = await import('./lifecycle');
    const cleanupStale = vi.fn();
    const message = vi.fn();
    const mutation = vi.fn();
    const participant = vi.fn();

    lifecycle.registerFeatureLifecycle({
      page: { cleanupStale },
      message: { enhance: message },
      mutation: { enhance: mutation },
      participant: { enhance: participant }
    });

    lifecycle.suspendFeatures();
    lifecycle.handleFeatureMessage(document.createElement('yt-live-chat-text-message-renderer'), { allowTranslate: true });
    lifecycle.handleFeatureMutations({
      addedElements: [],
      changedMessages: [],
      mutations: []
    });
    lifecycle.handleFeatureParticipant(document.createElement('yt-live-chat-participant-renderer'));

    expect(cleanupStale).toHaveBeenCalledOnce();
    expect(message).not.toHaveBeenCalled();
    expect(mutation).not.toHaveBeenCalled();
    expect(participant).not.toHaveBeenCalled();
  });

  it('runs page lifecycle hooks with their expected arguments', async () => {
    vi.resetModules();
    const lifecycle = await import('./lifecycle');
    const init = vi.fn();
    const boot = vi.fn();
    const reset = vi.fn();
    const optionsChanged = vi.fn();
    const visibleRecovery = vi.fn();
    const visibilityChanged = vi.fn();
    const context = { saveOptions: vi.fn() };
    const previousOptions = { targetLanguage: '' } as never;
    const nextOptions = { targetLanguage: 'ja' } as never;

    lifecycle.registerFeatureLifecycle({
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

  it('keeps suspension idempotent and leaves reset and visibility hooks callable', async () => {
    vi.resetModules();
    const lifecycle = await import('./lifecycle');
    const cleanupStale = vi.fn();
    const boot = vi.fn();
    const reset = vi.fn();
    const optionsChanged = vi.fn();
    const visibleRecovery = vi.fn();
    const visibilityChanged = vi.fn();

    lifecycle.registerFeatureLifecycle({
      page: {
        cleanupStale,
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

    expect(cleanupStale).toHaveBeenCalledOnce();
    expect(boot).not.toHaveBeenCalled();
    expect(optionsChanged).not.toHaveBeenCalled();
    expect(visibleRecovery).not.toHaveBeenCalled();
    expect(visibilityChanged).toHaveBeenCalledWith('visible');
    expect(reset).toHaveBeenCalledOnce();
  });

  it('uses custom observer ignore hooks only after managed-element checks fail', async () => {
    vi.resetModules();
    const lifecycle = await import('./lifecycle');
    const added = document.createElement('div');
    const mutation = document.createElement('span');
    const ordinary = document.createElement('button');
    const ignoreAdded = vi.fn((element: Element) => element === added);
    const ignoreMutation = vi.fn((element: Element) => element === mutation);

    lifecycle.registerFeatureLifecycle({
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
});
