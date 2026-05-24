/**
 * Translation placeholder planning.
 *
 * Google Translate often drops or distorts emoji/custom-emote text and can
 * translate @mentions as ordinary words. Before a request is queued, this
 * module replaces those protected message runs with stable placeholders, then
 * maps translated placeholders back to the original tokens during rendering.
 */
import { cleanText } from '../../shared/text';
import {
  getEmojiTextFromRun,
  getMessageRuns,
  getMessageTextElement,
  getStoredOriginalMessage
} from '../../youtube/messages';
import { isIgnoredMessageContentElement } from '../../youtube/message-content';

export interface ProtectedToken {
  placeholder: string;
  fallbackText: string;
  node: Node | null;
  nodes: Node[];
}

export interface TranslationPlan {
  text: string;
  protectedTokens: ProtectedToken[];
}

const PROTECTED_PLACEHOLDER_PATTERN = /_{0,2}\s*YTCQ[\s_-]*TOKEN[\s_-]*(\d+)[\s_-]*PLACEHOLDER\s*_{0,2}/gi;
const MENTION_PATTERN = /(^|[^\p{L}\p{N}_])(@[\p{L}\p{N}_][^\s@]*)/gu;
const MENTION_TRAILING_PUNCTUATION_PATTERN = /[),.!?;:'"’”\]]+$/u;
const UNICODE_EMOJI_PATTERN = /\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D\p{Extended_Pictographic}(?:[\uFE0E\uFE0F]|[\u{1F3FB}-\u{1F3FF}])?)*/gu;

