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
});
