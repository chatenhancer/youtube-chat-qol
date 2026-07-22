/**
 * Most-used emoji surfaces.
 *
 * Tracks emoji selections locally, renders a compact row at the top of
 * YouTube's emoji picker, and exposes the same emojis from a composer-adjacent
 * quick popover. Both surfaces insert directly into the native chat input.
 */
import { registerFeature } from '../../content/dispatcher';
import { getEmojiUsageData, isVariantParentEmoji } from './data';
import { insertEmojiIntoChat } from './insert';
import {
  cleanupDisconnectedQuickEmojiPopover,
  cleanupQuickEmojiPopover,
  initQuickEmojiPopover,
  refreshQuickEmojiPopover,
  resetQuickEmojiPopover,
  suppressQuickEmojiPopoverForNativePicker
} from './quick-popover';
import { renderFrequentEmojiRow as renderFrequentEmojiRowView } from './row';
import type { EmojiUsage } from './types';
import { getTopEmojiUsage, normalizeEmojiUsage, upsertEmojiUsage } from './usage';

const EMOJI_USAGE_STORAGE_KEY = 'ytcqEmojiUsage';

let emojiUsage: EmojiUsage[] = [];
let emojiUsageSaveTimer = 0;
let emojiPickerRefreshTimer = 0;
let frequentEmojiListeners = new AbortController();

registerFeature({
  page: {
    init: initFrequentEmojis,
    cleanup: cleanupStaleFrequentEmojis,
    reset: resetFrequentEmojis
  },
  mutation: handleFrequentEmojiMutations
});

export function initFrequentEmojis(): void {
  frequentEmojiListeners.abort();
  frequentEmojiListeners = new AbortController();
  document.addEventListener('click', handleEmojiPickerClick, {
    capture: true,
    signal: frequentEmojiListeners.signal
  });
  initQuickEmojiPopover(() => getTopEmojiUsage(emojiUsage), chooseFrequentEmoji);
  chrome.storage.local.get({ [EMOJI_USAGE_STORAGE_KEY]: [] }, (stored) => {
    emojiUsage = normalizeEmojiUsage((stored || {})[EMOJI_USAGE_STORAGE_KEY]);
    refreshEmojiPickers();
    refreshQuickEmojiPopover();
  });
}

export function enhanceEmojiPicker(picker: Element): void {
  if (!(picker instanceof HTMLElement)) return;
  renderFrequentEmojiRow(picker);
}

export function resetFrequentEmojis(): void {
  clearFrequentEmojiTimers();
  emojiUsage = [];
  resetQuickEmojiPopover();
  document.querySelectorAll('.ytcq-frequent-emoji-row').forEach((row) => row.remove());
}

export function cleanupStaleFrequentEmojis(): void {
  frequentEmojiListeners.abort();
  frequentEmojiListeners = new AbortController();
  clearFrequentEmojiTimers();
  cleanupQuickEmojiPopover();
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
  return (
    !target.closest('yt-emoji-picker-renderer') &&
    Boolean(target.closest('#emoji.style-scope.yt-live-chat-message-input-renderer'))
  );
}

export function handleEmojiPickerClick(event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  if (target && isEmojiPickerToggle(target)) scheduleEmojiPickerRefresh();

  const option = target?.closest('yt-emoji-picker-renderer [role="option"]');
  if (!option || option.closest('.ytcq-frequent-emoji-row')) return;

  const emoji = getEmojiUsageData(option);
  if (!emoji || isVariantParentEmoji(emoji)) return;
  recordEmojiUsage(emoji);
}

function handleFrequentEmojiMutations({ addedElements }: { addedElements: Element[] }): void {
  cleanupDisconnectedQuickEmojiPopover();
  if (addedElements.some(containsNativeEmojiPicker)) {
    suppressQuickEmojiPopoverForNativePicker();
  }
  addedElements.forEach((element) => {
    if (element.matches('yt-emoji-picker-renderer')) enhanceEmojiPicker(element);

    const containingEmojiPicker = element.closest('yt-emoji-picker-renderer');
    if (containingEmojiPicker) enhanceEmojiPicker(containingEmojiPicker);

    element.querySelectorAll('yt-emoji-picker-renderer').forEach(enhanceEmojiPicker);
  });
}

function containsNativeEmojiPicker(element: Element): boolean {
  return (
    element.matches('yt-emoji-picker-renderer') ||
    Boolean(element.querySelector('yt-emoji-picker-renderer'))
  );
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
  refreshQuickEmojiPopover();
}

function scheduleEmojiUsageSave(): void {
  window.clearTimeout(emojiUsageSaveTimer);
  emojiUsageSaveTimer = window.setTimeout(() => {
    chrome.storage.local.set({ [EMOJI_USAGE_STORAGE_KEY]: emojiUsage });
  }, 150);
}

function clearFrequentEmojiTimers(): void {
  window.clearTimeout(emojiUsageSaveTimer);
  window.clearTimeout(emojiPickerRefreshTimer);
  emojiUsageSaveTimer = 0;
  emojiPickerRefreshTimer = 0;
}
