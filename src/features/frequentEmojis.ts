/**
 * Most-used emoji row.
 *
 * Tracks emoji selections locally, renders a compact row at the top of
 * YouTube's emoji picker, and inserts selected frequent emojis directly into
 * the chat input. The row is capped so it does not crowd the native emoji list.
 */
import { cleanText } from '../shared/text';
import { findChatInput, insertIntoChatInput } from '../youtube/chatInput';

interface EmojiUsage {
  key: string;
  src: string;
  alt: string;
  label: string;
  shortcut: string;
  text: string;
  count: number;
  lastUsed: number;
}

const EMOJI_USAGE_STORAGE_KEY = 'ytcqEmojiUsage';
const MAX_FREQUENT_EMOJIS = 12;
const MAX_EMOJI_USAGE_ENTRIES = 80;

let emojiUsage: EmojiUsage[] = [];
let emojiUsageSaveTimer = 0;
let ignoredSyntheticEmojiKey = '';

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

export function refreshEmojiPickers(): void {
  document.querySelectorAll('yt-emoji-picker-renderer').forEach(enhanceEmojiPicker);
}

export function handleEmojiPickerClick(event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  const option = target?.closest('yt-emoji-picker-renderer [role="option"]');
  if (!option || option.closest('.ytcq-frequent-emoji-row')) return;

  const emoji = getEmojiUsageData(option);
  if (!emoji) return;

  if (ignoredSyntheticEmojiKey === emoji.key) {
    ignoredSyntheticEmojiKey = '';
    return;
  }

  recordEmojiUsage(emoji);
}

function renderFrequentEmojiRow(picker: HTMLElement): void {
  const topEmojis = getTopEmojiUsage();
  let row = picker.querySelector<HTMLElement>('.ytcq-frequent-emoji-row');

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

  const label = document.createElement('div');
  label.className = 'ytcq-frequent-emoji-label';
  label.textContent = 'Most used';

  const list = document.createElement('div');
  list.className = 'ytcq-frequent-emoji-list';

  for (const emoji of topEmojis) {
    list.appendChild(createFrequentEmojiButton(picker, emoji));
  }

  row.replaceChildren(label, list);
}

function getFrequentEmojiRowHost(picker: HTMLElement): HTMLElement {
  return picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer:not(#search-category)') ||
    picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer') ||
    picker;
}

function createFrequentEmojiButton(picker: HTMLElement, emoji: EmojiUsage): HTMLButtonElement {
  const option = findEmojiOption(picker, emoji);
  const displayEmoji = getEmojiUsageData(option) || emoji;
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
    chooseFrequentEmoji(picker, displayEmoji, option);
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
    chooseFrequentEmoji(picker, displayEmoji, option);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    consumeEmojiButtonEvent(event);
    chooseFrequentEmoji(picker, displayEmoji, option);
  });

  return button;
}

function chooseFrequentEmoji(picker: HTMLElement, emoji: EmojiUsage, preferredOption: Element | null = null): void {
  const option = getUsableEmojiOption(picker, emoji, preferredOption);
  const inputBeforeClick = getChatInputSnapshot();

  if (!isEmojiPickerCategoryBarReady(picker) && insertEmojiIntoChat(emoji)) {
    recordEmojiUsage(emoji);
    return;
  }

  if (option) {
    const matchedEmoji = getEmojiUsageData(option) || emoji;
    ignoredSyntheticEmojiKey = matchedEmoji.key;
    (option as HTMLElement).click();
  } else {
    insertEmojiIntoChat(emoji);
  }

  window.setTimeout(() => {
    if (getChatInputSnapshot() === inputBeforeClick) {
      insertEmojiIntoChat(emoji);
    }
  }, 120);
  recordEmojiUsage(emoji);
}

