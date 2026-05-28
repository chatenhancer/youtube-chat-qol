/**
 * Command language autocomplete options.
 *
 * Builds localized language choices for translation-target settings and
 * custom inline translation commands.
 */
import { getLocalizedLanguageLabel, t } from '../../../shared/i18n';
import { LANGUAGE_OPTIONS } from '../../../shared/languages';
import { cleanText } from '../../../shared/text';
import type { CommandAutocompleteOption } from '../types';

export function createTranslationTargetOptions(): CommandAutocompleteOption[] {
  return [
    {
      description: t('translateOff'),
      label: 'off',
      value: 'off'
    },
    ...LANGUAGE_OPTIONS.map(([value, label]) => {
      const languageLabel = getLocalizedLanguageLabel(value) || label;
      return {
        aliases: [value, label],
        description: t('translateToLanguage', { language: languageLabel }),
        label: languageLabel,
        value: getLanguageAutocompleteValue(value, label)
      };
    })
  ];
}

export function createTranslationTextLanguageOptions(): CommandAutocompleteOption[] {
  return LANGUAGE_OPTIONS.map(([value, label]) => {
    const languageLabel = getLocalizedLanguageLabel(value) || label;
    return {
      aliases: [languageLabel, label],
      description: languageLabel,
      label: `${value} — ${languageLabel}`,
      value
    };
  });
}

function getLanguageAutocompleteValue(value: string, label: string): string {
  const readable = cleanText(label)
    .toLowerCase()
    .replace(/[()[\]]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return readable || value;
}
