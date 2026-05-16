/**
 * Shared extension option schema.
 *
 * Every UI surface reads and writes these same fields. normalizeOptions guards
 * against missing or malformed stored values so old or partial storage state
 * cannot break content-script startup.
 */
import { clampNumber } from './text';

export type TranslationDisplay = 'replace' | 'below';

export interface Options {
  targetLanguage: string;
  translationDisplay: TranslationDisplay;
  quoteMaxLength: number;
  openProfilesInPopup: boolean;
  mentionSound: boolean;
}

export const DEFAULT_OPTIONS: Options = {
  targetLanguage: '',
  translationDisplay: 'replace',
  quoteMaxLength: 120,
  openProfilesInPopup: true,
  mentionSound: false
};

export const TRANSLATION_DISPLAY_OPTIONS: readonly (readonly [TranslationDisplay, string])[] = [
  ['replace', 'Replace message'],
  ['below', 'Show below']
];

export const QUOTE_LENGTH_OPTIONS = [80, 120, 180, 240] as const;

export function normalizeOptions(value: Partial<Options> | Record<string, unknown>): Options {
  const candidate = value as Record<string, unknown>;
  const translationDisplay = TRANSLATION_DISPLAY_OPTIONS.some(([mode]) => mode === candidate.translationDisplay)
    ? candidate.translationDisplay as TranslationDisplay
    : DEFAULT_OPTIONS.translationDisplay;

  return {
    targetLanguage: String(candidate.targetLanguage || ''),
    translationDisplay,
    quoteMaxLength: clampNumber(candidate.quoteMaxLength, 40, 240, DEFAULT_OPTIONS.quoteMaxLength),
    openProfilesInPopup: candidate.openProfilesInPopup !== false,
    mentionSound: candidate.mentionSound === true
  };
}

export function getNextQuoteLength(currentLength: number): number {
  const currentIndex = QUOTE_LENGTH_OPTIONS.indexOf(currentLength as typeof QUOTE_LENGTH_OPTIONS[number]);
  return QUOTE_LENGTH_OPTIONS[(currentIndex + 1) % QUOTE_LENGTH_OPTIONS.length];
}
