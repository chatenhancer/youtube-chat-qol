import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import type { ContentFeature } from '../../content/feature-runtime';

const lifecycleMocks = vi.hoisted(() => ({
  registerFeature: vi.fn()
}));

const queueMocks = vi.hoisted(() => ({
  clearTranslations: vi.fn(),
  queueMessageTranslation: vi.fn(),
  queueRetroactiveTranslations: vi.fn()
}));

vi.mock('../../content/feature-runtime', () => lifecycleMocks);
vi.mock('./queue', () => queueMocks);

describe('translation feature runtime wiring', () => {
  let feature: ContentFeature;
  let setCurrentOptions: typeof import('../../shared/state').setOptions;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    ({ setOptions: setCurrentOptions } = await import('../../shared/state'));
    setCurrentOptions({ ...DEFAULT_OPTIONS });
    await import('./index');
    feature = lifecycleMocks.registerFeature.mock.calls[0][0] as ContentFeature;
  });

  it('registers boot, cleanup, reset, and visible recovery translation hooks', () => {
    feature.page?.boot?.();
    feature.page?.cleanup?.();
    feature.page?.reset?.();
    feature.page?.visibleRecovery?.();

    expect(queueMocks.queueRetroactiveTranslations).toHaveBeenCalledTimes(2);
    expect(queueMocks.clearTranslations).toHaveBeenCalledTimes(2);
  });

  it('clears and backfills when target language or display changes', () => {
    feature.page?.optionsChanged?.(
      { ...DEFAULT_OPTIONS },
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' }
    );
    feature.page?.optionsChanged?.(
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' },
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' }
    );
    feature.page?.optionsChanged?.(
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' },
      { ...DEFAULT_OPTIONS, targetLanguage: 'ja' }
    );

    expect(queueMocks.clearTranslations).toHaveBeenCalledTimes(2);
    expect(queueMocks.queueRetroactiveTranslations).toHaveBeenCalledTimes(2);
  });

  it('queues added messages and late text mutations only when translation is enabled', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');

    feature.message?.(message, { source: 'added' });
    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();

    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ko' });
    feature.message?.(message, { source: 'existing' });
    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();

    feature.message?.(message, { source: 'added' });
    feature.message?.(message, { source: 'changed' });

    expect(queueMocks.queueMessageTranslation).toHaveBeenCalledTimes(2);
  });

  it('backfills initial Lite rows without reprocessing native history', () => {
    const nativeMessage = document.createElement('yt-live-chat-text-message-renderer');
    const liteMessage = document.createElement('article');
    liteMessage.classList.add('ytcq-lite-message');
    const context = { source: 'existing' as const };
    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja' });

    feature.message?.(nativeMessage, context);
    feature.message?.(liteMessage, context);

    expect(queueMocks.queueMessageTranslation).toHaveBeenCalledTimes(1);
    expect(queueMocks.queueMessageTranslation).toHaveBeenCalledWith(liteMessage, {
      backfill: true
    });
  });

  it('does not requeue changed messages that already have a translation key', () => {
    const message = document.createElement('yt-live-chat-text-message-renderer');
    message.dataset.ytcqTranslationKey = 'existing-key';
    setCurrentOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ko' });

    feature.message?.(message, {
      source: 'changed'
    });

    expect(queueMocks.queueMessageTranslation).not.toHaveBeenCalled();
  });
});
