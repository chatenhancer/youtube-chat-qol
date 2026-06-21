/**
 * YouTube author-name cleanup helpers.
 *
 * Badge and tooltip DOM can live inside YouTube's author-name element, so
 * author extraction must prefer the visible handle and sanitize fallback text
 * before it reaches mentions, profile cards, or channel URLs.
 */
import { cleanText } from '../shared/text';
import { isExtensionManagedElement } from '../shared/managed-dom';

interface RendererAuthorText {
  simpleText?: string;
  runs?: { text?: string }[];
}

const AUTHOR_HANDLE_PATTERN = /^@[^\s]+/;

export function getAuthorNameFromRendererText(text: RendererAuthorText | null | undefined): string {
  return cleanAuthorNameText(
    text?.simpleText ||
    text?.runs?.map((run) => run.text || '').join('') ||
    ''
  );
}

export function getAuthorNameFromElement(element: Element | null): string {
  if (!element) return '';

  return cleanAuthorNameText(getDirectOrManagedTextFromElement(element)) ||
    cleanAuthorNameText(getVisibleTextFromElement(element)) ||
    cleanAuthorNameText(element.textContent);
}

export function cleanAuthorNameText(text: unknown): string {
  const clean = cleanText(text);
  if (!clean) return '';

  const handleMatch = clean.match(AUTHOR_HANDLE_PATTERN);
  if (handleMatch) return handleMatch[0];

  return clean;
}

export function getAuthorHandleForUrl(authorName: string): string {
  const cleanAuthorName = cleanAuthorNameText(authorName);
  const handleMatch = cleanAuthorName.match(AUTHOR_HANDLE_PATTERN);
  return handleMatch?.[0] || '';
}

function getDirectOrManagedTextFromElement(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node instanceof Element && isExtensionManagedElement(node)) return node.textContent || '';
      return '';
    })
    .join('');
}

function getVisibleTextFromElement(element: Element): string {
  return element instanceof HTMLElement ? element.innerText : '';
}
