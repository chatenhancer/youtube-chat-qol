/**
 * Text normalization helpers for browser tests.
 */
export function cleanVisibleText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
