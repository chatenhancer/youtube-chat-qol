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

  it('queues added messages and late text mutations only when translation is enabled', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    const messageData = Promise.resolve(null);

    lifecycle.message?.render?.(message, { messageData, source: 'added' });
    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();

    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ko' });
    lifecycle.message?.render?.(message, { messageData, source: 'existing' });
    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();

    lifecycle.message?.render?.(message, { messageData, source: 'added' });
    lifecycle.message?.render?.(message, { messageData, source: 'changed' });

    expect(queueMocks.queueMessageTranslation).toHaveBeenCalledTimes(2);
  });

  it('backfills initial Lite rows without reprocessing native history', () => {
    const nativeMessage = document.createElement('yt-live-chat-text-message-renderer');
    const liteMessage = document.createElement('article');
    liteMessage.classList.add('ytcq-lite-message');
    const context = {
      messageData: Promise.resolve(null),
      source: 'existing' as const
    };
    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja' });

    lifecycle.message?.render?.(nativeMessage, context);
    lifecycle.message?.render?.(liteMessage, context);

    expect(queueMocks.queueMessageTranslation).toHaveBeenCalledTimes(1);
    expect(queueMocks.queueMessageTranslation).toHaveBeenCalledWith(liteMessage, {
      backfill: true
    });
  });

  it('does not requeue changed messages that already have a translation key', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.dataset.ytcqTranslationKey = 'existing-key';
    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ko' });

    lifecycle.message?.render?.(message, {
      messageData: Promise.resolve(null),
      source: 'changed'
    });

    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();
  });
});
