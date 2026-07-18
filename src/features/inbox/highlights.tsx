/**
 * Inbox highlight helpers.
 *
 * Applies mention and watched-keyword highlights to live chat renderers and
 * stored Inbox message rows without nesting duplicate highlight spans.
 */
import { getAuthorNameElement, getMessageTextElement } from '../../youtube/messages';
import { jsx, el } from '../../shared/jsx-dom';
import { findMentionTokens, PRESERVED_MENTION_TOKEN_CLASS } from '../../shared/mention-tokens';
import { normalizeComparableText } from '../../shared/text';
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

  const hasCurrentHighlights = Boolean(
    message.querySelector(
      `:scope #message .${CHAT_KEYWORD_HIGHLIGHT_CLASS}, :scope #author-name .${CHAT_KEYWORD_HIGHLIGHT_CLASS}`
    )
  );
  if (
    message.dataset.ytcqInboxKeywordHighlightKey === nextHighlightKey &&
    (matchedKeywords.length ? hasCurrentHighlights : !hasCurrentHighlights)
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
    if (messageText) highlightTerms(messageText, terms, true);
    if (authorName) highlightTerms(authorName, terms);
    message.dataset.ytcqInboxKeywordHighlightKey = nextHighlightKey;
  } finally {
    window.setTimeout(() => {
      delete message.dataset.ytcqInboxKeywordHighlighting;
    }, 0);
  }
}

export function clearChatKeywordHighlights(message: HTMLElement): void {
  [getMessageTextElement(message), getAuthorNameElement(message)].forEach((root) => {
    root?.querySelectorAll<HTMLElement>(`.${CHAT_KEYWORD_HIGHLIGHT_CLASS}`).forEach((highlight) => {
      highlight.replaceWith(...Array.from(highlight.childNodes));
    });
    root?.querySelectorAll<HTMLElement>(`.${PRESERVED_MENTION_TOKEN_CLASS}`).forEach((token) => {
      if (token.dataset.ytcqProfileMention) {
        token.classList.remove(PRESERVED_MENTION_TOKEN_CLASS);
        return;
      }
      token.replaceWith(...Array.from(token.childNodes));
    });
    root?.normalize();
  });
}

export function highlightInboxAuthorMatches(root: HTMLElement, record: InboxRecord): void {
  highlightTerms(
    root,
    record.matchedKeywords.map((text) => ({
      className: 'ytcq-inbox-inline-highlight ytcq-inbox-keyword-highlight',
      normalizedText: normalizeHighlightText(text),
      priority: 1,
      text
    }))
  );
}

function highlightTerms(
  root: HTMLElement,
  terms: InlineHighlightTerm[],
  preserveMentionTokens = false
): void {
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

  textNodes.forEach((node) => highlightTextNode(node, terms, preserveMentionTokens));
}

function highlightTextNode(
  node: Text,
  terms: InlineHighlightTerm[],
  preserveMentionTokens: boolean
): void {
  const text = node.nodeValue || '';
  const matches = getHighlightMatches(text, terms);
  if (!matches.length) return;

  const fragment = document.createDocumentFragment();
  const preservedTokens =
    preserveMentionTokens && !node.parentElement?.closest('[data-ytcq-profile-mention]')
      ? findMentionTokens(text).filter((token) => {
          const tokenEnd = token.index + token.text.length;
          return matches.some((match) => {
            const matchEnd = match.index + match.length;
            return match.index < tokenEnd && matchEnd > token.index;
          });
        })
      : [];
  let cursor = 0;

  preservedTokens.forEach((token) => {
    appendHighlightedText(fragment, text, cursor, token.index, matches);
    const preservedToken = el<HTMLSpanElement>(<span class={PRESERVED_MENTION_TOKEN_CLASS} />);
    const tokenEnd = token.index + token.text.length;
    appendHighlightedText(preservedToken, text, token.index, tokenEnd, matches);
    fragment.append(preservedToken);
    cursor = tokenEnd;
  });

  appendHighlightedText(fragment, text, cursor, text.length, matches);
  node.replaceWith(fragment);
}

function getHighlightMatches(text: string, terms: InlineHighlightTerm[]): InlineHighlightMatch[] {
  const matches: InlineHighlightMatch[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const match = findNextHighlightMatch(text, cursor, terms);
    if (!match) break;
    matches.push(match);
    cursor = match.index + match.length;
  }
  return matches;
}

function appendHighlightedText(
  container: DocumentFragment | HTMLElement,
  text: string,
  start: number,
  end: number,
  matches: InlineHighlightMatch[]
): void {
  let cursor = start;
  matches.forEach((match) => {
    const highlightStart = Math.max(cursor, start, match.index);
    const highlightEnd = Math.min(end, match.index + match.length);
    if (highlightStart >= highlightEnd) return;

    if (highlightStart > cursor) {
      container.append(document.createTextNode(text.slice(cursor, highlightStart)));
    }
    container.append(
      el<HTMLSpanElement>(
        <span class={match.className}>{text.slice(highlightStart, highlightEnd)}</span>
      )
    );
    cursor = highlightEnd;
  });

  if (cursor < end) container.append(document.createTextNode(text.slice(cursor, end)));
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
  return normalizeComparableText(text);
}
