/**
 * Most-used emoji row.
 *
 * Tracks emoji selections locally, renders a compact row at the top of
 * YouTube's emoji picker, and inserts selected frequent emojis directly into
 * the chat input. The row is capped so it does not crowd the native emoji list.
 */
import { getEmojiUsageData, isVariantParentEmoji } from './data';
import { insertEmojiIntoChat } from './insert';
import { renderFrequentEmojiRow as renderFrequentEmojiRowView } from './row';
import type { EmojiUsage } from './types';
import { getTopEmojiUsage, normalizeEmojiUsage, upsertEmojiUsage } from './usage';

const EMOJI_USAGE_STORAGE_KEY = 'ytcqEmojiUsage';

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

export function resetFrequentEmojis(): void {
  window.clearTimeout(emojiUsageSaveTimer);
  window.clearTimeout(emojiPickerRefreshTimer);
  emojiUsageSaveTimer = 0;
  emojiPickerRefreshTimer = 0;
  emojiUsage = [];
  document.querySelectorAll('.ytcq-frequent-emoji-row').forEach((row) => row.remove());
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
  renderFrequentEmojiRowView(picker, getTopEmojiUsage(emojiUsage), chooseFrequentEmoji);
}

function chooseFrequentEmoji(emoji: EmojiUsage): void {
  if (!insertEmojiIntoChat(emoji)) return;
  recordEmojiUsage(emoji, { refreshPickers: false });
}

function recordEmojiUsage(emoji: EmojiUsage, options: { refreshPickers?: boolean } = {}): void {
  emojiUsage = upsertEmojiUsage(emojiUsage, emoji);
  scheduleEmojiUsageSave();
  if (options.refreshPickers !== false) refreshEmojiPickers();
}

function scheduleEmojiUsageSave(): void {
  window.clearTimeout(emojiUsageSaveTimer);
  emojiUsageSaveTimer = window.setTimeout(() => {
    chrome.storage.local.set({ [EMOJI_USAGE_STORAGE_KEY]: emojiUsage });
  }, 150);
}
