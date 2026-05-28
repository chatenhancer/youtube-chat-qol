import { t } from '../../shared/i18n';
import { getEmojiFallbackText } from './data';
import type { EmojiUsage } from './types';

export function renderFrequentEmojiRow(
  picker: HTMLElement,
  topEmojis: EmojiUsage[],
  chooseEmoji: (emoji: EmojiUsage) => void
): void {
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
  label.textContent = t('mostUsed');

  const list = document.createElement('div');
  list.className = 'ytcq-frequent-emoji-list';

  for (const emoji of topEmojis) {
    list.appendChild(createFrequentEmojiButton(emoji, chooseEmoji));
  }

  row.replaceChildren(label, list);
}

function getFrequentEmojiRowHost(picker: HTMLElement): HTMLElement {
  return picker.querySelector<HTMLElement>('#categories') ||
    picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer:not(#search-category)') ||
    picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer') ||
    picker;
}

function createFrequentEmojiButton(emoji: EmojiUsage, chooseEmoji: (emoji: EmojiUsage) => void): HTMLButtonElement {
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
    chooseEmoji(displayEmoji);
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
    chooseEmoji(displayEmoji);
  });
  button.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    consumeEmojiButtonEvent(event);
    chooseEmoji(displayEmoji);
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

function consumeEmojiButtonEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}
