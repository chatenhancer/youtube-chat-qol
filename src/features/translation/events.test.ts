import { describe, expect, it, vi } from 'vitest';
import {
  emitMessageTranslationCleared,
  emitMessageTranslationRendered,
  emitMessageTranslationsCleared,
  onMessageTranslationCleared,
  onMessageTranslationRendered,
  onMessageTranslationsCleared
} from './events';

describe('translation events', () => {
  it('notifies and unsubscribes rendered listeners', () => {
    const listener = vi.fn();
    const unsubscribe = onMessageTranslationRendered(listener);
    const message = document.createElement('yt-live-chat-text-message-renderer');

    emitMessageTranslationRendered({
      message,
      originalText: 'hola',
      protectedTokens: [],
      result: {
        sourceLanguage: 'es',
        targetLanguage: 'en',
        text: 'hello'
      },
      sourceText: 'hola'
    });
    unsubscribe();
    emitMessageTranslationRendered({
      message,
      originalText: 'hola',
      protectedTokens: [],
      result: {
        sourceLanguage: 'es',
        targetLanguage: 'en',
        text: 'hello again'
      },
      sourceText: 'hola'
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].message).toBe(message);
  });

  it('notifies cleared listeners', () => {
    const cleared = vi.fn();
    const allCleared = vi.fn();
    const unsubscribeCleared = onMessageTranslationCleared(cleared);
    const unsubscribeAllCleared = onMessageTranslationsCleared(allCleared);
    const message = document.createElement('yt-live-chat-text-message-renderer');

    emitMessageTranslationCleared(message);
    emitMessageTranslationsCleared();
    unsubscribeCleared();
    unsubscribeAllCleared();
    emitMessageTranslationCleared(message);
    emitMessageTranslationsCleared();

    expect(cleared).toHaveBeenCalledTimes(1);
    expect(cleared.mock.calls[0][0].message).toBe(message);
    expect(allCleared).toHaveBeenCalledTimes(1);
  });
});