function getEmojiUsageData(option: Element | null): EmojiUsage | null {
  const image = getEmojiOptionImage(option);
  const src = getEmojiImageSource(image);
  const alt = cleanText(image?.getAttribute('alt') || '');
  const label = cleanText(option?.getAttribute('aria-label') || image?.getAttribute('aria-label') || option?.getAttribute('title') || alt);
  const text = cleanText(option?.textContent || '');
  const shortcut = getEmojiShortcut([label, alt, text]);
  const key = shortcut ? `shortcut:${shortcut}` : label ? `label:${label}` : alt ? `alt:${alt}` : text ? `text:${text}` : src ? `src:${src}` : '';

  if (!key) return null;

  return {
    key,
    src,
    alt,
    label,
    shortcut,
    text,
    count: 0,
    lastUsed: 0
  };
}

function findEmojiOption(picker: HTMLElement, emoji: EmojiUsage): Element | null {
  return Array.from(picker.querySelectorAll('[role="option"]')).find((option) => {
    const data = getEmojiUsageData(option);
    return data && emojiRecordsMatch(data, emoji);
  }) || null;
}

function recordEmojiUsage(emoji: EmojiUsage): void {
  const existing = emojiUsage.find((item) => emojiRecordsMatch(item, emoji));
  const now = Date.now();

  if (existing) {
    existing.key = emoji.key || existing.key;
    existing.count += 1;
    existing.lastUsed = now;
    existing.src = emoji.src || existing.src;
    existing.alt = emoji.alt || existing.alt;
    existing.label = emoji.label || existing.label;
    existing.shortcut = emoji.shortcut || existing.shortcut;
    existing.text = emoji.text || existing.text;
  } else {
    emojiUsage.push({
      key: emoji.key,
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
  refreshEmojiPickers();
  window.setTimeout(refreshEmojiPickers, 150);
}

function normalizeEmojiUsage(value: unknown): EmojiUsage[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Partial<EmojiUsage> => Boolean(item && typeof item.key === 'string' && item.key))
    .map((item) => ({
      key: String(item.key),
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

function isEmojiPickerCategoryBarReady(picker: HTMLElement): boolean {
  return Boolean(picker.querySelector('#category-buttons yt-emoji-picker-category-button-renderer'));
}

function getUsableEmojiOption(picker: HTMLElement, emoji: EmojiUsage, preferredOption: Element | null): Element | null {
  if (
    preferredOption instanceof Element &&
    preferredOption.isConnected &&
    picker.contains(preferredOption) &&
    !preferredOption.closest('.ytcq-frequent-emoji-row')
  ) {
    return preferredOption;
  }

  return findEmojiOption(picker, emoji);
}

function getChatInputSnapshot(): string {
  const input = findChatInput();
  if (!input) return '';

  if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
    return input.value;
  }

  return input.innerHTML || input.textContent || '';
}

function insertEmojiIntoChat(emoji: EmojiUsage): boolean {
  const text = getEmojiInsertText(emoji);
  return text ? insertIntoChatInput(text) : false;
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

function isUsableEmojiImageSource(src: string | null | undefined): boolean {
  if (!src) return false;
  const value = String(src).trim();
  return Boolean(value) && !/^data:image\/gif/i.test(value);
}

function emojiRecordsMatch(a: Partial<EmojiUsage>, b: Partial<EmojiUsage>): boolean {
  if (!a || !b) return false;
  return Boolean(
    (a.key && b.key && a.key === b.key) ||
    (a.shortcut && b.shortcut && a.shortcut === b.shortcut) ||
    (a.label && b.label && a.label === b.label) ||
    (a.alt && b.alt && a.alt === b.alt) ||
    (a.text && b.text && a.text === b.text) ||
    (a.src && b.src && a.src === b.src)
  );
}

function getEmojiFallbackText(emoji: EmojiUsage): string {
  const candidates = [emoji.text, emoji.alt, emoji.label].map(cleanText).filter(Boolean);
  return candidates.find((value) => /\p{Extended_Pictographic}/u.test(value)) || candidates[0] || '';
}

function getEmojiInsertText(emoji: EmojiUsage): string {
  const candidates = [emoji.shortcut, emoji.text, emoji.alt, emoji.label]
    .map(cleanText)
    .filter(Boolean);
  const unicodeEmoji = candidates.find((value) => /\p{Extended_Pictographic}/u.test(value));
  if (unicodeEmoji) return unicodeEmoji;

  const shortcode = getEmojiShortcut(candidates);
  if (shortcode) return shortcode;

  return '';
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
