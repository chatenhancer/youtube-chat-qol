import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getTopEmojiUsage,
  normalizeEmojiUsage,
  upsertEmojiUsage
} from './usage';
import type { EmojiUsage } from './types';

describe('frequent emoji usage helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes, sorts, and caps stored usage records', () => {
    const records = Array.from({ length: 85 }, (_, index) => ({
      key: `emoji-${index}`,
      count: index,
      lastUsed: 1000 - index
    }));

    const normalized = normalizeEmojiUsage([
      null,
      { key: '', count: 100 },
      { key: 'bad-count', count: -20, lastUsed: Number.NaN },
      ...records
    ]);

    expect(normalized).toHaveLength(80);
    expect(normalized[0]).toMatchObject({ key: 'emoji-84', count: 84 });
    expect(normalized.at(-1)?.key).toBe('emoji-5');
    expect(normalized.some((record) => record.key === 'bad-count')).toBe(false);
  });

  it('updates existing emoji records without dropping newer metadata', () => {
    vi.useFakeTimers();
    vi.setSystemTime(123_456);

    const updated = upsertEmojiUsage([
      emoji({
        count: 2,
        emojiId: 'wave-emoji',
        key: 'shortcut::wave:',
        label: ':wave:',
        lastUsed: 1,
        src: 'https://example.test/old.png'
      })
    ], emoji({
      emojiId: 'wave-emoji',
      key: 'shortcut::wave:',
      label: ':wave:',
      src: 'https://example.test/new.png',
      text: '👋'
    }));

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      count: 3,
      key: 'shortcut::wave:',
      lastUsed: 123_456,
      src: 'https://example.test/new.png',
      text: '👋'
    });
  });

  it('returns only the ten most-used positive records', () => {
    const usage = Array.from({ length: 12 }, (_, index) => emoji({
      count: index,
      key: `emoji-${index}`,
      lastUsed: index
    }));

    const top = getTopEmojiUsage(usage);

    expect(top).toHaveLength(10);
    expect(top[0].key).toBe('emoji-11');
    expect(top.at(-1)?.key).toBe('emoji-2');
    expect(top.some((record) => record.count === 0)).toBe(false);
  });
});

function emoji(overrides: Partial<EmojiUsage>): EmojiUsage {
  return {
    alt: '',
    count: 0,
    emojiId: '',
    key: '',
    label: '',
    lastUsed: 0,
    shortcut: '',
    src: '',
    text: '',
    ...overrides
  };
}
