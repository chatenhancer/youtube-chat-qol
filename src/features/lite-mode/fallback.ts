/** Stable user-facing diagnostics for automatic Lite-to-native recovery. */

export type LiteModeAutomaticFailureReason =
  | 'startup-timeout'
  | 'source-timeout'
  | 'invalid-batch'
  | 'non-monotonic-sequence'
  | 'sequence-gap'
  | 'unreadable-response'
  | 'unreadable-feed'
  | 'action-backlog'
  | 'root-replaced';

export type LiteModeFallbackCode =
  | 'LM00'
  | 'LM01'
  | 'LM02'
  | 'LM03'
  | 'LM04'
  | 'LM05'
  | 'LM06'
  | 'LM07'
  | 'LM08'
  | 'LM09';

const FALLBACK_CODES: Record<LiteModeAutomaticFailureReason, LiteModeFallbackCode> = {
  'startup-timeout': 'LM01',
  'source-timeout': 'LM02',
  'invalid-batch': 'LM03',
  'non-monotonic-sequence': 'LM04',
  'sequence-gap': 'LM05',
  'unreadable-response': 'LM06',
  'unreadable-feed': 'LM07',
  'action-backlog': 'LM08',
  'root-replaced': 'LM09'
};

export function getLiteModeFallbackCode(
  reason: LiteModeAutomaticFailureReason
): LiteModeFallbackCode {
  return FALLBACK_CODES[reason];
}

export function parseLiteModeFallbackCode(value: unknown): LiteModeFallbackCode | null {
  return typeof value === 'string' && /^LM0\d$/.test(value)
    ? value as LiteModeFallbackCode
    : null;
}

export function formatLiteModeFallbackMessage(
  message: string,
  code: LiteModeFallbackCode
): string {
  return `${message} (${code})`;
}

