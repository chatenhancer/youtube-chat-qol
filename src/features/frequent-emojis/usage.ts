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
    .filter(isStoredEmojiUsage)
    .map((item) => ({
      key: item.key,
      emojiId: item.emojiId,
      src: item.src,
      alt: item.alt,
      label: item.label,
      shortcut: item.shortcut,
      text: item.text,
      count: item.count,
      lastUsed: item.lastUsed
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

function isStoredEmojiUsage(value: unknown): value is EmojiUsage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EmojiUsage>;
  return typeof candidate.key === 'string' &&
    Boolean(candidate.key) &&
    typeof candidate.emojiId === 'string' &&
    typeof candidate.src === 'string' &&
    typeof candidate.alt === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.shortcut === 'string' &&
    typeof candidate.text === 'string' &&
    typeof candidate.count === 'number' &&
    Number.isFinite(candidate.count) &&
    candidate.count > 0 &&
    typeof candidate.lastUsed === 'number' &&
    Number.isFinite(candidate.lastUsed) &&
    candidate.lastUsed > 0;
}
