/**
 * Small text utilities shared across DOM parsing and option normalization.
 */
export function cleanText(text: unknown): string {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

export function normalizeComparableText(text: unknown): string {
  return cleanText(text).toLowerCase();
}
