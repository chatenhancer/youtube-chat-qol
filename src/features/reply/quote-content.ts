/**
 * Rich quote content builder.
 *
 * Converts cloned chat message content into safe input nodes, preserving emoji
 * images while enforcing the quote character budget.
 */
import { cleanText } from '../../shared/text';
import {
  getCleanAttribute,
  getElementImageSource,
  getElementTextFallback,
  isEmojiLikeElement,
  isIgnoredMessageContentElement,
  isMessageLineBreakElement
} from '../../youtube/message-content';
import type { RichTextSegment } from '../../youtube/rich-text';
import { QUOTE_MAX_LENGTH, truncateForQuote } from './format';
import type { RichQuoteContent } from './types';

const INPUT_EMOJI_CLASS = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
const INVISIBLE_QUOTE_TEXT_PATTERN = /[\u200B\u2060\uFEFF]/g;

interface QuoteContentBuild {
  nodes: Node[];
  truncated: boolean;
}

export function createQuoteContentNodes(content: RichQuoteContent, fallbackText: string): QuoteContentBuild {
  const state = {
    remaining: QUOTE_MAX_LENGTH,
    truncated: false
  };
  const nodes: Node[] = [];

  if (content.nodes?.length) {
    content.nodes.forEach((node) => appendQuoteNode(nodes, node, state));
  } else if (content.segments?.length) {
    content.segments.forEach((segment) => appendQuoteSegment(nodes, segment, state));
  }

  if (!nodes.length) {
    nodes.push(document.createTextNode(truncateForQuote(fallbackText)));
    return {
      nodes,
      truncated: false
    };
  }

  return {
    nodes,
    truncated: state.truncated
  };
}

function appendQuoteNode(
  nodes: Node[],
  node: Node,
  state: { remaining: number; truncated: boolean }
): void {
  if (state.remaining <= 0) {
    state.truncated = true;
    return;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    appendQuoteText(nodes, node.textContent || '', state);
    return;
  }
  if (!(node instanceof Element)) return;
  if (isIgnoredMessageContentElement(node)) return;

  if (isMessageLineBreakElement(node)) {
    appendQuoteText(nodes, '\n', state);
    return;
  }

  if (isEmojiLikeElement(node)) {
    appendQuoteEmoji(nodes, node, state);
    return;
  }

  node.childNodes.forEach((child) => appendQuoteNode(nodes, child, state));
}

function appendQuoteSegment(
  nodes: Node[],
  segment: RichTextSegment,
  state: { remaining: number; truncated: boolean }
): void {
  if (state.remaining <= 0) {
    state.truncated = true;
    return;
  }

  if (segment.type === 'text') {
    appendQuoteText(nodes, segment.text, state);
    return;
  }

  const fallbackText = cleanText(segment.alt || segment.tooltip || segment.emojiId);
  if (!consumeQuoteBudget(fallbackText, state)) return;

  nodes.push(createInputEmojiNode({
    src: segment.src,
    alt: fallbackText,
    emojiId: segment.emojiId,
    tooltip: segment.tooltip
  }) || document.createTextNode(fallbackText));
}

function appendQuoteText(
  nodes: Node[],
  text: string,
  state: { remaining: number; truncated: boolean }
): void {
  const clean = text.replace(INVISIBLE_QUOTE_TEXT_PATTERN, '');
  if (!clean) return;

  if (clean.length > state.remaining) {
    const sliceLength = Math.max(0, state.remaining - 3);
    const truncatedText = clean.slice(0, sliceLength).trimEnd();
    if (truncatedText) nodes.push(document.createTextNode(truncatedText));
    state.remaining = 0;
    state.truncated = true;
    return;
  }

  nodes.push(document.createTextNode(clean));
  state.remaining -= clean.length;
}

function appendQuoteEmoji(
  nodes: Node[],
  element: Element,
  state: { remaining: number; truncated: boolean }
): void {
  const fallbackText = getElementTextFallback(element);
  if (!fallbackText || !consumeQuoteBudget(fallbackText, state)) return;

  nodes.push(createInputEmojiNodeFromElement(element, fallbackText) || document.createTextNode(fallbackText));
}

function consumeQuoteBudget(
  text: string,
  state: { remaining: number; truncated: boolean }
): boolean {
  const clean = cleanText(text);
  if (!clean) return false;
  if (clean.length > state.remaining) {
    state.remaining = 0;
    state.truncated = true;
    return false;
  }

  state.remaining -= clean.length;
  return true;
}

function createInputEmojiNodeFromElement(element: Element, fallbackText: string): HTMLImageElement | null {
  return createInputEmojiNode({
    src: getElementImageSource(element),
    alt: fallbackText,
    emojiId: getCleanAttribute(element, 'data-emoji-id'),
    tooltip: getCleanAttribute(element, 'shared-tooltip-text') ||
      getCleanAttribute(element, 'title') ||
      getCleanAttribute(element, 'aria-label')
  });
}

function createInputEmojiNode(data: {
  src: string;
  alt: string;
  emojiId: string;
  tooltip: string;
}): HTMLImageElement | null {
  const src = getSafeImageSource(data.src);
  const alt = cleanText(data.alt);
  if (!src || !alt) return null;

  // ytcq-allow-raw-create-element: inserted into YouTube's chat input as quoted emoji content.
  const image = document.createElement('img');
  image.className = INPUT_EMOJI_CLASS;
  image.src = src;
  image.alt = alt;

  const emojiId = cleanText(data.emojiId);
  if (emojiId) {
    image.id = emojiId;
    image.setAttribute('data-emoji-id', emojiId);
  }

  const tooltip = cleanText(data.tooltip);
  if (tooltip) image.setAttribute('shared-tooltip-text', tooltip);

  return image;
}

function getSafeImageSource(value: string): string {
  const src = cleanText(value);
  if (!src) return '';

  try {
    const url = new URL(src, window.location.href);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}
