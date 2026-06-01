import { describe, expect, it } from 'vitest';
import {
  createTranslationTargetOptions,
  createTranslationTextLanguageOptions
} from './language-options';

describe('command language autocomplete options', () => {
  it('includes an off option before language targets', () => {
    const options = createTranslationTargetOptions();

    expect(options[0]).toEqual({
      description: 'Translation off.',
      label: 'off',
      value: 'off'
    });
    expect(options.some((option) => option.value === 'chinese-simplified')).toBe(true);
  });

  it('keeps stable language codes for inline translation text choices', () => {
    const options = createTranslationTextLanguageOptions();
    const japanese = options.find((option) => option.value === 'ja');
    const simplifiedChinese = options.find((option) => option.value === 'zh-CN');

    expect(japanese).toMatchObject({
      description: 'Japanese',
      label: 'ja — Japanese',
      value: 'ja'
    });
    expect(simplifiedChinese).toMatchObject({
      aliases: expect.arrayContaining(['Chinese (Simplified)'])
    });
    expect(simplifiedChinese?.label).toMatch(/^zh-CN — Chinese/);
  });
});
