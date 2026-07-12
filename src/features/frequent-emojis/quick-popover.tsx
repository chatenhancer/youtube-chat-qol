/**
 * Composer-adjacent frequent emoji popover.
 *
 * Owns the delayed hover/focus surface anchored to YouTube's native emoji
 * button. The popover is mounted under body so composer overflow cannot clip
 * it, while usage tracking and insertion remain owned by the feature entrypoint.
 */
import { t } from '../../shared/i18n';
import { jsx, el } from '../../shared/jsx-dom';
import { createFrequentEmojiButton, getFrequentEmojiRenderKey } from './row';
import type { EmojiUsage } from './types';

const QUICK_EMOJI_OPEN_DELAY_MS = 150;
const QUICK_EMOJI_CLOSE_DELAY_MS = 140;
const QUICK_EMOJI_FADE_OUT_MS = 100;
const NATIVE_PICKER_TRANSITION_GUARD_MS = 600;
const CLOSING_CLASS = 'ytcq-quick-emoji-popover-closing';
const BELOW_CLASS = 'ytcq-quick-emoji-popover-below';
const NATIVE_EMOJI_RENDERER_SELECTOR = [
  '#emoji-picker-button yt-live-chat-icon-toggle-button-renderer#emoji',
  '#emoji-picker-button yt-icon-button#emoji',
  '#emoji.style-scope.yt-live-chat-message-input-renderer'
].join(', ');

let getTopEmojis: () => EmojiUsage[] = () => [];
let chooseEmoji: (emoji: EmojiUsage) => void = () => {};
let openTimer = 0;
let closeTimer = 0;
let fadeOutTimer = 0;
let popover: HTMLElement | null = null;
let closingPopover: HTMLElement | null = null;
let anchor: HTMLElement | null = null;
let visibleEmojis: EmojiUsage[] = [];
let suppressFocusOpen = false;
let nativePickerTransitionUntil = 0;
let listeners = new AbortController();

export function initQuickEmojiPopover(
  readTopEmojis: () => EmojiUsage[],
  onChooseEmoji: (emoji: EmojiUsage) => void
): void {
  listeners.abort();
  listeners = new AbortController();
  getTopEmojis = readTopEmojis;
  chooseEmoji = onChooseEmoji;
  const options = { capture: true, signal: listeners.signal };

  document.addEventListener('pointerdown', handleNativeEmojiTogglePress, options);
  document.addEventListener('click', handleNativeEmojiTogglePress, options);
  document.addEventListener('pointerover', handlePointerOver, options);
  document.addEventListener('pointerout', handlePointerOut, options);
  document.addEventListener('focusin', handleFocusIn, options);
  document.addEventListener('focusout', handleFocusOut, options);
  document.addEventListener('keydown', handleKeydown, options);
}

export function resetQuickEmojiPopover(): void {
  nativePickerTransitionUntil = 0;
  closeQuickEmojiPopover(false);
}

export function cleanupQuickEmojiPopover(): void {
  listeners.abort();
  listeners = new AbortController();
  nativePickerTransitionUntil = 0;
  closeQuickEmojiPopover(false);
  getTopEmojis = () => [];
  chooseEmoji = () => {};
}

export function cleanupDisconnectedQuickEmojiPopover(): void {
  if (anchor && !anchor.isConnected) closeQuickEmojiPopover();
}

export function suppressQuickEmojiPopoverForNativePicker(): void {
  nativePickerTransitionUntil = Date.now() + NATIVE_PICKER_TRANSITION_GUARD_MS;
  closeQuickEmojiPopover(false);
}

export function closeQuickEmojiPopover(animate = true): void {
  cancelOpen();
  cancelClose();

  const currentPopover = popover;
  popover = null;
  anchor = null;
  visibleEmojis = [];

  if (!animate) {
    currentPopover?.remove();
    removeClosingPopover();
    return;
  }
  if (!currentPopover) return;

  removeClosingPopover();
  closingPopover = currentPopover;
  currentPopover.classList.add(CLOSING_CLASS);
  currentPopover.setAttribute('aria-hidden', 'true');
  currentPopover.inert = true;
  fadeOutTimer = window.setTimeout(removeClosingPopover, QUICK_EMOJI_FADE_OUT_MS);
}

