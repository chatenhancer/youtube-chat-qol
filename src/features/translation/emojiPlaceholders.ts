/**
 * Emoji placeholder planning.
 *
 * Google Translate often drops or distorts emoji/custom-emote text. Before a
 * request is queued, this module replaces emoji-like message runs with stable
 * placeholders, then maps translated placeholders back to the original emoji
 * tokens during rendering.
 */
import { cleanText } from '../../shared/text';
import {
  getEmojiTextFromRun,
  getMessageRuns,
  getMessageTextElement,
  getStoredOriginalMessage
} from '../../youtube/messages';

export interface EmojiToken {
  placeholder: string;
  fallbackText: string;
  node: Node | null;
}

export interface TranslationPlan {
  text: string;
  emojiTokens: EmojiToken[];
}

const EMOJI_PLACEHOLDER_PATTERN = /_{0,2}\s*YTCQ[\s_-]*EMOJI[\s_-]*(\d+)[\s_-]*TOKEN\s*_{0,2}/gi;
const UNICODE_EMOJI_PATTERN = /\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?)*/gu;

export function createTranslationPlan(message: HTMLElement, originalText: string): TranslationPlan {
  const emojiTokens: EmojiToken[] = [];
  const messageText = getMessageTextElement(message);
  const original = getStoredOriginalMessage(message);
  const sourceNodes = original?.childNodes || messageText?.childNodes;
  const domText = getTranslationTextFromNodes(sourceNodes, emojiTokens);

  if (domText) {
    return {
      text: cleanText(domText),
      emojiTokens
    };
  }

  const runs = getMessageRuns(message);

  if (Array.isArray(runs) && runs.length) {
    const emojiNodes = Array.from(getMessageTextElement(message)?.querySelectorAll('img') || []);
    let emojiNodeIndex = 0;
    const text = runs.map((run) => {
      if (run.text) return replaceUnicodeEmojisWithPlaceholders(run.text, emojiTokens);
      if (!run.emoji) return '';

      return createEmojiPlaceholderToken({
        emojiTokens,
        fallbackText: getEmojiTextFromRun(run),
        node: emojiNodes[emojiNodeIndex++] || null
      });
    }).join('');

    return {
      text: cleanText(text),
      emojiTokens
    };
  }

  return {
    text: cleanText(replaceUnicodeEmojisWithPlaceholders(originalText, emojiTokens)),
    emojiTokens
  };
}

export function restoreEmojiPlaceholdersToText(text: string, emojiTokens: EmojiToken[]): string {
  return createNodesWithEmojiPlaceholders(text, emojiTokens)
    .map((node) => node.textContent || (node instanceof Element ? node.getAttribute('alt') || '' : ''))
    .join('');
}

export function hasTextOutsideEmojiPlaceholders(text: string): boolean {
  EMOJI_PLACEHOLDER_PATTERN.lastIndex = 0;
  const withoutPlaceholders = String(text || '').replace(EMOJI_PLACEHOLDER_PATTERN, '');
  return Boolean(cleanText(withoutPlaceholders));
}

export function createNodesWithEmojiPlaceholders(text: string, emojiTokens: EmojiToken[]): Node[] {
  const nodes: Node[] = [];
  const source = removeLeakedEmojiShortcodes(String(text || ''), emojiTokens);
  let lastIndex = 0;
  const restoredTokenIndexes = new Set<number>();
  EMOJI_PLACEHOLDER_PATTERN.lastIndex = 0;

  for (let match = EMOJI_PLACEHOLDER_PATTERN.exec(source); match; match = EMOJI_PLACEHOLDER_PATTERN.exec(source)) {
    if (match.index > lastIndex) {
      nodes.push(document.createTextNode(source.slice(lastIndex, match.index)));
    }

    const tokenIndex = Number(match[1]);
    restoredTokenIndexes.add(tokenIndex);
    nodes.push(createEmojiTokenNode(emojiTokens[tokenIndex]));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    nodes.push(document.createTextNode(source.slice(lastIndex)));
  }

  emojiTokens.forEach((token, index) => {
    if (restoredTokenIndexes.has(index)) return;
    appendMissingEmojiToken(nodes, token);
  });

  return nodes.length ? nodes : [document.createTextNode(source)];
}

