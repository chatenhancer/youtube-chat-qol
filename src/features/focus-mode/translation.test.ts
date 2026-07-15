import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../../shared/options';
import { setOptions } from '../../shared/state';
import { renderFocusMessageText } from './translation';
import type { FocusRecord } from './types';

describe('focus mode translation rendering', () => {
  afterEach(() => {
    setOptions({ ...DEFAULT_OPTIONS });
  });

  it('renders original focus messages when no visible translation exists', () => {
    const item = document.createElement('div');
    const bubble = document.createElement('div');

    renderFocusMessageText(item, bubble, record({ text: 'hello' }));

    expect(bubble.textContent).toBe('hello');
    expect(item.classList.contains('ytcq-translation-replaced')).toBe(false);
  });

  it('renders below-mode translations for focus messages', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'ja', translationDisplay: 'below' });
    const item = document.createElement('div');
    const bubble = document.createElement('div');

    renderFocusMessageText(item, bubble, record({
      text: 'gracias',
      translation: {
        originalText: 'gracias',
        protectedTokens: [],
        result: {
          sourceLanguage: 'es',
          targetLanguage: 'ja',
          text: 'ありがとう'
        },
        sourceText: 'gracias'
      }
    }));

    expect(bubble.textContent).toContain('gracias');
    expect(bubble.querySelector('.ytcq-translation')?.textContent).toContain('ありがとう');
  });

  it('renders replace-mode translations for focus messages', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'en', translationDisplay: 'replace' });
    const item = document.createElement('div');
    const bubble = document.createElement('div');

    renderFocusMessageText(item, bubble, record({
      text: 'gracias',
      translation: {
        originalText: 'gracias',
        protectedTokens: [],
        result: {
          sourceLanguage: 'es',
          targetLanguage: 'en',
          text: 'thank you'
        },
        sourceText: 'gracias'
      }
    }));

    expect(item.classList.contains('ytcq-translation-replaced')).toBe(true);
    expect(bubble.classList.contains('ytcq-translation-replaced-text')).toBe(true);
    expect(bubble.textContent).toContain('thank you');

    bubble.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.click();

    expect(item.dataset.ytcqTranslationView).toBe('original');
    expect(bubble.textContent).toContain('gracias');
    expect(bubble.title).toBe('Translated: thank you');

    bubble.querySelector<HTMLButtonElement>('.ytcq-replaced-translation-icon')?.click();

    expect(item.dataset.ytcqTranslationView).toBe('translated');
    expect(bubble.textContent).toContain('thank you');
  });

  it('hides stale translations for a different target language', () => {
    setOptions({ ...DEFAULT_OPTIONS, targetLanguage: 'fr', translationDisplay: 'below' });
    const item = document.createElement('div');
    const bubble = document.createElement('div');

    renderFocusMessageText(item, bubble, record({
      text: 'gracias',
      translation: {
        originalText: 'gracias',
        protectedTokens: [],
        result: {
          sourceLanguage: 'es',
          targetLanguage: 'ja',
          text: 'ありがとう'
        },
        sourceText: 'gracias'
      }
    }));

    expect(bubble.textContent).toBe('gracias');
    expect(bubble.querySelector('.ytcq-translation')).toBeNull();
  });
});

function record(overrides: Partial<FocusRecord> = {}): FocusRecord {
  return {
    authorName: '@ExampleUser',
    contentParts: [],
    historyKey: 'channel:example-user',
    id: 1,
    side: 'them',
    text: 'hello',
    timestampText: '10:00 PM',
    ...overrides
  };
}
