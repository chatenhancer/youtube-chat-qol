/**
 * Frequent emoji usage state helpers.
 *
 * Normalizes, caps, sorts, and updates the local usage list that backs the
 * most-used emoji row.
 */
import { emojiRecordsMatch } from './data';
import type { EmojiUsage } from './types';

const MAX_FREQUENT_EMOJIS = 10;
const MAX_EMOJI_USAGE_ENTRIES = 80;

export function upsertEmojiUsage(usage: EmojiUsage[], emoji: EmojiUsage): EmojiUsage[] {
  const nextUsage = usage.map((item) => ({ ...item }));
  const existing = nextUsage.find((item) => emojiRecordsMatch(item, emoji));
  const now = Date.now();

  if (existing) {
    existing.key = emoji.key || existing.key;
    existing.count += 1;
    existing.lastUsed = now;
    existing.emojiId = emoji.emojiId || existing.emojiId;
    existing.src = emoji.src || existing.src;
    existing.alt = emoji.alt || existing.alt;
    existing.label = emoji.label || existing.label;
    existing.shortcut = emoji.shortcut || existing.shortcut;
    existing.text = emoji.text || existing.text;
  } else {
    nextUsage.push({
      key: emoji.key,
      emojiId: emoji.emojiId || '',
      src: emoji.src || '',
      alt: emoji.alt || '',
      label: emoji.label || '',
      shortcut: emoji.shortcut || '',
      text: emoji.text || '',
      count: 1,
      lastUsed: now
    });
  }

  return normalizeEmojiUsage(nextUsage);
}

export function normalizeEmojiUsage(value: unknown): EmojiUsage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Partial<EmojiUsage> => Boolean(item && typeof item.key === 'string' && item.key))
    .map((item) => ({
      key: String(item.key),
      emojiId: String(item.emojiId || ''),
      src: String(item.src || ''),
      alt: String(item.alt || ''),
      label: String(item.label || ''),
      shortcut: String(item.shortcut || ''),
      text: String(item.text || ''),
      count: Math.max(0, Number(item.count) || 0),
      lastUsed: Math.max(0, Number(item.lastUsed) || 0)
    }))
    .sort(compareEmojiUsage)
    .slice(0, MAX_EMOJI_USAGE_ENTRIES);
}

export function getTopEmojiUsage(usage: EmojiUsage[]): EmojiUsage[] {
  return usage
    .filter((item) => item.count > 0)
    .sort(compareEmojiUsage)
    .slice(0, MAX_FREQUENT_EMOJIS);
}

function compareEmojiUsage(a: EmojiUsage, b: EmojiUsage): number {
  return (b.count - a.count) || (b.lastUsed - a.lastUsed);
}
