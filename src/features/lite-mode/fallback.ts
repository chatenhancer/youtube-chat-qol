/** Stable user-facing diagnostics for automatic Lite-to-native recovery. */

export type LiteModeAutomaticFailureReason =
  | 'startup-timeout'
  | 'source-timeout'
  | 'invalid-batch'
  | 'non-monotonic-sequence'
  | 'sequence-gap'
  | 'unreadable-response'
  | 'unreadable-feed'
  | 'root-replaced';

const FALLBACK_CODES = {
  'startup-timeout': 'LM01',
  'source-timeout': 'LM02',
  'invalid-batch': 'LM03',
  'non-monotonic-sequence': 'LM04',
  'sequence-gap': 'LM05',
  'unreadable-response': 'LM06',
  'unreadable-feed': 'LM07',
  'root-replaced': 'LM09'
} as const satisfies Record<LiteModeAutomaticFailureReason, string>;

export type LiteModeFallbackCode =
  | 'LM00'
  | (typeof FALLBACK_CODES)[LiteModeAutomaticFailureReason];

export function getLiteModeFallbackCode(
  reason: LiteModeAutomaticFailureReason
): LiteModeFallbackCode {
  return FALLBACK_CODES[reason];
}

export function parseLiteModeFallbackCode(value: unknown): LiteModeFallbackCode | null {
  return value === 'LM00' || (
    typeof value === 'string' &&
    Object.values(FALLBACK_CODES).some((code) => code === value)
  )
    ? value as LiteModeFallbackCode
    : null;
}

export function formatLiteModeFallbackMessage(
  message: string,
  code: LiteModeFallbackCode
): string {
  return `${message} (${code})`;
}
