/**
 * Shared extension option schema.
 *
 * Every UI surface reads and writes these same fields. normalizeOptions guards
 * against missing or malformed stored values so old or partial storage state
 * cannot break content-script startup.
 */
export type TranslationDisplay = 'replace' | 'below';

export interface Options {
  composerTranslateLanguage: string;
  targetLanguage: string;
  lastTranslationTarget: string;
  translationDisplay: TranslationDisplay;
  sound: boolean;
}

export const DEFAULT_TRANSLATION_TARGET = 'en';

export const DEFAULT_OPTIONS: Options = {
  composerTranslateLanguage: '',
  targetLanguage: '',
  lastTranslationTarget: DEFAULT_TRANSLATION_TARGET,
  translationDisplay: 'replace',
  sound: true
};

export const TRANSLATION_DISPLAY_OPTIONS: readonly (readonly [TranslationDisplay, string])[] = [
  ['replace', 'Replace message'],
  ['below', 'Show below']
];

export function normalizeOptions(value: Partial<Options> | Record<string, unknown>): Options {
  const candidate = value as Record<string, unknown>;
  const composerTranslateLanguage = String(candidate.composerTranslateLanguage || '');
  const targetLanguage = String(candidate.targetLanguage || '');
  const lastTranslationTarget = String(candidate.lastTranslationTarget || targetLanguage || DEFAULT_TRANSLATION_TARGET);
  const translationDisplay = TRANSLATION_DISPLAY_OPTIONS.some(([mode]) => mode === candidate.translationDisplay)
    ? candidate.translationDisplay as TranslationDisplay
    : DEFAULT_OPTIONS.translationDisplay;

  return {
    composerTranslateLanguage,
    targetLanguage,
    lastTranslationTarget,
    translationDisplay,
    sound: candidate.sound !== false
  };
}

export function getTranslationToggleTarget(options: Pick<Options, 'lastTranslationTarget' | 'targetLanguage'>): string {
  return options.lastTranslationTarget || options.targetLanguage || DEFAULT_TRANSLATION_TARGET;
}

export function getTargetLanguageUpdate(targetLanguage: string, lastTranslationTarget = ''): Partial<Options> {
  return targetLanguage
    ? { targetLanguage, lastTranslationTarget: targetLanguage }
    : lastTranslationTarget
      ? { targetLanguage: '', lastTranslationTarget }
      : { targetLanguage: '' };
}
