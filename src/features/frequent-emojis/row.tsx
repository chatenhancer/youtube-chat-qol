/**
 * Frequent emoji row rendering.
 *
 * Adds and refreshes the compact most-used emoji row inside YouTube's native
 * emoji picker without disturbing the picker scroll area.
 */
import { t } from '../../shared/i18n';
import { Fragment, jsx, el } from '../../shared/jsx-dom';
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
    row = el<HTMLDivElement>(<div class="ytcq-frequent-emoji-row" />);
  }

  if (row.parentElement !== rowHost || row !== rowHost.firstElementChild) {
    rowHost.insertBefore(row, rowHost.firstElementChild);
  }

  if (row.dataset.ytcqEmojiRenderKey === renderKey) return;
  row.dataset.ytcqEmojiRenderKey = renderKey;

  row.replaceChildren(
    <>
      <div class="ytcq-frequent-emoji-label">{t('mostUsed')}</div>
      <div class="ytcq-frequent-emoji-list">
        {topEmojis.map((emoji) => createFrequentEmojiButton(emoji, chooseEmoji))}
      </div>
    </>
  );
}

function getFrequentEmojiRowHost(picker: HTMLElement): HTMLElement {
  return (
    picker.querySelector<HTMLElement>('#categories') ||
    picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer:not(#search-category)') ||
    picker.querySelector<HTMLElement>('yt-emoji-picker-category-renderer') ||
    picker
  );
}

export function createFrequentEmojiButton(
  emoji: EmojiUsage,
  chooseEmoji: (emoji: EmojiUsage) => void,
  options: { showTooltip?: boolean } = {}
): HTMLButtonElement {
  const displayEmoji = emoji;
  const title = getFrequentEmojiButtonTitle(displayEmoji);
  let handledPointer = false;
  const activate = (event: Event) => {
    consumeEmojiButtonEvent(event);
    handledPointer = event.type === 'pointerdown' || event.type === 'mousedown';
    chooseEmoji(displayEmoji);
  };

  return el<HTMLButtonElement>(
    <button
      type="button"
      class="ytcq-frequent-emoji-button"
      title={options.showTooltip === false ? undefined : title}
      aria-label={title}
      onPointerDown={activate}
      onMouseDown={(event: MouseEvent) => {
        if (handledPointer) {
          consumeEmojiButtonEvent(event);
          return;
        }
        activate(event);
      }}
      onClick={(event: MouseEvent) => {
        consumeEmojiButtonEvent(event);
        if (handledPointer) {
          handledPointer = false;
          return;
        }
        chooseEmoji(displayEmoji);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        consumeEmojiButtonEvent(event);
        chooseEmoji(displayEmoji);
      }}
    >
      {displayEmoji.src ? (
        <img
          src={displayEmoji.src}
          alt={displayEmoji.alt || displayEmoji.text || displayEmoji.label || ''}
          loading="lazy"
        />
      ) : (
        getEmojiFallbackText(displayEmoji)
      )}
    </button>
  );
}

function getFrequentEmojiButtonTitle(emoji: EmojiUsage): string {
  const label = emoji.label || emoji.alt || emoji.text || 'Emoji';
  return `${label} (${t('emojiUsageCount', { count: emoji.count })})`;
}

export function getFrequentEmojiRenderKey(topEmojis: EmojiUsage[]): string {
  return topEmojis
    .map((emoji) =>
      [
        emoji.key,
        emoji.src,
        emoji.alt,
        emoji.label,
        emoji.emojiId,
        emoji.shortcut,
        emoji.text,
        emoji.count,
        emoji.lastUsed
      ].join('|')
    )
    .join('\n');
}

function consumeEmojiButtonEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}
