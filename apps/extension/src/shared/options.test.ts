// @vitest-environment node
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
      chatSkin: 'classic',
      composerTranslateLanguage: 123,
      lastTranslationTarget: '',
      liteModeEnabled: 'yes',
      messageDensity: 'crowded',
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
      chatSkin: 'custom:aero',
      liteModeEnabled: true,
      messageDensity: 'compact',
      sound: false,
      startupEffect: false,
      playgroundEnabled: true,
      playgroundGamesAvailable: false,
      translationDisplay: 'below'
    })).toMatchObject({
      sound: false,
      startupEffect: false,
      chatSkin: 'custom:aero',
      liteModeEnabled: true,
      messageDensity: 'compact',
      playgroundEnabled: true,
      playgroundGamesAvailable: false,
      translationDisplay: 'below'
    });
  });

  it('enables game invites by default when no preference is stored', () => {
    expect(normalizeOptions({}).playgroundGamesAvailable).toBe(true);
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
