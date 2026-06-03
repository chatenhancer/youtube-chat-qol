import { describe, expect, it } from 'vitest';
import {
  KNOWN_CHAT_TAB_MAX_AGE_MS,
  normalizeKnownChatTabs
} from './known-chat-tabs';

describe('known chat tab helpers', () => {
  it('drops malformed, negative, and stale tab records', () => {
    const now = 1_000_000;

    expect(normalizeKnownChatTabs({
      '-1': now,
      10: now - 100,
      11: now - KNOWN_CHAT_TAB_MAX_AGE_MS - 1,
      12: 'not-a-date',
      abc: now
    }, now)).toEqual({
      10: now - 100
    });
  });
});
