import { describe, expect, it } from 'vitest';
import { LANGUAGE_OPTIONS, getLanguageLabel } from './languages';

describe('translation language catalog', () => {
  it('keeps major store-facing languages in the catalog', () => {
    expect(LANGUAGE_OPTIONS).toEqual(expect.arrayContaining([
      ['en', 'English'],
      ['ja', 'Japanese'],
      ['es', 'Spanish'],
      ['zh-CN', 'Chinese (Simplified)'],
      ['zh-TW', 'Chinese (Traditional)']
    ]));
  });

  it('returns readable labels and falls back to the raw code for unknown values', () => {
    expect(getLanguageLabel('ko')).toBe('Korean');
    expect(getLanguageLabel('unknown')).toBe('unknown');
  });
});
