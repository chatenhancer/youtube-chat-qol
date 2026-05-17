/**
 * Small text utilities shared across DOM parsing and option normalization.
 */
const INVISIBLE_CHAT_TEXT_PATTERN = /[\u200B\u2060\uFEFF]/g;

export function cleanText(text: unknown): string {
  return String(text || '').replace(INVISIBLE_CHAT_TEXT_PATTERN, '').replace(/\s+/g, ' ').trim();
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function normalizeComparableText(text: unknown): string {
  return cleanText(text).toLowerCase();
}
