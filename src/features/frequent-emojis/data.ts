import { cleanText } from '../../shared/text';
import type { EmojiUsage } from './types';

export function getEmojiUsageData(option: Element | null): EmojiUsage | null {
  const image = getEmojiOptionImage(option);
  const src = getEmojiImageSource(image);
  const alt = cleanText(image?.getAttribute('alt') || '');
  const label = cleanText(option?.getAttribute('aria-label') || image?.getAttribute('aria-label') || option?.getAttribute('title') || alt);
  const text = cleanText(option?.textContent || '');
  const shortcut = getEmojiShortcut([label, alt, text]);
  const emojiId = getNativeEmojiId(option, image);
  const key = shortcut ? `shortcut:${shortcut}` : label ? `label:${label}` : alt ? `alt:${alt}` : text ? `text:${text}` : src ? `src:${src}` : '';

  if (!key) return null;

  return {
    key,
    emojiId,
    src,
    alt,
    label,
    shortcut,
    text,
    count: 0,
    lastUsed: 0
  };
}

export function emojiRecordsMatch(a: Partial<EmojiUsage>, b: Partial<EmojiUsage>): boolean {
  if (!a || !b) return false;
  if (a.emojiId && b.emojiId) return a.emojiId === b.emojiId;
  if (a.src && b.src) return a.src === b.src;

  return Boolean(
    (a.key && b.key && a.key === b.key) ||
    (a.shortcut && b.shortcut && a.shortcut === b.shortcut) ||
    (a.label && b.label && a.label === b.label) ||
    (a.alt && b.alt && a.alt === b.alt) ||
    (a.text && b.text && a.text === b.text)
  );
}

export function getEmojiFallbackText(emoji: EmojiUsage): string {
  const candidates = [emoji.text, emoji.alt, emoji.label].map(cleanText).filter(Boolean);
  return candidates.find((value) => /\p{Extended_Pictographic}/u.test(value)) || candidates[0] || '';
}

export function isCustomEmojiUsage(emoji: EmojiUsage): boolean {
  return Boolean(emoji.src) && !getUnicodeEmojiText(emoji);
}

export function isVariantParentEmoji(emoji: EmojiUsage): boolean {
  const unicodeEmoji = getUnicodeEmojiText(emoji);
  return Boolean(unicodeEmoji) && isShortcode(emoji.label) && /\p{Emoji_Modifier_Base}/u.test(unicodeEmoji);
}

export function getEmojiInsertText(emoji: EmojiUsage): string {
  const candidates = [emoji.shortcut, emoji.text, emoji.alt, emoji.label]
    .map(cleanText)
    .filter(Boolean);
  const unicodeEmoji = candidates.find(isUnicodeEmojiText);
  if (unicodeEmoji) return unicodeEmoji;

  const shortcode = getEmojiShortcut(candidates);
  if (shortcode) return shortcode;

  return '';
}

function getEmojiOptionImage(option: Element | null): HTMLImageElement | null {
  if (!option) return null;
  if (option.matches?.('img')) return option as HTMLImageElement;
  return option.querySelector?.('img') || null;
}

function getEmojiImageSource(image: HTMLImageElement | null): string {
  if (!image) return '';

  const srcset = image.getAttribute('srcset') || image.getAttribute('data-srcset') || '';
  const srcsetSource = srcset.split(',')[0]?.trim().split(/\s+/)[0] || '';
  const candidates = [
    image.currentSrc,
    image.src,
    image.getAttribute('src'),
    image.getAttribute('data-src'),
    image.getAttribute('data-thumb'),
    image.getAttribute('data-original'),
    srcsetSource
  ];

  return candidates.find(isUsableEmojiImageSource) || '';
}

function getNativeEmojiId(option: Element | null, image: HTMLImageElement | null): string {
  return cleanText(
    image?.getAttribute('data-emoji-id') ||
    option?.getAttribute('data-emoji-id') ||
    image?.getAttribute('id') ||
    option?.getAttribute('id') ||
    ''
  );
}

function isUsableEmojiImageSource(src: string | null | undefined): boolean {
  if (!src) return false;
  const value = String(src).trim();
  return Boolean(value) && !/^data:image\/gif/i.test(value);
}

function getUnicodeEmojiText(emoji: Partial<EmojiUsage>): string {
  return [emoji.text, emoji.alt, emoji.label]
    .map((value) => cleanText(value || ''))
    .find(isUnicodeEmojiText) || '';
}

function isUnicodeEmojiText(value: string): boolean {
  return /\p{Extended_Pictographic}/u.test(value) || /\p{Emoji_Presentation}/u.test(value);
}

function getEmojiShortcut(values: string[]): string {
  for (const value of values) {
    const clean = cleanText(value);
    if (/^:[^:\s][^:]*:$/.test(clean)) return clean;

    const withoutColons = clean.replace(/^:+|:+$/g, '');
    if (/^[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)+$/u.test(withoutColons)) {
      return `:${withoutColons}:`;
    }
  }

  return '';
}

function isShortcode(value: string): boolean {
  return /^:[^:\s][^:]*:$/.test(cleanText(value));
}
