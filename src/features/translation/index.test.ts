import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import type { FeatureLifecycle } from '../../content/lifecycle';

const lifecycleMocks = vi.hoisted(() => ({
  registerFeatureLifecycle: vi.fn()
}));

const queueMocks = vi.hoisted(() => ({
  clearTranslations: vi.fn(),
  queueMessageTranslation: vi.fn(),
  queueRetroactiveTranslations: vi.fn()
}));

vi.mock('../../content/lifecycle', () => lifecycleMocks);
vi.mock('./queue', () => queueMocks);

describe('translation feature lifecycle wiring', () => {
  let lifecycle: FeatureLifecycle;
  let setCurrentOptions: typeof import('../../shared/state').setOptions;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    ({ setOptions: setCurrentOptions } = await import('../../shared/state'));
    setCurrentOptions({ ...DEFAULT_OPTIONS });
    await import('./index');
    lifecycle = lifecycleMocks.registerFeatureLifecycle.mock.calls[0][0] as FeatureLifecycle;
  });

  it('registers boot, cleanup, reset, and visible recovery translation hooks', () => {
    lifecycle.page?.boot?.();
    lifecycle.page?.cleanupStale?.();
    lifecycle.page?.reset?.();
    lifecycle.page?.visibleRecovery?.();

    expect(queueMocks.queueRetroactiveTranslations).toHaveBeenCalledTimes(2);
    expect(queueMocks.clearTranslations).toHaveBeenCalledTimes(2);
  });

  it('clears and backfills when target language or display changes', () => {
    lifecycle.page?.optionsChanged?.(
      { ...DEFAULT_OPTIONS },
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' }
    );
    lifecycle.page?.optionsChanged?.(
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' },
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' }
    );
    lifecycle.page?.optionsChanged?.(
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' },
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' }
    );

    expect(queueMocks.clearTranslations).toHaveBeenCalledTimes(2);
    expect(queueMocks.queueRetroactiveTranslations).toHaveBeenCalledTimes(2);
  });

  it('queues live messages and late text mutations only when translation is enabled', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const messageData = Promise.resolve(null);

    lifecycle.message?.render?.(message, { allowTranslate: true, messageData });
    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();

    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ko' });
    lifecycle.message?.render?.(message, { allowTranslate: false, messageData });
    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();

    lifecycle.message?.render?.(message, { allowTranslate: true, messageData });
    lifecycle.mutation?.render?.({ addedElements: [], changedMessages: [message], mutations: [] });

    expect(queueMocks.queueMessageTranslation).toHaveBeenCalledTimes(2);
  });

  it('does not requeue mutation messages that already have a translation key', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.dataset.ytcqTranslationKey = 'existing-key';
    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ko' });

    lifecycle.mutation?.render?.({ addedElements: [], changedMessages: [message], mutations: [] });

    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();
  });
});
