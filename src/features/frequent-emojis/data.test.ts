import { describe, expect, it } from 'vitest';
import {
  emojiRecordsMatch,
  getEmojiFallbackText,
  getEmojiInsertText,
  getEmojiUsageData,
  isCustomEmojiUsage,
  isVariantParentEmoji
} from './data';
import type { EmojiUsage } from './types';

describe('frequent emoji data helpers', () => {
  it('extracts stable custom emoji records from YouTube picker options', () => {
    const option = document.createElement('button');
    option.setAttribute('aria-label', ':cat-orange-whistling:');
    option.innerHTML = '<img alt="cat-orange-whistling" data-emoji-id="emoji-1" src="https://example.test/emoji.png">';

    const record = getEmojiUsageData(option);

    expect(record).toMatchObject({
      alt: 'cat-orange-whistling',
      emojiId: 'emoji-1',
      key: 'shortcut::cat-orange-whistling:',
      label: ':cat-orange-whistling:',
      shortcut: ':cat-orange-whistling:',
      src: 'https://example.test/emoji.png'
    });
    expect(isCustomEmojiUsage(record as EmojiUsage)).toBe(true);
  });

  it('ignores transparent gif placeholders and falls back to text data', () => {
    const option = document.createElement('button');
    option.textContent = '✅';
    option.innerHTML += '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';

    expect(getEmojiUsageData(option)).toMatchObject({
      key: 'text:✅',
      src: '',
      text: '✅'
    });
  });

  it('matches records by strongest stable identity first', () => {
    expect(emojiRecordsMatch(
      emoji({ emojiId: 'same-id', label: ':old:' }),
      emoji({ emojiId: 'same-id', label: ':new:' })
    )).toBe(true);
    expect(emojiRecordsMatch(
      emoji({ src: 'https://example.test/a.png', label: ':old:' }),
      emoji({ src: 'https://example.test/a.png', label: ':new:' })
    )).toBe(true);
    expect(emojiRecordsMatch(emoji({ text: '✅' }), emoji({ text: '✅' }))).toBe(true);
    expect(emojiRecordsMatch(emoji({ text: '✅' }), emoji({ text: '❌' }))).toBe(false);
  });

  it('chooses safe insert and fallback text for Unicode, shortcodes, and custom emoji', () => {
    expect(getEmojiInsertText(emoji({ text: '✅', label: 'check mark' }))).toBe('✅');
    expect(getEmojiInsertText(emoji({ label: ':face-blue-smiling:' }))).toBe(':face-blue-smiling:');
    expect(getEmojiFallbackText(emoji({ label: 'check mark', alt: '✅' }))).toBe('✅');
  });

  it('detects Unicode variant-parent picker entries', () => {
    expect(isVariantParentEmoji(emoji({
      label: ':thumbs-up:',
      text: '👍'
    }))).toBe(true);
    expect(isVariantParentEmoji(emoji({
      label: 'thumbs up',
      text: '👍'
    }))).toBe(false);
  });
});

function emoji(overrides: Partial<EmojiUsage>): EmojiUsage {
  return {
    alt: '',
    count: 0,
    emojiId: '',
    key: overrides.key || '',
    label: '',
    lastUsed: 0,
    shortcut: '',
    src: '',
    text: '',
    ...overrides
  };
}