export function refreshQuickEmojiPopover(): void {
  if (!popover || !anchor) return;
  const latestEmojis = getTopEmojis();
  visibleEmojis = latestEmojis.length
    ? visibleEmojis.map((visibleEmoji) => {
        return latestEmojis.find((emoji) => emoji.key === visibleEmoji.key) || visibleEmoji;
      })
    : [];
  popover = renderQuickEmojiPopover(popover, visibleEmojis, chooseEmoji);
  if (!popover) {
    anchor = null;
    return;
  }
}

export function renderQuickEmojiPopover(
  currentPopover: HTMLElement | null,
  topEmojis: EmojiUsage[],
  onChooseEmoji: (emoji: EmojiUsage) => void
): HTMLElement | null {
  if (!topEmojis.length) {
    currentPopover?.remove();
    return null;
  }

  const nextPopover = currentPopover || createQuickEmojiPopover();
  const displayEmojis = [...topEmojis].reverse();
  nextPopover.style.setProperty(
    '--ytcq-quick-emoji-columns',
    String(Math.min(10, topEmojis.length))
  );
  nextPopover.style.setProperty(
    '--ytcq-quick-emoji-compact-columns',
    String(Math.min(5, topEmojis.length))
  );
  const renderKey = getFrequentEmojiRenderKey(displayEmojis);
  if (nextPopover.dataset.ytcqEmojiRenderKey === renderKey) return nextPopover;

  nextPopover.dataset.ytcqEmojiRenderKey = renderKey;
  nextPopover.replaceChildren(
    ...displayEmojis.map((emoji) => createFrequentEmojiButton(emoji, onChooseEmoji))
  );
  return nextPopover;
}

function createQuickEmojiPopover(): HTMLElement {
  return el<HTMLDivElement>(
    <div class="ytcq-quick-emoji-popover" role="toolbar" aria-label={t('mostUsed')} />
  );
}

function handleNativeEmojiTogglePress(event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  if (getNativeEmojiToggle(target)) suppressQuickEmojiPopoverForNativePicker();
}

function handlePointerOver(event: PointerEvent): void {
  if (event.pointerType === 'touch') return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (popover?.contains(target)) {
    cancelClose();
    return;
  }

  const toggle = getNativeEmojiToggle(target);
  if (!toggle) return;
  cancelClose();
  if (event.relatedTarget instanceof Node && toggle.contains(event.relatedTarget)) return;
  scheduleOpen(toggle, QUICK_EMOJI_OPEN_DELAY_MS);
}

function handlePointerOut(event: PointerEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const toggle = getNativeEmojiToggle(target);
  if (!toggle && !isWithinSurface(target)) return;
  if (
    event.relatedTarget instanceof Node &&
    (isWithinSurface(event.relatedTarget) || toggle?.contains(event.relatedTarget))
  )
    return;
  scheduleClose();
}

function handleFocusIn(event: FocusEvent): void {
  if (suppressFocusOpen) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (popover?.contains(target)) {
    cancelClose();
    return;
  }

  const toggle = getNativeEmojiToggle(target);
  if (!toggle) return;
  cancelClose();
  scheduleOpen(toggle, 0);
}

function handleFocusOut(event: FocusEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (!target || !isWithinSurface(target)) return;
  if (event.relatedTarget instanceof Node && isWithinSurface(event.relatedTarget)) return;
  closeQuickEmojiPopover();
}