function getTranslationTextFromNodes(nodes: NodeListOf<ChildNode> | Node[] | undefined, emojiTokens: EmojiToken[]): string {
  if (!nodes?.length) return '';

  return Array.from(nodes)
    .map((node) => getTranslationTextFromNode(node, emojiTokens))
    .join('');
}

function getTranslationTextFromNode(node: Node, emojiTokens: EmojiToken[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return replaceUnicodeEmojisWithPlaceholders(node.textContent || '', emojiTokens);
  }

  if (!(node instanceof Element)) return '';
  if (node.classList.contains('ytcq-replaced-translation-icon')) return '';

  if (isEmojiElement(node)) {
    return createEmojiPlaceholderToken({
      emojiTokens,
      fallbackText: getEmojiTextFromElement(node),
      node
    });
  }

  return getTranslationTextFromNodes(node.childNodes, emojiTokens) ||
    replaceUnicodeEmojisWithPlaceholders(node.textContent || '', emojiTokens);
}

function isEmojiElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'img') return true;
  if (element.getAttribute('role') === 'img') return true;
  if (isEmojiLikeText(getEmojiTextFromElement(element))) return true;
  if (/\bemoji\b/i.test(`${element.id || ''} ${element.className || ''}`)) return true;
  return Boolean(element.querySelector(':scope > img:only-child')) &&
    !cleanText(element.textContent || '');
}

function getEmojiTextFromElement(element: Element): string {
  const image = element.matches('img') ? element : element.querySelector('img');
  return cleanText(
    image?.getAttribute('alt') ||
    image?.getAttribute('aria-label') ||
    element.getAttribute('aria-label') ||
    element.getAttribute('title') ||
    element.textContent ||
    ''
  );
}

function replaceUnicodeEmojisWithPlaceholders(text: string, emojiTokens: EmojiToken[]): string {
  return String(text || '').replace(UNICODE_EMOJI_PATTERN, (emojiText) => (
    createEmojiPlaceholderToken({
      emojiTokens,
      fallbackText: emojiText,
      node: null
    })
  ));
}

function createEmojiPlaceholderToken({
  emojiTokens,
  fallbackText,
  node
}: {
  emojiTokens: EmojiToken[];
  fallbackText: string;
  node: Element | Node | null;
}): string {
  const index = emojiTokens.length;
  const placeholder = `__YTCQ_EMOJI_${index}_TOKEN__`;
  emojiTokens.push({
    placeholder,
    fallbackText: fallbackText || '',
    node: node ? node.cloneNode(true) : null
  });
  return placeholder;
}

function removeLeakedEmojiShortcodes(text: string, emojiTokens: EmojiToken[]): string {
  if (!emojiTokens.length) return text;
  return text.replace(/(^|\s):[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)+:(?=\s|$)/gu, '$1');
}

function isEmojiLikeText(text: string): boolean {
  return /^:[^:\s][^:]*:$/.test(cleanText(text));
}

function appendMissingEmojiToken(nodes: Node[], token: EmojiToken): void {
  if (!token) return;
  const lastNode = nodes[nodes.length - 1];
  const lastText = lastNode?.nodeType === Node.TEXT_NODE ? lastNode.textContent || '' : '';

  if (lastNode && lastText && !/\s$/.test(lastText)) {
    nodes.push(document.createTextNode(' '));
  }

  nodes.push(createEmojiTokenNode(token));
}

function createEmojiTokenNode(token: EmojiToken | undefined): Node {
  if (token?.node) return token.node.cloneNode(true);
  return document.createTextNode(token?.fallbackText || '');
}
