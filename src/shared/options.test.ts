import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPTIONS,
  DEFAULT_TRANSLATION_TARGET,
  getPlaygroundDisabledUpdate,
  getTargetLanguageUpdate,
  getTranslationToggleTarget,
  normalizeOptions
} from './options';

describe('shared option helpers', () => {
  it('normalizes malformed stored values to safe defaults', () => {
    expect(normalizeOptions({
      chatSkin: 'classic',
      composerTranslateLanguage: 123,
      lastTranslationTarget: '',
      playgroundEnabled: 'yes',
      playgroundGamesAvailable: 'yes',
      sound: 'yes',
      startupEffect: null,
      targetLanguage: 456,
      translationDisplay: 'sideways'
    })).toEqual({
      ...DEFAULT_OPTIONS
    });
  });

  it('preserves explicit false booleans and valid display modes', () => {
    expect(normalizeOptions({
      chatSkin: '2007',
      sound: false,
      startupEffect: false,
      playgroundEnabled: true,
      playgroundGamesAvailable: true,
      translationDisplay: 'below'
    })).toMatchObject({
      sound: false,
      startupEffect: false,
      chatSkin: '2007',
      playgroundEnabled: true,
      playgroundGamesAvailable: true,
      translationDisplay: 'below'
    });
  });

  it('clears child playground options when playground is disabled', () => {
    expect(getPlaygroundDisabledUpdate()).toEqual({
      playgroundEnabled: false,
      playgroundGamesAvailable: false
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