function handleKeydown(event: KeyboardEvent): void {
  const eventTarget = event.target instanceof Node ? event.target : null;
  if (event.key === 'Escape' && popover) {
    const shouldRestoreFocus = Boolean(eventTarget && popover.contains(eventTarget));
    const focusTarget = anchor;
    closeQuickEmojiPopover();
    if (shouldRestoreFocus && focusTarget) {
      suppressFocusOpen = true;
      focusTarget.focus();
      suppressFocusOpen = false;
    }
    return;
  }

  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  const target = event.target instanceof Element ? event.target : null;
  const toggle = getNativeEmojiToggle(target);
  if (!toggle) return;

  event.preventDefault();
  cancelOpen();
  showPopover(toggle);
  popover?.querySelector<HTMLButtonElement>('.ytcq-frequent-emoji-button')?.focus();
}

function scheduleOpen(nextAnchor: HTMLElement, delay: number): void {
  if (!canOpenQuickEmojiPopover() || !getTopEmojis().length) return;
  if (popover && anchor === nextAnchor) return;
  cancelOpen();
  openTimer = window.setTimeout(() => {
    openTimer = 0;
    showPopover(nextAnchor);
  }, delay);
}

function showPopover(nextAnchor: HTMLElement): void {
  if (!nextAnchor.isConnected || !canOpenQuickEmojiPopover()) return;
  const topEmojis = getTopEmojis();
  if (!topEmojis.length) return;

  removeClosingPopover();
  anchor = nextAnchor;
  if (!popover || !visibleEmojis.length) visibleEmojis = topEmojis;
  popover = renderQuickEmojiPopover(popover, visibleEmojis, chooseEmoji);
  if (!popover) return;
  if (!popover.isConnected) document.body.append(popover);
  positionPopover();
}

function cancelOpen(): void {
  window.clearTimeout(openTimer);
  openTimer = 0;
}

function scheduleClose(): void {
  cancelOpen();
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    closeTimer = 0;
    closeQuickEmojiPopover();
  }, QUICK_EMOJI_CLOSE_DELAY_MS);
}

function cancelClose(): void {
  window.clearTimeout(closeTimer);
  closeTimer = 0;
}

function removeClosingPopover(): void {
  window.clearTimeout(fadeOutTimer);
  fadeOutTimer = 0;
  closingPopover?.remove();
  closingPopover = null;
}

function positionPopover(): void {
  if (!popover || !anchor?.isConnected) return;

  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const edgePadding = 8;
  const gap = 6;
  const width = popover.offsetWidth || popoverRect.width;
  const height = popover.offsetHeight || popoverRect.height;
  const maxLeft = Math.max(edgePadding, window.innerWidth - width - edgePadding);
  const left = Math.min(Math.max(edgePadding, anchorRect.right - width), maxLeft);
  const preferredTop = anchorRect.top - height - gap;
  const belowTop = anchorRect.bottom + gap;
  const top =
    preferredTop >= edgePadding
      ? preferredTop
      : Math.min(belowTop, Math.max(edgePadding, window.innerHeight - height - edgePadding));

  popover.classList.toggle(BELOW_CLASS, preferredTop < edgePadding);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function getNativeEmojiToggle(target: Element | null): HTMLElement | null {
  if (
    !target ||
    target.closest(
      'yt-emoji-picker-renderer, .ytcq-frequent-emoji-row, .ytcq-composer-translate-control'
    )
  )
    return null;
  const renderer = target.closest<HTMLElement>(NATIVE_EMOJI_RENDERER_SELECTOR);
  if (!renderer) return null;
  return (
    target.closest<HTMLElement>('button, #button') ||
    renderer.querySelector<HTMLElement>('button, #button') ||
    renderer
  );
}

function canOpenQuickEmojiPopover(): boolean {
  return Date.now() >= nativePickerTransitionUntil && !isNativeEmojiPickerVisible();
}

function isNativeEmojiPickerVisible(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('yt-emoji-picker-renderer')).some(
    (picker) => {
      if (picker.hidden || picker.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(picker);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0' ||
        style.pointerEvents === 'none'
      )
        return false;
      return (
        picker.getClientRects().length > 0 ||
        Boolean(picker.querySelector<HTMLElement>('#categories')?.getClientRects().length)
      );
    }
  );
}

function isWithinSurface(target: Node): boolean {
  return Boolean(popover?.contains(target) || anchor?.contains(target));
}
