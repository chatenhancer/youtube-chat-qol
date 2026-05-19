/**
 * Most-used emoji row.
 *
 * Tracks emoji selections locally, renders a compact row at the top of
 * YouTube's emoji picker, and inserts selected frequent emojis directly into
 * the chat input. The row is capped so it does not crowd the native emoji list.
 */
import { cleanText } from '../shared/text';
import { insertIntoChatInput, insertNodeIntoChatInput } from '../youtube/chatInput';

interface EmojiUsage {
  key: string;
  emojiId: string;
  src: string;
  alt: string;
  label: string;
  shortcut: string;
  text: string;
  count: number;
  lastUsed: number;
}

const EMOJI_USAGE_STORAGE_KEY = 'ytcqEmojiUsage';
const MAX_FREQUENT_EMOJIS = 10;
const MAX_EMOJI_USAGE_ENTRIES = 80;

let emojiUsage: EmojiUsage[] = [];
let emojiUsageSaveTimer = 0;
let emojiPickerRefreshTimer = 0;

export function initFrequentEmojis(): void {
  chrome.storage.local.get({ [EMOJI_USAGE_STORAGE_KEY]: [] }, (stored) => {
    emojiUsage = normalizeEmojiUsage(stored[EMOJI_USAGE_STORAGE_KEY]);
    refreshEmojiPickers();
  });
}

export function enhanceEmojiPicker(picker: Element): void {
  if (!(picker instanceof HTMLElement)) return;
  renderFrequentEmojiRow(picker);
}

function refreshEmojiPickers(): void {
  document.querySelectorAll('yt-emoji-picker-renderer').forEach(enhanceEmojiPicker);
}

function scheduleEmojiPickerRefresh(): void {
  window.clearTimeout(emojiPickerRefreshTimer);
  emojiPickerRefreshTimer = window.setTimeout(() => {
    emojiPickerRefreshTimer = 0;
    refreshEmojiPickers();
  }, 50);
}

function isEmojiPickerToggle(target: Element): boolean {
  return !target.closest('yt-emoji-picker-renderer') &&
    Boolean(target.closest('#emoji.style-scope.yt-live-chat-message-input-renderer'));
}

export function handleEmojiPickerClick(event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  if (target && isEmojiPickerToggle(target)) {
    scheduleEmojiPickerRefresh();
  }

  const option = target?.closest('yt-emoji-picker-renderer [role="option"]');
  if (!option || option.closest('.ytcq-frequent-emoji-row')) return;

  const emoji = getEmojiUsageData(option);
  if (!emoji) return;
  if (isVariantParentEmoji(emoji)) return;

  recordEmojiUsage(emoji);
}

function renderFrequentEmojiRow(picker: HTMLElement): void {
  const topEmojis = getTopEmojiUsage();
  let row = picker.querySelector<HTMLElement>('.ytcq-frequent-emoji-row');
  const renderKey = getFrequentEmojiRenderKey(topEmojis);

  if (!topEmojis.length) {
    row?.remove();
    return;
  }

  const rowHost = getFrequentEmojiRowHost(picker);

  if (!row) {
    row = document.createElement('div');
    row.className = 'ytcq-frequent-emoji-row';
  }

  if (row.parentElement !== rowHost || row !== rowHost.firstElementChild) {
    rowHost.insertBefore(row, rowHost.firstElementChild);
  }

  if (row.dataset.ytcqEmojiRenderKey === renderKey) return;
  row.dataset.ytcqEmojiRenderKey = renderKey;

  const label = document.createElement('div');
  label.className = 'ytcq-frequent-emoji-label';
  label.textContent = 'Most used';

  const list = document.createElement('div');
  list.className = 'ytcq-frequent-emoji-list';

  for (const emoji of topEmojis) {
    list.appendChild(createFrequentEmojiButton(emoji));
  }

  row.replaceChildren(label, list);
}

