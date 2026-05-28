/**
 * Inbox highlight helpers.
 *
 * Applies mention and watched-keyword highlights to live chat renderers and
 * stored Inbox message rows without nesting duplicate highlight spans.
 */
import { getAuthorNameElement, getMessageTextElement } from '../../youtube/messages';
import type { InboxRecord, InlineHighlightMatch, InlineHighlightTerm } from './types';

export const CHAT_KEYWORD_HIGHLIGHT_CLASS = 'ytcq-chat-keyword-highlight';

export function highlightInboxMatches(root: HTMLElement, record: InboxRecord): void {
  highlightTerms(root, getHighlightTerms(record));
}

export function applyChatKeywordHighlights(
  message: HTMLElement,
  matchedKeywords: string[],
  nextHighlightKey: string
): void {
  const messageText = getMessageTextElement(message);
  const authorName = getAuthorNameElement(message);
  if (!messageText && !authorName) return;

  if (
    message.dataset.ytcqInboxKeywordHighlightKey === nextHighlightKey &&
    (
      matchedKeywords.length ||
      !message.querySelector(`:scope #message .${CHAT_KEYWORD_HIGHLIGHT_CLASS}, :scope #author-name .${CHAT_KEYWORD_HIGHLIGHT_CLASS}`)
    )
  ) {
    return;
  }

  message.dataset.ytcqInboxKeywordHighlighting = 'true';
  try {
    clearChatKeywordHighlights(message);
    if (!matchedKeywords.length) {
      message.dataset.ytcqInboxKeywordHighlightKey = '';
      return;
    }

    const terms = matchedKeywords.map((text) => ({
      className: CHAT_KEYWORD_HIGHLIGHT_CLASS,
      normalizedText: normalizeHighlightText(text),
      priority: 1,
      text
    }));
    if (messageText) highlightTerms(messageText, terms);
    if (authorName) highlightTerms(authorName, terms);
    message.dataset.ytcqInboxKeywordHighlightKey = nextHighlightKey;
  } finally {
    window.setTimeout(() => {
      delete message.dataset.ytcqInboxKeywordHighlighting;
    }, 0);
  }
}

export function clearChatKeywordHighlights(message: HTMLElement): void {
  [
    getMessageTextElement(message),
    getAuthorNameElement(message)
  ].forEach((root) => {
    root?.querySelectorAll<HTMLElement>(`.${CHAT_KEYWORD_HIGHLIGHT_CLASS}`).forEach((highlight) => {
      highlight.replaceWith(...Array.from(highlight.childNodes));
    });
    root?.normalize();
  });
}

export function highlightInboxAuthorMatches(root: HTMLElement, record: InboxRecord): void {
  highlightTerms(root, record.matchedKeywords.map((text) => ({
    className: 'ytcq-inbox-inline-highlight ytcq-inbox-keyword-highlight',
    normalizedText: normalizeHighlightText(text),
    priority: 1,
    text
  })));
}

function highlightTerms(root: HTMLElement, terms: InlineHighlightTerm[]): void {
  if (!terms.length) return;

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text && current.nodeValue) {
      textNodes.push(current);
    }
    current = walker.nextNode();
  }

  textNodes.forEach((node) => highlightTextNode(node, terms));
}

function highlightTextNode(node: Text, terms: InlineHighlightTerm[]): void {
  const text = node.nodeValue || '';
  const fragment = document.createDocumentFragment();
  let cursor = 0;

  while (cursor < text.length) {
    const match = findNextHighlightMatch(text, cursor, terms);
    if (!match) break;

    if (match.index > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    }

    const highlight = document.createElement('span');
    highlight.className = match.className;
    highlight.textContent = text.slice(match.index, match.index + match.length);
    fragment.append(highlight);
    cursor = match.index + match.length;
  }

  if (cursor === 0) return;
  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }
  node.replaceWith(fragment);
}

function findNextHighlightMatch(
  text: string,
  start: number,
  terms: InlineHighlightTerm[]
): InlineHighlightMatch | null {
  const lowerText = normalizeHighlightText(text);
  let best: InlineHighlightMatch | null = null;

  terms.forEach((term) => {
    const lowerTerm = term.normalizedText || normalizeHighlightText(term.text);
    if (!lowerTerm) return;

    const index = lowerText.indexOf(lowerTerm, start);
    if (index < 0) return;

    if (
      !best ||
      index < best.index ||
      (index === best.index && term.priority > best.priority) ||
      (index === best.index && term.priority === best.priority && term.text.length > best.length)
    ) {
      best = {
        className: term.className,
        index,
        length: term.text.length,
        priority: term.priority
      };
    }
  });

  return best;
}

function getHighlightTerms(record: InboxRecord): InlineHighlightTerm[] {
  return [
    ...record.mentionHandles.map((text) => ({
      className: 'ytcq-inbox-inline-highlight ytcq-inbox-mention-highlight',
      normalizedText: normalizeHighlightText(text),
      priority: 2,
      text
    })),
    ...record.matchedKeywords.map((text) => ({
      className: 'ytcq-inbox-inline-highlight ytcq-inbox-keyword-highlight',
      normalizedText: normalizeHighlightText(text),
      priority: 1,
      text
    }))
  ];
}

function normalizeHighlightText(text: string): string {
  return text.toLocaleLowerCase();
}
