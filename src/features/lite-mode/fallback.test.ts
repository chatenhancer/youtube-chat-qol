import { describe, expect, it } from 'vitest';
import {
  formatLiteModeFallbackMessage,
  getLiteModeFallbackCode,
  parseLiteModeFallbackCode
} from './fallback';

describe('Lite mode fallback diagnostics', () => {
  it('maps automatic failures to stable short codes', () => {
    expect(getLiteModeFallbackCode('startup-timeout')).toBe('LM01');
    expect(getLiteModeFallbackCode('source-timeout')).toBe('LM02');
    expect(getLiteModeFallbackCode('invalid-batch')).toBe('LM03');
    expect(getLiteModeFallbackCode('non-monotonic-sequence')).toBe('LM04');
    expect(getLiteModeFallbackCode('sequence-gap')).toBe('LM05');
    expect(getLiteModeFallbackCode('unreadable-response')).toBe('LM06');
    expect(getLiteModeFallbackCode('unreadable-feed')).toBe('LM07');
    expect(getLiteModeFallbackCode('root-replaced')).toBe('LM09');
  });

  it('validates persisted codes and appends them to localized fallback copy', () => {
    expect(parseLiteModeFallbackCode('LM06')).toBe('LM06');
    expect(parseLiteModeFallbackCode('LM08')).toBeNull();
    expect(parseLiteModeFallbackCode('LM10')).toBeNull();
    expect(parseLiteModeFallbackCode('unreadable-response')).toBeNull();
    expect(formatLiteModeFallbackMessage('Returned to YouTube chat.', 'LM06')).toBe(
      'Returned to YouTube chat. (LM06)'
    );
  });
});
