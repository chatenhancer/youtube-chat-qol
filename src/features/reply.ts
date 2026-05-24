/**
 * Reply insertion helpers.
 *
 * Mention and Quote insert plain text into YouTube's native chat input.
 * Clicking an author name is a quick Mention shortcut. Alt/Option-clicking an
 * author name quotes that message while normal message clicks remain available
 * for YouTube's own message UI.
 */
import { getOptions } from '../shared/state';
import { t } from '../shared/i18n';
import { cleanText } from '../shared/text';
import { showToast } from '../shared/toast';
import { insertIntoChatInput, insertNodesIntoChatInput, returnToChatInputPanel } from '../youtube/chat-input';
import {
  getCleanAttribute,
  getElementImageSource,
  getElementTextFallback,
  isEmojiLikeElement,
  isIgnoredMessageContentElement,
  isMessageLineBreakElement
} from '../youtube/message-content';
import { getMessageContentNodes, getMessageDetails } from '../youtube/messages';
import type { RichTextSegment } from '../youtube/rich-text';

const CHAT_INPUT_RETRY_DELAYS = [80, 180, 360, 600];
const INPUT_EMOJI_CLASS = 'emoji yt-formatted-string style-scope yt-live-chat-text-input-field-renderer';
const INVISIBLE_QUOTE_TEXT_PATTERN = /[\u200B\u2060\uFEFF]/g;

interface RichQuoteContent {
  nodes?: Node[];
  segments?: RichTextSegment[];
}

interface QuoteContentBuild {
  nodes: Node[];
  truncated: boolean;
}

export function wireAuthorNameMention(message: HTMLElement): void {
  if (message.dataset.ytcqAuthorMentionWired === 'true') return;
  message.dataset.ytcqAuthorMentionWired = 'true';

  const authorName = message.querySelector<HTMLElement>('#author-name');
  if (!authorName) return;

  authorName.title = t('mentionUserTitle');
  authorName.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    replyToMessage(message, { quote: event.altKey });
  }, true);
}

export function replyToMessage(message: HTMLElement, { quote }: { quote: boolean }): void {
  const details = getMessageDetails(message);
  if (quote && details.text) {
    quoteAuthorRichText(details.authorName, details.text, {
      nodes: getMessageContentNodes(message)
    });
  } else {
    mentionAuthorName(details.authorName);
  }
}

export function mentionAuthorName(authorName: string): void {
  const mentionText = formatMentionText(authorName);
  if (!mentionText) {
    showToast(t('couldNotReadUserName'));
    return;
  }

  insertMentionText(mentionText);
}

export function quoteAuthorText(authorName: string, text: string): void {
  const quoteText = formatQuoteText(authorName, text);
  if (!quoteText) {
    showToast(t('couldNotReadUserName'));
    return;
  }

  insertMentionText(quoteText);
}

export function quoteAuthorRichText(authorName: string, text: string, content: RichQuoteContent): void {
  const cleanAuthorName = cleanText(authorName);
  if (!cleanAuthorName) {
    showToast(t('couldNotReadUserName'));
    return;
  }

  const cleanMessage = cleanText(text);
  if (!cleanMessage) {
    insertMentionText(`${cleanAuthorName} `);
    return;
  }

  const quoteContent = createQuoteContentNodes(content, cleanMessage);
  const fallbackText = formatQuoteText(cleanAuthorName, cleanMessage);
  if (!quoteContent.nodes.length) {
    insertMentionText(fallbackText);
    return;
  }

  insertMentionNodes([
    document.createTextNode(`${cleanAuthorName} : "`),
    ...quoteContent.nodes,
    document.createTextNode(`${quoteContent.truncated ? '...' : ''}"`)
  ], fallbackText, ' ');
}

export function formatMentionText(authorName: string): string {
  const cleanAuthorName = cleanText(authorName);
  return cleanAuthorName ? `${cleanAuthorName} ` : '';
}

export function formatQuoteText(authorName: string, text: string): string {
  const cleanAuthorName = cleanText(authorName);
  if (!cleanAuthorName) return '';

  const cleanMessage = cleanText(text);
  if (!cleanMessage) {
    return `${cleanAuthorName} `;
  }

  return `${cleanAuthorName} : "${truncateForQuote(cleanMessage)}" `;
}

function insertMentionText(text: string): void {
  insertWithChatInputRecovery(() => insertIntoChatInput(text));
}

function insertMentionNodes(nodes: Node[], fallbackText: string, trailingText = ''): void {
  insertWithChatInputRecovery(() => insertNodesIntoChatInput(nodes, fallbackText, trailingText));
}

function insertWithChatInputRecovery(insert: () => boolean): void {
  if (!insert()) {
    if (!returnToChatInputPanel()) {
      showToast(t('couldNotFindChatInput'));
      return;
    }

    retryInsertMentionContent(insert, 0);
  }
}

function retryInsertMentionContent(insert: () => boolean, attempt: number): void {
  const delay = CHAT_INPUT_RETRY_DELAYS[attempt];
  if (delay === undefined) {
    showToast(t('couldNotFindChatInput'));
    return;
  }

  window.setTimeout(() => {
    if (insert()) return;
    retryInsertMentionContent(insert, attempt + 1);
  }, delay);
}

function truncateForQuote(text: string): string {
  const clean = cleanText(text);
  const { quoteMaxLength } = getOptions();
  if (clean.length <= quoteMaxLength) return clean;
  return `${clean.slice(0, Math.max(0, quoteMaxLength - 3)).trim()}...`;
}

function createQuoteContentNodes(content: RichQuoteContent, fallbackText: string): QuoteContentBuild {
  const state = {
    remaining: getOptions().quoteMaxLength,
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
  const src = cleanText(data.src);
  const alt = cleanText(data.alt);
  if (!src || !alt) return null;

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
