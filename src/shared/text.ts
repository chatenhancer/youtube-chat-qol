/**
 * Small text utilities shared across DOM parsing and option normalization.
 */
const INVISIBLE_CHAT_TEXT_PATTERN = /[\u200B\u2060\uFEFF]/g;
const MATH_X_CONFUSABLE_PATTERN = /[\u00D7\u0445\u0425]/g;

export function cleanText(text: unknown): string {
  return String(text || '').replace(INVISIBLE_CHAT_TEXT_PATTERN, '').replace(/\s+/g, ' ').trim();
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function normalizeComparableText(text: unknown): string {
  return cleanText(text)
    .normalize('NFKC')
    .replace(MATH_X_CONFUSABLE_PATTERN, 'x')
    .toLowerCase();
}
