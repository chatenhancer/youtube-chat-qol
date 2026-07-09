/**
 * Frequent emoji insertion.
 *
 * Inserts a saved frequent emoji into YouTube's chat input, preserving custom
 * YouTube emoji image metadata when available.
 */
import { jsx, el, UNMANAGED } from '../../shared/jsx-dom';
import { cleanText } from '../../shared/text';
import { insertIntoChatInput, insertNodeIntoChatInput } from '../../youtube/chat-input';
import { getEmojiFallbackText, getEmojiInsertText, isCustomEmojiUsage } from './data';
import type { EmojiUsage } from './types';

export function insertEmojiIntoChat(emoji: EmojiUsage): boolean {
  if (emoji.src && insertEmojiImageIntoChat(emoji)) return true;

  const text = getEmojiInsertText(emoji);
  return text ? insertIntoChatInput(text) : false;
}

function insertEmojiImageIntoChat(emoji: EmojiUsage): boolean {
  const alt = cleanText(emoji.alt || getEmojiFallbackText(emoji) || emoji.label || emoji.shortcut);
  if (!alt) return false;

  const emojiId = isCustomEmojiUsage(emoji) ? cleanText(emoji.emojiId) : '';
  if (isCustomEmojiUsage(emoji)) {
    if (!emojiId) return false;
  }
  const tooltipText = cleanText(emoji.shortcut || emoji.label);
  const image = el<HTMLImageElement>(
    <img
      class="emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer"
      src={emoji.src}
      alt={alt}
      id={emojiId || undefined}
      data-emoji-id={emojiId || undefined}
      shared-tooltip-text={tooltipText || undefined}
    />,
    UNMANAGED
  );

  return insertNodeIntoChatInput(image, alt);
}