export function createTranslationPlan(message: HTMLElement, originalText: string): TranslationPlan {
  const protectedTokens: ProtectedToken[] = [];
  const messageText = getMessageTextElement(message);
  const original = getStoredOriginalMessage(message);
  const sourceNodes = original?.childNodes || messageText?.childNodes;
  const domText = getTranslationTextFromNodes(sourceNodes, protectedTokens);

  if (domText) {
    return {
      text: cleanText(domText),
      protectedTokens
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
      parts.push(createProtectedPlaceholderToken({
        protectedTokens,
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
        parts.push(replaceProtectedTextWithPlaceholders(run.text, protectedTokens));
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
      protectedTokens
    };
  }

  return {
    text: cleanText(replaceProtectedTextWithPlaceholders(originalText, protectedTokens)),
    protectedTokens
  };
}

export function restorePlaceholdersToText(text: string, protectedTokens: ProtectedToken[]): string {
  return createNodesWithPlaceholders(text, protectedTokens)
    .map((node) => node.textContent || (node instanceof Element ? node.getAttribute('alt') || '' : ''))
    .join('');
}

export function hasTextOutsidePlaceholders(text: string): boolean {
  PROTECTED_PLACEHOLDER_PATTERN.lastIndex = 0;
  const withoutPlaceholders = String(text || '').replace(PROTECTED_PLACEHOLDER_PATTERN, '');
  return Boolean(cleanText(withoutPlaceholders));
}

export function createNodesWithPlaceholders(text: string, protectedTokens: ProtectedToken[]): Node[] {
  const nodes: Node[] = [];
  const source = removeLeakedEmojiShortcodes(String(text || ''), protectedTokens);
  let lastIndex = 0;
  const restoredTokenIndexes = new Set<number>();
  PROTECTED_PLACEHOLDER_PATTERN.lastIndex = 0;

  for (let match = PROTECTED_PLACEHOLDER_PATTERN.exec(source); match; match = PROTECTED_PLACEHOLDER_PATTERN.exec(source)) {
    if (match.index > lastIndex) {
      nodes.push(document.createTextNode(source.slice(lastIndex, match.index)));
    }

    const tokenIndex = Number(match[1]);
    restoredTokenIndexes.add(tokenIndex);
    nodes.push(...createProtectedTokenNodes(protectedTokens[tokenIndex]));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < source.length) {
    nodes.push(document.createTextNode(source.slice(lastIndex)));
  }

  protectedTokens.forEach((token, index) => {
    if (restoredTokenIndexes.has(index)) return;
    appendMissingProtectedToken(nodes, token);
  });

  return nodes.length ? nodes : [document.createTextNode(source)];
}

function getTranslationTextFromNodes(nodes: NodeListOf<ChildNode> | Node[] | undefined, protectedTokens: ProtectedToken[]): string {
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
    parts.push(createProtectedPlaceholderToken({
      protectedTokens,
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
    parts.push(getTranslationTextFromNode(node, protectedTokens));
  });
  movePendingWhitespaceToEmojiRun();
  flushEmojiRun();
  flushPendingWhitespaceToParts();

  return parts.join('');
}

function getTranslationTextFromNode(node: Node, protectedTokens: ProtectedToken[]): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return replaceProtectedTextWithPlaceholders(node.textContent || '', protectedTokens);
  }

  if (!(node instanceof Element)) return '';
  if (isIgnoredMessageContentElement(node)) return '';
  if (node.classList.contains('ytcq-replaced-translation-icon')) return '';

  if (isEmojiElement(node)) {
    return createProtectedPlaceholderToken({
      protectedTokens,
      fallbackText: getEmojiTextFromElement(node),
      node
    });
  }

  const childText = getTranslationTextFromNodes(node.childNodes, protectedTokens);
  if (childText || node.childNodes.length) return childText;
  return replaceProtectedTextWithPlaceholders(node.textContent || '', protectedTokens);
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

function replaceProtectedTextWithPlaceholders(text: string, protectedTokens: ProtectedToken[]): string {
  return replaceUnicodeEmojisWithPlaceholders(
    replaceMentionsWithPlaceholders(text, protectedTokens),
    protectedTokens
  );
}

function replaceMentionsWithPlaceholders(text: string, protectedTokens: ProtectedToken[]): string {
  return String(text || '').replace(MENTION_PATTERN, (_match, prefix: string, rawMention: string) => {
    const { mention, suffix } = splitMentionSuffix(rawMention);
    if (!mention) return `${prefix}${rawMention}`;

    return `${prefix}${createProtectedPlaceholderToken({
      protectedTokens,
      fallbackText: mention,
      nodes: [document.createTextNode(mention)]
    })}${suffix}`;
  });
}

function splitMentionSuffix(rawMention: string): { mention: string; suffix: string } {
  let mention = rawMention;
  let suffix = '';

  while (mention.length > 1 && MENTION_TRAILING_PUNCTUATION_PATTERN.test(mention)) {
    suffix = `${mention.slice(-1)}${suffix}`;
    mention = mention.slice(0, -1);
  }

  return {
    mention,
    suffix
  };
}

function replaceUnicodeEmojisWithPlaceholders(text: string, protectedTokens: ProtectedToken[]): string {
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
    result += createProtectedPlaceholderToken({
      protectedTokens,
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

function createProtectedPlaceholderToken({
  protectedTokens,
  fallbackText,
  node,
  nodes
}: {
  protectedTokens: ProtectedToken[];
  fallbackText: string;
  node?: Element | Node | null;
  nodes?: Node[];
}): string {
  const index = protectedTokens.length;
  const placeholder = `__YTCQ_TOKEN_${index}_PLACEHOLDER__`;
  const tokenNodes = nodes?.length
    ? nodes.map((emojiNode) => emojiNode.cloneNode(true))
    : node
      ? [node.cloneNode(true)]
      : [];
  protectedTokens.push({
    placeholder,
    fallbackText: fallbackText || '',
    node: tokenNodes[0] || null,
    nodes: tokenNodes
  });
  return placeholder;
}

function removeLeakedEmojiShortcodes(text: string, protectedTokens: ProtectedToken[]): string {
  if (!protectedTokens.length) return text;
  return text.replace(/(^|\s):[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)+:(?=\s|$)/gu, '$1');
}

function isEmojiLikeText(text: string): boolean {
  return /^:[^:\s][^:]*:$/.test(cleanText(text));
}

function isWhitespaceOnly(text: string): boolean {
  return Boolean(text) && /^\s+$/u.test(text);
}

function appendMissingProtectedToken(nodes: Node[], token: ProtectedToken): void {
  if (!token) return;
  const lastNode = nodes[nodes.length - 1];
  const lastText = lastNode?.nodeType === Node.TEXT_NODE ? lastNode.textContent || '' : '';

  if (lastNode && lastText && !/\s$/.test(lastText)) {
    nodes.push(document.createTextNode(' '));
  }

  nodes.push(...createProtectedTokenNodes(token));
}

function createProtectedTokenNodes(token: ProtectedToken | undefined): Node[] {
  if (token?.nodes?.length) return token.nodes.map((node) => node.cloneNode(true));
  if (token?.node) return [token.node.cloneNode(true)];
  return [document.createTextNode(token?.fallbackText || '')];
}
