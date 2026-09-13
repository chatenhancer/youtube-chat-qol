/**
 * Small text utilities shared across DOM parsing and option normalization.
 */
const INVISIBLE_CHAT_TEXT_PATTERN = /[\u200B\u2060\uFEFF]/g;
const MATH_X_CONFUSABLE_PATTERN = /[\u00D7\u0445\u0425]/g;
const TEXT_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function cleanText(text: unknown): string {
  return String(text || '').replace(INVISIBLE_CHAT_TEXT_PATTERN, '').replace(/\s+/g, ' ').trim();
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function normalizeComparableText(text: unknown): string {
  return normalizeTextCase(cleanText(text));
}

/** Maps comparable text back to the original characters for inline highlights. */
export function normalizeComparableTextWithRanges(text: string): {
  normalizedText: string;
  sourceRanges: Array<{ start: number; end: number }>;
} {
  let cleanedText = '';
  const cleanedRanges: Array<{ start: number; end: number }> = [];
  let offset = 0;

  for (const character of text) {
    const start = offset;
    offset += character.length;
    const visibleCharacter = character.replace(INVISIBLE_CHAT_TEXT_PATTERN, '');
    if (!visibleCharacter) continue;
    const cleanedCharacter = /\s/u.test(visibleCharacter) ? ' ' : visibleCharacter;
    if (cleanedCharacter === ' ' && (!cleanedText || cleanedText.endsWith(' '))) {
      const previous = cleanedRanges.at(-1);
      if (previous) previous.end = offset;
      continue;
    }
    cleanedText += cleanedCharacter;
    for (let index = 0; index < cleanedCharacter.length; index += 1) {
      cleanedRanges.push({ start, end: offset });
    }
  }
  if (cleanedText.endsWith(' ')) {
    cleanedText = cleanedText.slice(0, -1);
    cleanedRanges.pop();
  }

  const sourceRanges: Array<{ start: number; end: number }> = [];
  for (const { segment, index } of TEXT_SEGMENTER.segment(cleanedText)) {
    const range = {
      start: cleanedRanges[index].start,
      end: cleanedRanges[index + segment.length - 1].end
    };
    const normalizedSegment = normalizeTextCase(segment);
    for (let index = 0; index < normalizedSegment.length; index += 1) {
      sourceRanges.push(range);
    }
  }

  // Normalize the whole string so context-sensitive casing stays consistent with matching.
  return { normalizedText: normalizeTextCase(cleanedText), sourceRanges };
}

function normalizeTextCase(text: string): string {
  return text
    .normalize('NFKC')
    .replace(MATH_X_CONFUSABLE_PATTERN, 'x')
    .toLowerCase();
}
