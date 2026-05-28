/**
 * Frequent emoji insertion.
 *
 * Inserts a saved frequent emoji into YouTube's chat input, preserving custom
 * YouTube emoji image metadata when available.
 */
import { cleanText } from '../../shared/text';
import { insertIntoChatInput, insertNodeIntoChatInput } from '../../youtube/chat-input';
import {
  getEmojiFallbackText,
  getEmojiInsertText,
  isCustomEmojiUsage
} from './data';
import type { EmojiUsage } from './types';

export function insertEmojiIntoChat(emoji: EmojiUsage): boolean {
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
