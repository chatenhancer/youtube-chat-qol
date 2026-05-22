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
import { CHAT_TOOLTIP_SELECTOR } from '../../youtube/selectors';

export interface EmojiToken {
  placeholder: string;
  fallbackText: string;
  node: Node | null;
  nodes: Node[];
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
    const parts: string[] = [];
    const emojiRunNodes: Node[] = [];
    let emojiRunText = '';
    const pendingWhitespaceNodes: Node[] = [];
    let pendingWhitespaceText = '';

    const hasEmojiRun = (): boolean => Boolean(emojiRunText || emojiRunNodes.length);

    const movePendingWhitespaceToEmojiRun = (): void => {
      if (!pendingWhitespaceText && !pendingWhitespaceNodes.length) return;
      emojiRunText += pendingWhitespaceText;
      emojiRunNodes.push(...pendingWhitespaceNodes);
      pendingWhitespaceText = '';
      pendingWhitespaceNodes.length = 0;
    };

    const flushPendingWhitespaceToParts = (): void => {
      if (!pendingWhitespaceText) return;
      parts.push(pendingWhitespaceText);
      pendingWhitespaceText = '';
      pendingWhitespaceNodes.length = 0;
    };

    const flushEmojiRun = (): void => {
      if (!emojiRunText && !emojiRunNodes.length) return;
      parts.push(createEmojiPlaceholderToken({
        emojiTokens,
        fallbackText: emojiRunText,
        nodes: emojiRunNodes
      }));
      emojiRunText = '';
      emojiRunNodes.length = 0;
    };

    runs.forEach((run) => {
      if (run.text) {
        if (hasEmojiRun() && isWhitespaceOnly(run.text)) {
          pendingWhitespaceText += run.text;
          pendingWhitespaceNodes.push(document.createTextNode(run.text));
          return;
        }

        flushEmojiRun();
        flushPendingWhitespaceToParts();
        parts.push(replaceUnicodeEmojisWithPlaceholders(run.text, emojiTokens));
        return;
      }
      if (!run.emoji) {
        flushEmojiRun();
        flushPendingWhitespaceToParts();
        return;
      }

      movePendingWhitespaceToEmojiRun();
      emojiRunText += getEmojiTextFromRun(run);
      const emojiNode = emojiNodes[emojiNodeIndex++] || null;
      if (emojiNode) emojiRunNodes.push(emojiNode);
    });
    movePendingWhitespaceToEmojiRun();
    flushEmojiRun();
    flushPendingWhitespaceToParts();