function getFrequentEmojiRowHost(picker: HTMLElement): HTMLElement {
  return picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer:not(#search-category)') ||
    picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer') ||
    picker;
}

function createFrequentEmojiButton(emoji: EmojiUsage): HTMLButtonElement {
  const displayEmoji = emoji;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ytcq-frequent-emoji-button';
  button.title = displayEmoji.label || displayEmoji.alt || displayEmoji.text || 'Emoji';
  button.setAttribute('aria-label', button.title);

  if (displayEmoji.src) {
    const image = document.createElement('img');
    image.src = displayEmoji.src;
    image.alt = displayEmoji.alt || displayEmoji.text || displayEmoji.label || '';
    image.loading = 'lazy';
    button.appendChild(image);
  } else {
    button.textContent = getEmojiFallbackText(displayEmoji);
  }

  let handledPointer = false;
  const activate = (event: Event) => {
    consumeEmojiButtonEvent(event);
    handledPointer = event.type === 'pointerdown' || event.type === 'mousedown';
    chooseFrequentEmoji(displayEmoji);
  };

  button.addEventListener('pointerdown', activate);
  button.addEventListener('mousedown', (event) => {
    if (handledPointer) {
      consumeEmojiButtonEvent(event);
      return;
    }
    activate(event);
  });
  button.addEventListener('click', (event) => {
    consumeEmojiButtonEvent(event);
    if (handledPointer) {
      handledPointer = false;
      return;
    }
    chooseFrequentEmoji(displayEmoji);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    consumeEmojiButtonEvent(event);
    chooseFrequentEmoji(displayEmoji);
  });

  return button;
}

function getFrequentEmojiRenderKey(topEmojis: EmojiUsage[]): string {
  return topEmojis.map((emoji) => [
    emoji.key,
    emoji.src,
    emoji.alt,
    emoji.label,
    emoji.emojiId,
    emoji.shortcut,
    emoji.text,
    emoji.count,
    emoji.lastUsed
  ].join('|')).join('\n');
}

function chooseFrequentEmoji(emoji: EmojiUsage): void {
  if (!insertEmojiIntoChat(emoji)) return;
  recordEmojiUsage(emoji, { refreshPickers: false });
}

function getEmojiUsageData(option: Element | null): EmojiUsage | null {
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

function recordEmojiUsage(emoji: EmojiUsage, options: { refreshPickers?: boolean } = {}): void {
  const existing = emojiUsage.find((item) => emojiRecordsMatch(item, emoji));
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
    emojiUsage.push({
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

  emojiUsage = normalizeEmojiUsage(emojiUsage);
  scheduleEmojiUsageSave();
  if (options.refreshPickers !== false) refreshEmojiPickers();
}

function normalizeEmojiUsage(value: unknown): EmojiUsage[] {
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

function compareEmojiUsage(a: EmojiUsage, b: EmojiUsage): number {
  return (b.count - a.count) || (b.lastUsed - a.lastUsed);
}

function getTopEmojiUsage(): EmojiUsage[] {
  return emojiUsage
    .filter((item) => item.count > 0)
    .sort(compareEmojiUsage)
    .slice(0, MAX_FREQUENT_EMOJIS);
}

function scheduleEmojiUsageSave(): void {
  window.clearTimeout(emojiUsageSaveTimer);
  emojiUsageSaveTimer = window.setTimeout(() => {
    chrome.storage.local.set({ [EMOJI_USAGE_STORAGE_KEY]: emojiUsage });
  }, 150);
}

function consumeEmojiButtonEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

function insertEmojiIntoChat(emoji: EmojiUsage): boolean {
  if (emoji.src && insertEmojiImageIntoChat(emoji)) return true;

  const text = getEmojiInsertText(emoji);
  return text ? insertIntoChatInput(text) : false;
}

function insertEmojiImageIntoChat(emoji: EmojiUsage): boolean {
  const alt = cleanText(emoji.alt || getEmojiFallbackText(emoji) || emoji.label || emoji.shortcut);
  if (!alt) return false;

  const image = document.createElement('img');
  image.className = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
  image.src = emoji.src;
  image.alt = alt;

  if (isCustomEmojiUsage(emoji)) {
    const emojiId = cleanText(emoji.emojiId);
    if (!emojiId) return false;
    image.id = emojiId;
    image.setAttribute('data-emoji-id', emojiId);
  }

  const tooltipText = cleanText(emoji.shortcut || emoji.label);
  if (tooltipText) image.setAttribute('shared-tooltip-text', tooltipText);

  return insertNodeIntoChatInput(image, alt);
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

function emojiRecordsMatch(a: Partial<EmojiUsage>, b: Partial<EmojiUsage>): boolean {
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

function getEmojiFallbackText(emoji: EmojiUsage): string {
  const candidates = [emoji.text, emoji.alt, emoji.label].map(cleanText).filter(Boolean);
  return candidates.find((value) => /\p{Extended_Pictographic}/u.test(value)) || candidates[0] || '';
}

function isCustomEmojiUsage(emoji: EmojiUsage): boolean {
  return Boolean(emoji.src) && !getUnicodeEmojiText(emoji);
}

function isVariantParentEmoji(emoji: EmojiUsage): boolean {
  const unicodeEmoji = getUnicodeEmojiText(emoji);
  return Boolean(unicodeEmoji) && isShortcode(emoji.label) && /\p{Emoji_Modifier_Base}/u.test(unicodeEmoji);
}

function getEmojiInsertText(emoji: EmojiUsage): string {
  const candidates = [emoji.shortcut, emoji.text, emoji.alt, emoji.label]
    .map(cleanText)
    .filter(Boolean);
  const unicodeEmoji = candidates.find(isUnicodeEmojiText);
  if (unicodeEmoji) return unicodeEmoji;

  const shortcode = getEmojiShortcut(candidates);
  if (shortcode) return shortcode;

  return '';
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
