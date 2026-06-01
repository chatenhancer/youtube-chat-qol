import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  DEFAULT_TRANSLATION_TARGET,
  getTargetLanguageUpdate,
  getTranslationToggleTarget,
  normalizeOptions
} from './options';

describe('shared option helpers', () => {
  it('normalizes malformed stored values to safe defaults', () => {
    expect(normalizeOptions({
      composerTranslateLanguage: 123,
      lastTranslationTarget: '',
      sound: 'yes',
      startupEffect: null,
      targetLanguage: 456,
      translationDisplay: 'sideways'
    })).toEqual({
      ...DEFAULT_OPTIONS,
      composerTranslateLanguage: '123',
      lastTranslationTarget: '456',
      targetLanguage: '456'
    });
  });

  it('preserves explicit false booleans and valid display modes', () => {
    expect(normalizeOptions({
      sound: false,
      startupEffect: false,
      translationDisplay: 'below'
    })).toMatchObject({
      sound: false,
      startupEffect: false,
      translationDisplay: 'below'
    });
  });

  it('chooses a target when toggling translation back on', () => {
    expect(getTranslationToggleTarget({ lastTranslationTarget: 'ja', targetLanguage: '' })).toBe('ja');
    expect(getTranslationToggleTarget({ lastTranslationTarget: '', targetLanguage: 'es' })).toBe('es');
    expect(getTranslationToggleTarget({ lastTranslationTarget: '', targetLanguage: '' })).toBe(DEFAULT_TRANSLATION_TARGET);
  });

  it('updates target language without losing the last enabled target', () => {
    expect(getTargetLanguageUpdate('ko')).toEqual({
      lastTranslationTarget: 'ko',
      targetLanguage: 'ko'
    });
    expect(getTargetLanguageUpdate('', 'fr')).toEqual({
      lastTranslationTarget: 'fr',
      targetLanguage: ''
    });
    expect(getTargetLanguageUpdate('')).toEqual({ targetLanguage: '' });
  });
});