    return {
      text: cleanText(parts.join('')),
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
    nodes.push(...createEmojiTokenNodes(emojiTokens[tokenIndex]));
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

  const parts: string[] = [];
  const emojiRunNodes: Node[] = [];
  let emojiRunText = '';
  const pendingWhitespaceNodes: Node[] = [];
  let pendingWhitespaceText = '';

  const hasEmojiRun = (): boolean => Boolean(emojiRunText || emojiRunNodes.length);

  const movePendingWhitespaceToEmojiRun = (): void => {
    if (!pendingWhitespaceText && !pendingWhitespaceNodes.length) return;
    emojiRunText += pendingWhitespaceText;
    emojiRunNodes.push(...pendingWhitespaceNodes);
    pendingWhitespaceText = '';
    pendingWhitespaceNodes.length = 0;
  };

  const flushPendingWhitespaceToParts = (): void => {
    if (!pendingWhitespaceText) return;
    parts.push(pendingWhitespaceText);
    pendingWhitespaceText = '';
    pendingWhitespaceNodes.length = 0;
  };

  const flushEmojiRun = (): void => {
    if (!emojiRunText && !emojiRunNodes.length) return;
    parts.push(createEmojiPlaceholderToken({
      emojiTokens,
      fallbackText: emojiRunText,
      nodes: emojiRunNodes
    }));
    emojiRunText = '';
    emojiRunNodes.length = 0;
  };

  Array.from(nodes).forEach((node) => {
    const emoji = getEmojiRunItem(node);
    if (emoji) {
      movePendingWhitespaceToEmojiRun();
      emojiRunText += emoji.fallbackText;
      emojiRunNodes.push(emoji.node);
      return;
    }

    if (node.nodeType === Node.TEXT_NODE && hasEmojiRun() && isWhitespaceOnly(node.textContent || '')) {
      pendingWhitespaceText += node.textContent || '';
      pendingWhitespaceNodes.push(node);
      return;
    }

    flushEmojiRun();
    flushPendingWhitespaceToParts();
    parts.push(getTranslationTextFromNode(node, emojiTokens));
  });
  movePendingWhitespaceToEmojiRun();
  flushEmojiRun();
  flushPendingWhitespaceToParts();

  return parts.join('');
}

function getTranslationTextFromNode(node: Node, emojiTokens: EmojiToken[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return replaceUnicodeEmojisWithPlaceholders(node.textContent || '', emojiTokens);
  }

  if (!(node instanceof Element)) return '';
  if (node.matches(CHAT_TOOLTIP_SELECTOR)) return '';
  if (node.classList.contains('ytcq-replaced-translation-icon')) return '';

  if (isEmojiElement(node)) {
    return createEmojiPlaceholderToken({
      emojiTokens,
      fallbackText: getEmojiTextFromElement(node),
      node
    });
  }

  const childText = getTranslationTextFromNodes(node.childNodes, emojiTokens);
  if (childText || node.childNodes.length) return childText;
  return replaceUnicodeEmojisWithPlaceholders(node.textContent || '', emojiTokens);
}

function getEmojiRunItem(node: Node): { fallbackText: string; node: Node } | null {
  if (!(node instanceof Element)) return null;
  if (!isEmojiElement(node)) return null;
  return {
    fallbackText: getEmojiTextFromElement(node),
    node
  };
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
  const source = String(text || '');
  let result = '';
  let lastIndex = 0;
  let emojiRunText = '';
  let pendingWhitespaceText = '';
  UNICODE_EMOJI_PATTERN.lastIndex = 0;

  const hasEmojiRun = (): boolean => Boolean(emojiRunText);

  const movePendingWhitespaceToEmojiRun = (): void => {
    if (!pendingWhitespaceText) return;
    emojiRunText += pendingWhitespaceText;
    pendingWhitespaceText = '';
  };

  const flushPendingWhitespaceToResult = (): void => {
    if (!pendingWhitespaceText) return;
    result += pendingWhitespaceText;
    pendingWhitespaceText = '';
  };

  const flushEmojiRun = (): void => {
    if (!emojiRunText) return;
    result += createEmojiPlaceholderToken({
      emojiTokens,
      fallbackText: emojiRunText,
      nodes: []
    });
    emojiRunText = '';
  };

  const appendTextGap = (gap: string): void => {
    if (!gap) return;
    if (hasEmojiRun() && isWhitespaceOnly(gap)) {
      pendingWhitespaceText += gap;
      return;
    }

    flushEmojiRun();
    flushPendingWhitespaceToResult();
    result += gap;
  };

  for (let match = UNICODE_EMOJI_PATTERN.exec(source); match; match = UNICODE_EMOJI_PATTERN.exec(source)) {
    if (match.index > lastIndex) {
      appendTextGap(source.slice(lastIndex, match.index));
    }

    movePendingWhitespaceToEmojiRun();
    emojiRunText += match[0];
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) appendTextGap(source.slice(lastIndex));
  movePendingWhitespaceToEmojiRun();
  flushEmojiRun();
  flushPendingWhitespaceToResult();

  return result;
}

function createEmojiPlaceholderToken({
  emojiTokens,
  fallbackText,
  node,
  nodes
}: {
  emojiTokens: EmojiToken[];
  fallbackText: string;
  node?: Element | Node | null;
  nodes?: Node[];
}): string {
  const index = emojiTokens.length;
  const placeholder = `__YTCQ_EMOJI_${index}_TOKEN__`;
  const tokenNodes = nodes?.length
    ? nodes.map((emojiNode) => emojiNode.cloneNode(true))
    : node
      ? [node.cloneNode(true)]
      : [];
  emojiTokens.push({
    placeholder,
    fallbackText: fallbackText || '',
    node: tokenNodes[0] || null,
    nodes: tokenNodes
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

function isWhitespaceOnly(text: string): boolean {
  return Boolean(text) && /^\s+$/u.test(text);
}

function appendMissingEmojiToken(nodes: Node[], token: EmojiToken): void {
  if (!token) return;
  const lastNode = nodes[nodes.length - 1];
  const lastText = lastNode?.nodeType === Node.TEXT_NODE ? lastNode.textContent || '' : '';

  if (lastNode && lastText && !/\s$/.test(lastText)) {
    nodes.push(document.createTextNode(' '));
  }

  nodes.push(...createEmojiTokenNodes(token));
}

function createEmojiTokenNodes(token: EmojiToken | undefined): Node[] {
  if (token?.nodes?.length) return token.nodes.map((node) => node.cloneNode(true));
  if (token?.node) return [token.node.cloneNode(true)];
  return [document.createTextNode(token?.fallbackText || '')];
}
